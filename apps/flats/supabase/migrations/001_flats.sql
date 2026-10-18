-- Capability-authenticated game API. Browser keys never grant direct table access.
create schema if not exists flats_private;
revoke all on schema flats_private from public, anon, authenticated;
create extension if not exists pgcrypto with schema extensions;

create table if not exists flats_private.groups (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists flats_private.players (
  id uuid primary key,
  group_code text not null references flats_private.groups(code),
  token_hash bytea not null,
  profile jsonb not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists players_group on flats_private.players(group_code);
create table if not exists flats_private.reactions (
  sender uuid not null references flats_private.players(id),
  recipient uuid not null references flats_private.players(id),
  kind text not null check (kind in ('heart','sticker','treat')),
  day date not null,
  variant integer check (variant between 0 and 20),
  created_at timestamptz not null default clock_timestamp(),
  primary key (sender, recipient, kind, day),
  check (sender <> recipient)
);
create index if not exists reactions_recipient on flats_private.reactions(recipient,day);
create table if not exists flats_private.catalog (id text primary key, ordinal integer not null, data jsonb not null);
create table if not exists flats_private.slots (id text primary key, zone text not null, capacity integer not null);
create table if not exists flats_private.admin (id boolean primary key default true check(id), token_hash bytea not null);
alter table flats_private.groups enable row level security;
alter table flats_private.players enable row level security;
alter table flats_private.reactions enable row level security;
alter table flats_private.catalog enable row level security;
alter table flats_private.slots enable row level security;
alter table flats_private.admin enable row level security;
revoke all on all tables in schema flats_private from public, anon, authenticated;

create or replace function flats_private.authorize(p_id uuid, p_token text)
returns flats_private.players language plpgsql set search_path = pg_catalog as $$
declare p flats_private.players;
begin
  select * into p from flats_private.players where id=p_id and deleted_at is null
    and token_hash=extensions.digest(p_token,'sha256');
  if not found then raise exception using errcode='P0002', message='This flat is no longer available.'; end if;
  return p;
end $$;

-- Match the game's deterministic mulberry32 draws, including their shuffle order.
create or replace function flats_private.rng(s bigint)
returns bigint[] language plpgsql immutable set search_path=pg_catalog as $$
declare m bigint;
begin
  s := (s+1831565813) & 4294967295;
  m := mod(((s # (s >> 15))::numeric * (s | 1)),4294967296)::bigint;
  m := (m # ((m + mod(((m # (m >> 7))::numeric * (m | 61)),4294967296)::bigint) & 4294967295)) & 4294967295;
  return array[s,(m # (m >> 14)) & 4294967295];
end $$;
create or replace function flats_private.shuffle(values_in text[], state_in bigint)
returns table (items text[], state bigint) language plpgsql immutable set search_path=pg_catalog as $$
declare i integer; j integer; r bigint[]; swap text;
begin
  items:=values_in; state:=state_in;
  if cardinality(items)>1 then
    for i in reverse cardinality(items)..2 loop
      r:=flats_private.rng(state); state:=r[1]; j:=floor(r[2]::numeric/4294967296*i)::integer+1;
      swap:=items[i];items[i]:=items[j];items[j]:=swap;
    end loop;
  end if;
  return next;
end $$;
create or replace function flats_private.take(candidates text[], picks_in text[], state_in bigint)
returns table (picks text[], state bigint) language plpgsql immutable set search_path=pg_catalog as $$
declare fresh text[]; r bigint[];
begin
  picks:=picks_in;state:=state_in;
  select coalesce(array_agg(x),array[]::text[]) into fresh from unnest(candidates) x where not x=any(picks);
  if cardinality(fresh)>0 and cardinality(picks)<3 then
    r:=flats_private.rng(state);state:=r[1];picks:=picks||fresh[floor(r[2]::numeric/4294967296*cardinality(fresh))::integer+1];
  end if;
  return next;
end $$;
create or replace function flats_private.choices(p jsonb, d date)
returns text[] language plpgsql stable set search_path=pg_catalog as $$
declare
  seed text:=(p->>'id')||':'||jsonb_array_length(p->'unlocks')||':'||extract(month from d)::integer;
  state bigint:=2166136261; r bigint[]; i integer; tier integer; ordinal integer;
  standard text[]; seasonal text[]; surprise text[]; eligible text[]; higher text[]; fallback text[];
  picks text[]:=array[]::text[]; candidates text[]; choice text;
begin
  for i in 1..length(seed) loop state:=mod(((state # ascii(substr(seed,i,1)))::numeric*16777619),4294967296)::bigint;end loop;
  with workouts as (
    select value->>'day' as day,row_number() over(partition by date_trunc('week',(value->>'day')::date) order by value->>'day') as n
    from jsonb_array_elements(p->'workouts')
  ) select n into ordinal from workouts order by day offset jsonb_array_length(p->'unlocks') limit 1;
  if ordinal is null then return picks;end if;
  tier:=case when ordinal>=4 then 3 when ordinal>=2 then 2 else 1 end;
  select
    coalesce(array_agg(id order by c.ordinal) filter(where data->>'rarity'='standard'),array[]::text[]),
    coalesce(array_agg(id order by c.ordinal) filter(where data->>'rarity'='seasonal' and
      case when (data#>>'{season,from}')::integer <= (data#>>'{season,to}')::integer
      then extract(month from d) between (data#>>'{season,from}')::integer and (data#>>'{season,to}')::integer
      else extract(month from d)>=(data#>>'{season,from}')::integer or extract(month from d)<=(data#>>'{season,to}')::integer end),array[]::text[]),
    coalesce(array_agg(id order by c.ordinal) filter(where data->>'rarity'='surprise'),array[]::text[]),
    coalesce(array_agg(id order by c.ordinal) filter(where data->>'rarity'='standard' and (data->>'tier')::integer<=tier),array[]::text[]),
    coalesce(array_agg(id order by c.ordinal) filter(where data->>'rarity'='standard' and (data->>'tier')::integer>tier),array[]::text[])
  into standard,seasonal,surprise,eligible,higher from flats_private.catalog c
  where not exists(select 1 from jsonb_array_elements(p->'unlocks') u where u->>'id'=c.id);
  r:=flats_private.rng(state);state:=r[1];
  if r[2]::numeric/4294967296<0.55 then select t.picks,t.state into picks,state from flats_private.take(seasonal,picks,state) t;end if;
  r:=flats_private.rng(state);state:=r[1];
  if r[2]::numeric/4294967296<(case when tier=3 then 0.3 else 0.12 end) then
    select t.picks,t.state into picks,state from flats_private.take(surprise,picks,state) t;
  end if;
  select coalesce(array_agg(id order by c.ordinal),array[]::text[]) into candidates from flats_private.catalog c
    where id=any(standard) and (data->>'tier')::integer=tier;
  select t.picks,t.state into picks,state from flats_private.take(candidates,picks,state) t;
  select t.items,t.state into eligible,state from flats_private.shuffle(eligible,state) t;
  select t.items,t.state into higher,state from flats_private.shuffle(higher,state) t;
  select t.items,t.state into fallback,state from flats_private.shuffle(seasonal||surprise,state) t;
  foreach choice in array eligible||higher||fallback loop
    if cardinality(picks)<3 and not choice=any(picks) then picks:=picks||choice;end if;
  end loop;
  select t.items into picks from flats_private.shuffle(picks,state) t;
  return picks;
end $$;

create or replace function flats_private.validate_layout(p jsonb, layout jsonb)
returns void language plpgsql stable set search_path=pg_catalog as $$
declare slot record; entry jsonb; owned text[]; seen text[]:=array[]::text[]; surface text;
begin
  if jsonb_typeof(layout)<>'object' or jsonb_typeof(layout->'slots') is distinct from 'object'
    or layout->>'wallpaper' is null or layout->>'flooring' is null then raise exception 'That room layout is incomplete.';end if;
  select coalesce(array_agg(u->>'id'),array[]::text[]) into owned from jsonb_array_elements(p->'unlocks') u;
  foreach surface in array array['wallpaper','flooring'] loop
    if not exists(select 1 from flats_private.catalog c where c.id=layout->>surface and c.data->>'kind'=surface
      and (c.data->>'rarity'='starter' or c.id=any(owned))) then raise exception 'That room surface is not available.';end if;
  end loop;
  for slot in select key,value from jsonb_each(layout->'slots') loop
    select data into entry from flats_private.catalog where id=slot.value->>'itemId';
    if entry is null or not (slot.value->>'itemId')=any(owned) or (slot.value->>'itemId')=any(seen)
      or not exists(select 1 from flats_private.slots s where s.id=slot.key and entry->'zones' ? s.zone and (entry->>'size')::integer<=s.capacity)
      or jsonb_typeof(slot.value->'flip') is distinct from 'boolean'
      or jsonb_typeof(slot.value->'palette') is distinct from 'number'
      or (slot.value->>'palette')::numeric<>trunc((slot.value->>'palette')::numeric)
      or (slot.value->>'palette')::integer not between 0 and (entry->>'paletteCount')::integer-1
    then raise exception 'An item does not fit in that spot.';end if;
    seen:=seen||(slot.value->>'itemId');
  end loop;
end $$;

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
    if not exists(select 1 from flats_private.groups where groups.code=v_code) then raise exception 'No building has that invite code.';end if;
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
  select name from flats_private.groups where code=upper(regexp_replace(p_code,'[^a-zA-Z0-9]','','g'));
$$;
create or replace function public.flats_fetch_group(p_player_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p flats_private.players; result jsonb;
begin
  p:=flats_private.authorize(p_player_id,p_token);
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

create or replace function public.flats_update_player(p_player_id uuid,p_token text,p_action text,p_day date,p_value jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p flats_private.players; v_profile jsonb; workouts jsonb; unlocked jsonb; entry text;
begin
  -- Lock first, then authorize, so deletion and concurrent mutations cannot race.
  perform 1 from flats_private.players where id=p_player_id for update;
  p:=flats_private.authorize(p_player_id,p_token);v_profile:=p.profile;
  if p_day is null or p_day not between current_date-1 and current_date+1 then raise exception 'Please check your device date.';end if;
  if p_action in ('workout','workoutType') then
    if p_value is not null and jsonb_typeof(p_value)<>'null' and p_value#>>'{}' not in ('run','walk','gym','yoga','swim','dance','other') then raise exception 'Choose a workout type.';end if;
    if p_action='workout' then
      if exists(select 1 from jsonb_array_elements(v_profile->'workouts') w where w->>'day'=p_day::text) then raise exception 'Already logged today. See you tomorrow.';end if;
      workouts:=(v_profile->'workouts')||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('day',p_day,'type',p_value)));
    else
      if p_value is null or jsonb_typeof(p_value)='null' then raise exception 'Choose a workout type.';end if;
      if not exists(select 1 from jsonb_array_elements(v_profile->'workouts') w where w->>'day'=p_day::text) then raise exception 'No workout logged that day.';end if;
      select jsonb_agg(case when w->>'day'=p_day::text then w||jsonb_build_object('type',p_value) else w end order by n)
        into workouts from jsonb_array_elements(v_profile->'workouts') with ordinality x(w,n);
    end if;
    v_profile:=jsonb_set(v_profile,'{workouts}',workouts);
  elsif p_action='unpack' then
    entry:=p_value#>>'{}';
    if entry is null or not entry=any(flats_private.choices(v_profile,p_day)) then raise exception 'That item is not in this present.';end if;
    unlocked:=(v_profile->'unlocks')||jsonb_build_array(jsonb_build_object('id',entry,'atWorkout',jsonb_array_length(v_profile->'workouts'),'day',p_day));
    v_profile:=jsonb_set(v_profile,'{unlocks}',unlocked);
  elsif p_action='layout' then
    perform flats_private.validate_layout(v_profile,p_value);v_profile:=jsonb_set(v_profile,'{layout}',p_value);
  else raise exception 'Unknown room action.';
  end if;
  update flats_private.players set profile=v_profile where id=p_player_id;
  return v_profile;
end $$;

create or replace function public.flats_react(p_player_id uuid,p_token text,p_to uuid,p_kind text,p_day date,p_variant integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p flats_private.players; r flats_private.reactions;
begin
  -- Lock in a stable order so deleting either resident cannot overlap delivery.
  perform 1 from flats_private.players where id in (p_player_id,p_to) order by id for update;
  p:=flats_private.authorize(p_player_id,p_token);
  if p_player_id=p_to then raise exception 'Reactions are for friends.';end if;
  if not exists(select 1 from flats_private.players where id=p_to and group_code=p.group_code and deleted_at is null) then raise exception 'That neighbour is not in your building.';end if;
  if p_day is null or p_day not between current_date-1 and current_date+1 then raise exception 'Please check your device date.';end if;
  begin
    insert into flats_private.reactions(sender,recipient,kind,day,variant) values(p_player_id,p_to,p_kind,p_day,p_variant) returning * into r;
  exception when unique_violation then raise exception 'You already sent that today.';end;
  return jsonb_strip_nulls(jsonb_build_object('from',r.sender,'to',r.recipient,'kind',r.kind,'day',r.day,'at',floor(extract(epoch from r.created_at)*1000),'variant',r.variant));
end $$;

create or replace function public.flats_admin(p_token text,p_action text default 'list',p_player_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists(select 1 from flats_private.admin where token_hash=extensions.digest(p_token,'sha256')) then
    raise exception using errcode='42501',message='Please unlock the admin console again.';
  end if;
  if p_action='delete' then update flats_private.players set deleted_at=coalesce(deleted_at,now()) where id=p_player_id;
  elsif p_action='restore' then update flats_private.players set deleted_at=null where id=p_player_id;
  elsif p_action<>'list' then raise exception 'Unknown admin action.';end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.profile->>'name','petName',p.profile->>'petName',
    'petKind',p.profile->>'petKind','building',g.name,'groupCode',g.code,'createdAt',p.created_at,'deletedAt',p.deleted_at,
    'workouts',jsonb_array_length(p.profile->'workouts')) order by p.created_at desc),'[]')
    from flats_private.players p join flats_private.groups g on g.code=p.group_code);
end $$;

revoke all on all functions in schema flats_private from public,anon,authenticated;
revoke all on function public.flats_create_player(uuid,text,text,text,text,date,text,jsonb) from public;
revoke all on function public.flats_group_name(text) from public;
revoke all on function public.flats_fetch_group(uuid,text) from public;
revoke all on function public.flats_update_player(uuid,text,text,date,jsonb) from public;
revoke all on function public.flats_react(uuid,text,uuid,text,date,integer) from public;
revoke all on function public.flats_admin(text,text,uuid) from public;
grant execute on function public.flats_create_player(uuid,text,text,text,text,date,text,jsonb),public.flats_group_name(text),
  public.flats_fetch_group(uuid,text),public.flats_update_player(uuid,text,text,date,jsonb),public.flats_react(uuid,text,uuid,text,date,integer),
  public.flats_admin(text,text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
