-- Room history is separate from live profiles so the building stays lightweight.
create table if not exists flats_private.room_history (
  id bigint generated always as identity primary key,
  player_id uuid not null references flats_private.players(id) on delete cascade,
  recorded_at timestamptz not null default clock_timestamp(),
  day date not null,
  kind text not null,
  approximate boolean not null default false,
  profile jsonb not null
);
create index if not exists room_history_player_id on flats_private.room_history(player_id,id);
alter table flats_private.room_history enable row level security;
revoke all on flats_private.room_history from public,anon,authenticated;

-- Backfill is deliberately conservative: keep only currently placed items that had
-- been unlocked by that date. Old positions and surface choices are unknowable.
create or replace function flats_private.seed_room_history(p_id uuid,p jsonb)
returns void language plpgsql set search_path=pg_catalog as $$
declare d date; first_day date; state jsonb; earned jsonb; exercised jsonb; room jsonb; placed jsonb;
begin
  if exists(select 1 from flats_private.room_history where player_id=p_id) then return; end if;
  select min(value::date) into first_day from (
    select p->>'createdDay' as value
    union all select w->>'day' from jsonb_array_elements(p->'workouts') w
    union all select u->>'day' from jsonb_array_elements(p->'unlocks') u
  ) dates;
  state:=p||jsonb_build_object('workouts','[]'::jsonb,'unlocks','[]'::jsonb,'layout',
    jsonb_build_object('slots','{}'::jsonb,'wallpaper','plain-paper','flooring','bare-boards'));
  insert into flats_private.room_history(player_id,day,kind,approximate,profile)
    values(p_id,first_day,'beginning',true,state);
  for d in select distinct value::date from (
    select w->>'day' as value from jsonb_array_elements(p->'workouts') w
    union all select u->>'day' from jsonb_array_elements(p->'unlocks') u
  ) dates order by 1 loop
    select coalesce(jsonb_agg(u order by n),'[]'::jsonb) into earned
      from jsonb_array_elements(p->'unlocks') with ordinality x(u,n) where (u->>'day')::date<=d;
    select coalesce(jsonb_agg(w order by n),'[]'::jsonb) into exercised
      from jsonb_array_elements(p->'workouts') with ordinality x(w,n) where (w->>'day')::date<=d;
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into placed from jsonb_each(p->'layout'->'slots')
      where exists(select 1 from jsonb_array_elements(earned) u where u->>'id'=value->>'itemId');
    room:=jsonb_build_object('slots',placed,
      'wallpaper',case when exists(select 1 from jsonb_array_elements(earned) u where u->>'id'=p->'layout'->>'wallpaper') then p->'layout'->>'wallpaper' else 'plain-paper' end,
      'flooring',case when exists(select 1 from jsonb_array_elements(earned) u where u->>'id'=p->'layout'->>'flooring') then p->'layout'->>'flooring' else 'bare-boards' end);
    state:=p||jsonb_build_object('workouts',exercised,'unlocks',earned,'layout',room);
    insert into flats_private.room_history(player_id,day,kind,approximate,profile) values(p_id,d,'reconstructed',true,state);
  end loop;
  insert into flats_private.room_history(player_id,day,kind,profile) values(p_id,current_date,'recording_started',p);
end $$;
revoke all on function flats_private.seed_room_history(uuid,jsonb) from public,anon,authenticated;

-- Capture changes in the same transaction as saving, including from older clients.
create or replace function flats_private.capture_room_history()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare event_kind text;
begin
  if new.deleted_at is not null then
    delete from flats_private.room_history where player_id=new.id;
    return new;
  end if;
  if tg_op='INSERT' then
    if jsonb_array_length(new.profile->'workouts')>0 then
      perform flats_private.seed_room_history(new.id,new.profile);
    else
      insert into flats_private.room_history(player_id,day,kind,profile) values(new.id,current_date,'moved_in',new.profile);
    end if;
  elsif old.profile is distinct from new.profile then
    event_kind:=case
      when old.profile->'layout' is distinct from new.profile->'layout' then 'decorated'
      when old.profile->'unlocks' is distinct from new.profile->'unlocks' then 'unpacked'
      when jsonb_array_length(new.profile->'workouts')>jsonb_array_length(old.profile->'workouts') then 'workout'
      else 'updated' end;
    insert into flats_private.room_history(player_id,day,kind,profile) values(new.id,current_date,event_kind,new.profile);
  end if;
  return new;
end $$;
revoke all on function flats_private.capture_room_history() from public,anon,authenticated;

-- Serialize the initial baseline with ongoing saves: nothing can fall in the gap.
lock table flats_private.players in share row exclusive mode;
select flats_private.seed_room_history(id,profile) from flats_private.players where deleted_at is null;
drop trigger if exists capture_room_history on flats_private.players;
create trigger capture_room_history after insert or update of profile,deleted_at on flats_private.players
  for each row execute function flats_private.capture_room_history();

-- Same capability authentication and building boundary as visiting a room.
-- Page by identity, not historical day: late workout entries never rewrite history.
create or replace function public.flats_room_history(p_player_id uuid,p_token text,p_target uuid,p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare viewer flats_private.players; result jsonb;
begin
  viewer:=flats_private.authorize(p_player_id,p_token);
  if not exists(select 1 from flats_private.players where id=p_target and group_code=viewer.group_code and deleted_at is null)
    then raise exception 'That flat is not in your building.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'recordedAt',recorded_at,'day',day,
    'kind',kind,'approximate',approximate,'player',profile) order by id),'[]'::jsonb) into result
    from (select * from flats_private.room_history where player_id=p_target and id>p_after order by id limit 250) page;
  return result;
end $$;
revoke all on function public.flats_room_history(uuid,text,uuid,bigint) from public;
grant execute on function public.flats_room_history(uuid,text,uuid,bigint) to anon,authenticated;
