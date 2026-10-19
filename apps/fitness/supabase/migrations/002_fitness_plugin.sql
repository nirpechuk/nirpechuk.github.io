-- OAuth clients receive only the journal's text-entry RPCs.
begin;
create table if not exists fitness_private.plugin_clients (
 owner_id uuid not null references auth.users(id), client_id uuid not null,
 name text not null, enabled_at timestamptz not null default now(),
 primary key(owner_id,client_id)
);
revoke all on fitness_private.plugin_clients from public,anon,authenticated;

create or replace function public.fitness_is_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select (auth.jwt()->>'client_id') is null and exists(
 select 1 from auth.users u join fitness_private.owner o on lower(u.email)=lower(o.email)
 where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;

create or replace function public.fitness_allow_plugin_client(p_client_id uuid,p_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.fitness_is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_client_id is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid client'; end if;
 insert into fitness_private.plugin_clients(owner_id,client_id,name) values(auth.uid(),p_client_id,trim(p_name))
 on conflict(owner_id,client_id) do update set name=excluded.name,enabled_at=now();
end; $$;
create or replace function public.fitness_list_plugin_clients() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('client_id',client_id,'name',name,'enabled_at',enabled_at) order by enabled_at desc),'[]'::jsonb)
 from fitness_private.plugin_clients where owner_id=auth.uid() and public.fitness_is_owner();
$$;
create or replace function public.fitness_revoke_plugin_client(p_client_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.fitness_is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 delete from fitness_private.plugin_clients where owner_id=auth.uid() and client_id=p_client_id;
end; $$;

create or replace function public.fitness_plugin_access() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from fitness_private.plugin_clients c
 join auth.users u on u.id=c.owner_id join fitness_private.owner o on lower(o.email)=lower(u.email)
 where c.owner_id=auth.uid() and c.client_id::text=(auth.jwt()->>'client_id')
 and u.email_confirmed_at is not null);
$$;
create or replace function public.fitness_plugin_read(p_since date default current_date-30) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.fitness_plugin_access() then raise exception 'Plugin access not authorized' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(e) order by e.day,e.created_at),'[]'::jsonb)
 from (select * from public.fitness_entries where owner_id=auth.uid() and archived_at is null and kind<>'photo'
 and day>=greatest(p_since,current_date-366) order by day desc,created_at desc limit 2000) e);
end; $$;

create or replace function fitness_private.save_text_entry(owner uuid,p_entry jsonb,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.fitness_entries; saved public.fitness_entries; entry_id uuid;
begin

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
revoke all on function fitness_private.save_text_entry(uuid,jsonb,integer) from public,anon,authenticated;

create or replace function public.fitness_agent_save(p_token text,p_entry jsonb,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return fitness_private.save_text_entry(fitness_private.agent_owner(p_token),p_entry,p_expected_revision);
end; $$;
create or replace function public.fitness_plugin_save(p_entry jsonb,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.fitness_plugin_access() then raise exception 'Plugin access not authorized' using errcode='42501'; end if;
 return fitness_private.save_text_entry(auth.uid(),p_entry,p_expected_revision);
end; $$;
revoke all on function public.fitness_allow_plugin_client(uuid,text),public.fitness_list_plugin_clients(),public.fitness_revoke_plugin_client(uuid),public.fitness_plugin_access(),public.fitness_plugin_read(date),public.fitness_plugin_save(jsonb,integer) from public,anon;
grant execute on function public.fitness_allow_plugin_client(uuid,text),public.fitness_list_plugin_clients(),public.fitness_revoke_plugin_client(uuid),public.fitness_plugin_access(),public.fitness_plugin_read(date),public.fitness_plugin_save(jsonb,integer) to authenticated;
commit;
