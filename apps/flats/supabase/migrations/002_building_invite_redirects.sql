-- Preserve shared invites when an administrator consolidates duplicate buildings.
alter table flats_private.groups add column if not exists redirect_code text references flats_private.groups(code) check (redirect_code <> code);

create or replace function public.flats_create_player(p_id uuid,p_token text,p_name text,p_pet_kind text,p_pet_name text,p_day date,p_group_code text default null,p_import jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_code text; profile jsonb; existing flats_private.players; w jsonb; u jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'A room key is required.';end if;
  -- Serialize retries of the same move-in, even across overlapping requests.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into existing from flats_private.players where id=p_id;
  if found then
    existing:=flats_private.authorize(p_id,p_token);
    return jsonb_build_object('playerId',p_id,'groupCode',existing.group_code);
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 20 or p_pet_name is null or length(trim(p_pet_name)) not between 1 and 16
    or p_pet_kind is null or p_pet_kind not in ('cat','dog','bunny','frog','duck') then raise exception 'Choose a name and a pet first.';end if;
  if p_day is null or p_day not between current_date-1 and current_date+1 then raise exception 'Please check your device date.';end if;
  if p_group_code is not null then
    v_code:=upper(regexp_replace(p_group_code,'[^a-zA-Z0-9]','','g'));
    select coalesce(redirect_code,code) into v_code from flats_private.groups where code=v_code;
    if v_code is null then raise exception 'No building has that invite code.';end if;
  else
    loop
      v_code:=upper(substr(encode(extensions.gen_random_bytes(5),'hex'),1,6));
      begin
        insert into flats_private.groups(code,name) values(v_code,trim(p_name)||'''s building');exit;
      exception when unique_violation then null;end;
    end loop;
  end if;
  profile:=jsonb_build_object('id',p_id,'name',trim(p_name),'petKind',p_pet_kind,'petName',trim(p_pet_name),'createdDay',p_day,
    'workouts','[]'::jsonb,'unlocks','[]'::jsonb,'layout',jsonb_build_object('slots','{}'::jsonb,'wallpaper','plain-paper','flooring','bare-boards'));
  if p_import is not null then
    if jsonb_typeof(p_import->'workouts') is distinct from 'array' or jsonb_typeof(p_import->'unlocks') is distinct from 'array'
      or jsonb_array_length(p_import->'workouts')>5000 or jsonb_array_length(p_import->'unlocks')>jsonb_array_length(p_import->'workouts')
      then raise exception 'This saved flat could not be moved online.';end if;
    for w in select value from jsonb_array_elements(p_import->'workouts') loop
      if (w->>'day') is null or (w->>'day')::date>current_date+1 or (w->>'day')::date<date '2020-01-01'
        or (w ? 'type' and w->>'type' not in ('run','walk','gym','yoga','swim','dance','other')) then raise exception 'Invalid saved workout.';end if;
    end loop;
    if (select count(distinct value->>'day') from jsonb_array_elements(p_import->'workouts'))<>jsonb_array_length(p_import->'workouts')
      or (select count(distinct value->>'id') from jsonb_array_elements(p_import->'unlocks'))<>jsonb_array_length(p_import->'unlocks') then raise exception 'Duplicate saved entries.';end if;
    for u in select value from jsonb_array_elements(p_import->'unlocks') loop
      if not exists(select 1 from flats_private.catalog where id=u->>'id') or (u->>'atWorkout') is null
        or (u->>'atWorkout')::integer not between 0 and jsonb_array_length(p_import->'workouts')
        or (u->>'day') is null or (u->>'day')::date>current_date+1 then raise exception 'Invalid saved present.';end if;
    end loop;
    profile:=profile||jsonb_build_object('workouts',p_import->'workouts','unlocks',p_import->'unlocks','layout',p_import->'layout',
      'createdDay',coalesce(p_import->>'createdDay',p_day::text));
  end if;
  perform flats_private.validate_layout(profile,profile->'layout');
  insert into flats_private.players(id,group_code,token_hash,profile) values(p_id,v_code,extensions.digest(p_token,'sha256'),profile);
  return jsonb_build_object('playerId',p_id,'groupCode',v_code);
end $$;

create or replace function public.flats_group_name(p_code text)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(destination.name,g.name) from flats_private.groups g
    left join flats_private.groups destination on destination.code=g.redirect_code
    where g.code=upper(regexp_replace(p_code,'[^a-zA-Z0-9]','','g'));
$$;
