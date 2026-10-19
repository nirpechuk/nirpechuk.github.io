-- Private, single-owner journal. Run in the Supabase SQL editor as postgres.
-- No existing project tables or policies are modified.
begin;
create schema if not exists fitness_private;
revoke all on schema fitness_private from public, anon, authenticated;
create table if not exists fitness_private.owner (
  singleton boolean primary key default true check(singleton),
  email text not null
);
-- Set the owner separately; this migration contains no personal account identifier.

create or replace function public.fitness_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u join fitness_private.owner o
    on lower(u.email) = lower(o.email)
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;
revoke all on function public.fitness_is_owner() from public, anon;
grant execute on function public.fitness_is_owner() to authenticated;

create table if not exists public.fitness_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  day date not null check(day between '2000-01-01' and '2100-12-31'),
  kind text not null check(kind in ('meal','workout','measurement','checkin','photo')),
  title text not null check(length(trim(title)) between 1 and 200),
  data jsonb not null default '{}' check(jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  source text not null default 'web' check(source in ('web','agent')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists fitness_entries_day on public.fitness_entries(owner_id, day desc);
create unique index if not exists fitness_one_checkin on public.fitness_entries(owner_id,day)
  where kind='checkin' and archived_at is null;

create table if not exists public.fitness_settings (
  owner_id uuid primary key references auth.users(id),
  calorie_goal integer check(calorie_goal between 1 and 20000),
  protein_goal integer check(protein_goal between 1 and 1000),
  weekly_sessions integer not null default 3 check(weekly_sessions between 0 and 21),
  weight_unit text not null default 'lb' check(weight_unit in ('lb','kg'))
);
create table if not exists public.fitness_history (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  owner_id uuid not null,
  recorded_at timestamptz not null default now(),
  operation text not null,
  previous jsonb,
  current jsonb not null
);
create index if not exists fitness_history_entry on public.fitness_history(entry_id, recorded_at);

create or replace function fitness_private.validate_entry() returns trigger
language plpgsql set search_path = '' as $$
declare k text; exercise jsonb; reps jsonb;
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.owner_id<>old.owner_id or new.kind<>old.kind or new.created_at<>old.created_at then
      raise exception 'Entry identity cannot be changed';
    end if;
    new.revision := old.revision+1;
  else
    new.revision := 1;
    new.created_at := now();
  end if;
  new.updated_at := now();
  if new.kind='meal' then
    foreach k in array array['calories','protein','carbs','fat'] loop
      if k in ('calories','protein') and not(new.data ? k) then raise exception 'Calories and protein are required'; end if;
      if new.data ? k and (jsonb_typeof(new.data->k)<>'number' or (new.data->>k)::numeric<0 or (new.data->>k)::numeric>20000) then
        raise exception 'Nutrition values must be nonnegative numbers';
      end if;
    end loop;
    if coalesce(new.data->>'confidence','') not in ('estimated','label','weighed') then raise exception 'Nutrition source is required'; end if;
  elsif new.kind='measurement' then
    if jsonb_typeof(new.data->'weight') is distinct from 'number' or not((new.data->>'weight')::numeric between 1 and 1500)
      or coalesce(new.data->>'unit','') not in ('lb','kg') then raise exception 'A valid weight and unit are required'; end if;
  elsif new.kind='checkin' then
    if jsonb_typeof(new.data->'complete') is distinct from 'boolean' then raise exception 'Journal completion must be true or false'; end if;
  elsif new.kind='photo' then
    if coalesce(new.data->>'view','') not in ('front','side','back','other') or
      coalesce(new.data->>'path','') !~ ('^' || new.owner_id::text || '/[a-f0-9-]+[.]jpg$') then raise exception 'Invalid private photo path or view'; end if;
  elsif new.kind='workout' then
    if new.data ? 'minutes' and (jsonb_typeof(new.data->'minutes')<>'number' or not((new.data->>'minutes')::numeric between 1 and 1440)) then raise exception 'Duration must be 1–1440 minutes'; end if;
    if jsonb_typeof(new.data->'exercises') is distinct from 'array' then raise exception 'Exercises must be an array'; end if;
    if jsonb_array_length(new.data->'exercises')>50 then raise exception 'Too many exercises'; end if;
    for exercise in select * from jsonb_array_elements(new.data->'exercises') loop
      if length(trim(coalesce(exercise->>'name',''))) not between 1 and 100 or
        coalesce(exercise->>'unit','') not in ('lb','kg') or
        jsonb_typeof(exercise->'weight') is distinct from 'number' or
        not((exercise->>'weight')::numeric between 0 and 2000) or
        jsonb_typeof(exercise->'reps') is distinct from 'array' then raise exception 'Invalid exercise'; end if;
      if jsonb_array_length(exercise->'reps') not between 1 and 30 then raise exception 'Include 1–30 sets'; end if;
      for reps in select * from jsonb_array_elements(exercise->'reps') loop
        if jsonb_typeof(reps)<>'number' or not(reps::text::numeric between 1 and 1000) or reps::text::numeric<>trunc(reps::text::numeric) then raise exception 'Reps must be positive integers'; end if;
      end loop;
    end loop;
    if jsonb_array_length(new.data->'exercises')=0 and not(new.data ? 'minutes') then raise exception 'Include exercises or duration'; end if;
  end if;
  return new;
end; $$;
create or replace function fitness_private.audit_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fitness_history(entry_id,owner_id,operation,previous,current)
    values(new.id,new.owner_id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end; $$;
drop trigger if exists fitness_validate on public.fitness_entries;
create trigger fitness_validate before insert or update on public.fitness_entries for each row execute function fitness_private.validate_entry();
drop trigger if exists fitness_audit on public.fitness_entries;
create trigger fitness_audit after insert or update on public.fitness_entries for each row execute function fitness_private.audit_entry();
revoke all on all functions in schema fitness_private from public, anon, authenticated;

alter table public.fitness_entries enable row level security;
alter table public.fitness_settings enable row level security;
alter table public.fitness_history enable row level security;
revoke all on public.fitness_entries,public.fitness_settings,public.fitness_history from anon, authenticated;
grant select,insert,update on public.fitness_entries,public.fitness_settings to authenticated;
grant select on public.fitness_history to authenticated;
drop policy if exists fitness_owner_entries on public.fitness_entries;
create policy fitness_owner_entries on public.fitness_entries to authenticated
  using(owner_id=(select auth.uid()) and (select public.fitness_is_owner()))
  with check(owner_id=(select auth.uid()) and (select public.fitness_is_owner()));
drop policy if exists fitness_owner_settings on public.fitness_settings;
create policy fitness_owner_settings on public.fitness_settings to authenticated
  using(owner_id=(select auth.uid()) and (select public.fitness_is_owner()))
  with check(owner_id=(select auth.uid()) and (select public.fitness_is_owner()));
drop policy if exists fitness_owner_history on public.fitness_history;
create policy fitness_owner_history on public.fitness_history for select to authenticated
  using(owner_id=(select auth.uid()) and (select public.fitness_is_owner()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('fitness-photos','fitness-photos',false,10485760,array['image/jpeg'])
 on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg'];
drop policy if exists fitness_photo_read on storage.objects;
create policy fitness_photo_read on storage.objects for select to authenticated
 using(bucket_id='fitness-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.fitness_is_owner()));
drop policy if exists fitness_photo_insert on storage.objects;
create policy fitness_photo_insert on storage.objects for insert to authenticated
 with check(bucket_id='fitness-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.fitness_is_owner()));
drop policy if exists fitness_photo_delete on storage.objects;
create policy fitness_photo_delete on storage.objects for delete to authenticated
 using(bucket_id='fitness-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.fitness_is_owner()));

-- Agent keys grant text-journal access only. They never grant storage access.
create table if not exists fitness_private.agent_keys (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null, token_hash bytea unique not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days',
 revoked_at timestamptz
);
create or replace function public.fitness_create_agent_key(p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text; key_id uuid;
begin
 if not public.fitness_is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if length(trim(p_name)) not between 1 and 80 then raise exception 'Name is required'; end if;
 token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
 insert into fitness_private.agent_keys(owner_id,name,token_hash) values(auth.uid(),p_name,sha256(convert_to(token,'UTF8'))) returning id into key_id;
 return jsonb_build_object('id',key_id,'token',token,'expires_at',now()+interval '90 days');
end; $$;
create or replace function public.fitness_list_agent_keys() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'created_at',created_at,'expires_at',expires_at,'revoked_at',revoked_at) order by created_at desc),'[]'::jsonb)
 from fitness_private.agent_keys where owner_id=auth.uid() and public.fitness_is_owner();
$$;
create or replace function public.fitness_revoke_agent_key(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.fitness_is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 update fitness_private.agent_keys set revoked_at=now() where id=p_id and owner_id=auth.uid();
end; $$;
create or replace function fitness_private.agent_owner(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 if length(p_token)<>64 then raise exception 'Invalid or expired agent key' using errcode='42501'; end if;
 select k.owner_id into owner from fitness_private.agent_keys k join auth.users u on u.id=k.owner_id
 join fitness_private.owner o on lower(o.email)=lower(u.email)
 where k.token_hash=sha256(convert_to(p_token,'UTF8')) and k.revoked_at is null and k.expires_at>now() and u.email_confirmed_at is not null;
 if owner is null then raise exception 'Invalid or expired agent key' using errcode='42501'; end if;
 return owner;
end; $$;
create or replace function public.fitness_agent_read(p_token text,p_since date default current_date-30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 owner:=fitness_private.agent_owner(p_token);
 return (select coalesce(jsonb_agg(to_jsonb(e) order by e.day,e.created_at),'[]'::jsonb)
 from (select * from public.fitness_entries where owner_id=owner and archived_at is null and kind<>'photo'
 and day>=greatest(p_since,current_date-366) order by day desc,created_at desc limit 2000) e);
end; $$;
create or replace function public.fitness_agent_save(p_token text,p_entry jsonb,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid; existing public.fitness_entries; saved public.fitness_entries; entry_id uuid;
begin
 owner:=fitness_private.agent_owner(p_token);
 if octet_length(p_entry::text)>22000 then raise exception 'Entry too large'; end if;
 if coalesce(p_entry->>'kind','') not in ('meal','workout','measurement','checkin') then raise exception 'Agents may log text entries only'; end if;
 entry_id:=(p_entry->>'id')::uuid;
 if entry_id is null then raise exception 'Supply a stable UUID for retry-safe logging'; end if;
 -- Serialize retries for one entry before checking for an existing record.
 perform pg_advisory_xact_lock(hashtextextended(entry_id::text,0));
 select * into existing from public.fitness_entries where id=entry_id for update;
 if found then
   if existing.owner_id<>owner then raise exception 'Not authorized' using errcode='42501'; end if;
   if existing.kind<>p_entry->>'kind' then raise exception 'Entry kind cannot be changed'; end if;
   if existing.day=(p_entry->>'day')::date and existing.title=p_entry->>'title' and existing.data=p_entry->'data' and existing.archived_at is null then return to_jsonb(existing); end if;
   if p_expected_revision is distinct from existing.revision then raise exception 'Entry changed; read it again before correcting'; end if;
   update public.fitness_entries set day=(p_entry->>'day')::date,title=p_entry->>'title',data=p_entry->'data',source='agent'
     where id=entry_id and archived_at is null returning * into saved;
   if not found then raise exception 'Archived entries cannot be changed by agents'; end if;
 else
   if p_expected_revision is not null then raise exception 'Entry no longer exists'; end if;
   insert into public.fitness_entries(id,owner_id,day,kind,title,data,source)
     values(entry_id,owner,(p_entry->>'day')::date,p_entry->>'kind',p_entry->>'title',p_entry->'data','agent') returning * into saved;
 end if;
 return to_jsonb(saved);
end; $$;
revoke all on function fitness_private.agent_owner(text) from public,anon,authenticated;
revoke all on function public.fitness_create_agent_key(text),public.fitness_list_agent_keys(),public.fitness_revoke_agent_key(uuid) from public,anon;
grant execute on function public.fitness_create_agent_key(text),public.fitness_list_agent_keys(),public.fitness_revoke_agent_key(uuid) to authenticated;
revoke all on function public.fitness_agent_read(text,date),public.fitness_agent_save(text,jsonb,integer) from public;
grant execute on function public.fitness_agent_read(text,date),public.fitness_agent_save(text,jsonb,integer) to anon,authenticated;
commit;
