begin;
-- Existing connections stay text-only until the owner explicitly enables uploads.
alter table fitness_private.plugin_clients add column photo_upload_enabled boolean not null default false;
create table fitness_private.photo_uploads (
 id uuid primary key, owner_id uuid not null, client_id uuid not null,
 entry jsonb not null, sha256 text not null, byte_size integer not null,
 created_at timestamptz not null default now(),
 foreign key(owner_id,client_id) references fitness_private.plugin_clients(owner_id,client_id) on delete cascade
);
alter table fitness_private.photo_uploads enable row level security;
revoke all on fitness_private.photo_uploads from public,anon,authenticated;

create function public.fitness_enable_plugin_photos(p_client_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.fitness_is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 update fitness_private.plugin_clients set photo_upload_enabled=true where owner_id=auth.uid() and client_id=p_client_id;
 if not found then raise exception 'Connect the client first'; end if;
end; $$;
create function public.fitness_plugin_photo_access() returns boolean
language sql stable security definer set search_path='' as $$
 select public.fitness_plugin_access() and exists(select 1 from fitness_private.plugin_clients
 where owner_id=auth.uid() and client_id::text=auth.jwt()->>'client_id' and photo_upload_enabled);
$$;

create function public.fitness_plugin_reserve_photo(p_entry jsonb,p_sha256 text,p_byte_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old fitness_private.photo_uploads; entry_id uuid; object_path text;
begin
 if not public.fitness_plugin_photo_access() then raise exception 'Photo uploads not authorized' using errcode='42501'; end if;
 if p_entry is null or jsonb_typeof(p_entry)<>'object' or octet_length(p_entry::text)>6000
 or (p_entry - array['id','day','title','view','notes'])<>'{}'::jsonb
 or coalesce(p_entry->>'title','') !~ '\S' or length(p_entry->>'title')>200
 or coalesce(p_entry->>'view','') not in ('front','side','back','other')
 or length(coalesce(p_entry->>'notes',''))>4000
 or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
 or p_byte_size is null or p_byte_size not between 1 and 10485760 then raise exception 'Invalid photo'; end if;
 entry_id := (p_entry->>'id')::uuid;
 if entry_id is null or (p_entry->>'day')::date is null then raise exception 'Photo ID and date required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(entry_id::text,0));
 select * into old from fitness_private.photo_uploads where id=entry_id;
 if found then
   if old.owner_id<>auth.uid() or old.client_id::text<>auth.jwt()->>'client_id' then raise exception 'Not authorized' using errcode='42501'; end if;
   if old.entry<>p_entry or old.sha256<>p_sha256 or old.byte_size<>p_byte_size then raise exception 'Photo ID already used; retry the identical photo'; end if;
 else
   if exists(select 1 from public.fitness_entries where id=entry_id) then raise exception 'Entry ID already used'; end if;
   insert into fitness_private.photo_uploads(id,owner_id,client_id,entry,sha256,byte_size)
   values(entry_id,auth.uid(),(auth.jwt()->>'client_id')::uuid,p_entry,p_sha256,p_byte_size);
 end if;
 object_path:=auth.uid()::text||'/'||entry_id::text||'.jpg';
 return jsonb_build_object('path',object_path,'uploaded',exists(select 1 from storage.objects where bucket_id='fitness-photos' and name=object_path));
end; $$;

create function public.fitness_plugin_can_upload_photo(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.fitness_plugin_photo_access() and exists(select 1 from fitness_private.photo_uploads r
 where r.owner_id=auth.uid() and r.client_id::text=auth.jwt()->>'client_id'
 and p_path=r.owner_id::text||'/'||r.id::text||'.jpg'
 and not exists(select 1 from public.fitness_entries e where e.id=r.id));
$$;
create policy fitness_plugin_photo_insert on storage.objects for insert to authenticated
 with check(bucket_id='fitness-photos' and public.fitness_plugin_can_upload_photo(name));

create function public.fitness_plugin_finish_photo(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r fitness_private.photo_uploads; saved public.fitness_entries; object_path text; payload jsonb;
begin
 if not public.fitness_plugin_photo_access() then raise exception 'Photo uploads not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from fitness_private.photo_uploads where id=p_id and owner_id=auth.uid() and client_id::text=auth.jwt()->>'client_id';
 if not found then raise exception 'Reserve the photo first'; end if;
 object_path:=r.owner_id::text||'/'||r.id::text||'.jpg';
 payload:=jsonb_build_object('path',object_path,'view',r.entry->>'view') ||
   case when r.entry ? 'notes' then jsonb_build_object('notes',r.entry->>'notes') else '{}'::jsonb end;
 select * into saved from public.fitness_entries where id=p_id;
 if found then
   if saved.owner_id<>r.owner_id or saved.kind<>'photo' or saved.day<>(r.entry->>'day')::date or saved.title<>r.entry->>'title'
    or saved.data<>payload or saved.archived_at is not null then raise exception 'Photo entry changed; check the website'; end if;
   return to_jsonb(saved);
 end if;
 if not exists(select 1 from storage.objects where bucket_id='fitness-photos' and name=object_path
  and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint=r.byte_size) then raise exception 'Photo upload is incomplete'; end if;
 insert into public.fitness_entries(id,owner_id,day,kind,title,data,source)
 values(r.id,r.owner_id,(r.entry->>'day')::date,'photo',r.entry->>'title',payload,'agent') returning * into saved;
 return to_jsonb(saved);
end; $$;
revoke all on function public.fitness_enable_plugin_photos(uuid),public.fitness_plugin_photo_access(),public.fitness_plugin_reserve_photo(jsonb,text,integer),public.fitness_plugin_can_upload_photo(text),public.fitness_plugin_finish_photo(uuid) from public,anon;
grant execute on function public.fitness_enable_plugin_photos(uuid),public.fitness_plugin_photo_access(),public.fitness_plugin_reserve_photo(jsonb,text,integer),public.fitness_plugin_can_upload_photo(text),public.fitness_plugin_finish_photo(uuid) to authenticated;
commit;
