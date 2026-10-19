-- Temporary friends-and-family mode. Set shared_building_code to NULL to allow
-- separate buildings again; room identities, keys, furniture and history survive.
create table if not exists flats_private.community_settings (
  id boolean primary key default true check (id),
  shared_building_code text references flats_private.groups(code)
);
alter table flats_private.community_settings enable row level security;
revoke all on flats_private.community_settings from public,anon,authenticated;
insert into flats_private.community_settings(id,shared_building_code)
  select true,code from flats_private.groups where code='F5D912'
  on conflict(id) do nothing;

-- Keep the original membership available for an administrator to reverse the move.
create table if not exists flats_private.community_original_membership (
  player_id uuid primary key references flats_private.players(id) on delete cascade,
  group_code text not null references flats_private.groups(code)
);
alter table flats_private.community_original_membership enable row level security;
revoke all on flats_private.community_original_membership from public,anon,authenticated;
insert into flats_private.community_original_membership(player_id,group_code)
  select id,group_code from flats_private.players
  where (select shared_building_code from flats_private.community_settings where id) is not null
  on conflict(player_id) do nothing;
update flats_private.players set group_code=s.shared_building_code
  from flats_private.community_settings s
  where s.id and s.shared_building_code is not null and group_code<>s.shared_building_code;

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
  select shared_building_code into v_code from flats_private.community_settings where id;
  if v_code is not null then
    -- The family preview has one shared home, including clients with old invites.
    null;
  elsif p_group_code is not null then
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

create or replace function public.flats_fetch_group(p_player_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p flats_private.players; result jsonb; shared_code text;
begin
  p:=flats_private.authorize(p_player_id,p_token);
  select shared_building_code into shared_code from flats_private.community_settings where id;
  if shared_code is not null and p.group_code <> shared_code then
    update flats_private.players set group_code=shared_code where id=p.id returning * into p;
  end if;
  select jsonb_build_object('group',jsonb_build_object('code',g.code,'name',g.name,'memberIds',
    (select coalesce(jsonb_agg(id order by created_at,id),'[]') from flats_private.players where group_code=g.code and deleted_at is null)),
    'players',(select coalesce(jsonb_agg(profile order by created_at,id),'[]') from flats_private.players where group_code=g.code and deleted_at is null),
    'reactions',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('from',r.sender,'to',r.recipient,'kind',r.kind,'day',r.day,
      'at',floor(extract(epoch from r.created_at)*1000),'variant',r.variant)) order by r.created_at),'[]')
      from flats_private.reactions r join flats_private.players a on a.id=r.sender join flats_private.players b on b.id=r.recipient
      where a.group_code=g.code and b.group_code=g.code and a.deleted_at is null and b.deleted_at is null and r.day>=current_date-35))
  into result from flats_private.groups g where g.code=p.group_code;
  return result;
end $$;

-- Old invite screens also show the shared destination.
create or replace function public.flats_group_name(p_code text)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(
    (select g.name from flats_private.community_settings s join flats_private.groups g on g.code=s.shared_building_code where s.id),
    (select coalesce(destination.name,g.name) from flats_private.groups g
      left join flats_private.groups destination on destination.code=g.redirect_code
      where g.code=upper(regexp_replace(p_code,'[^a-zA-Z0-9]','','g')))
  );
$$;

create or replace function public.flats_default_building()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('code',g.code,'name',g.name)
    from flats_private.community_settings s join flats_private.groups g on g.code=s.shared_building_code where s.id;
$$;
revoke all on function public.flats_default_building() from public;
grant execute on function public.flats_default_building() to anon,authenticated;
notify pgrst,'reload schema';
