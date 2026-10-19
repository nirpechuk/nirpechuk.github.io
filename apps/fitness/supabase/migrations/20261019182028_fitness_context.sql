-- Personal values are written privately, never included in migrations or public assets.
begin;
create table fitness_private.context (
 owner_id uuid primary key references auth.users(id),
 profile jsonb not null check (jsonb_typeof(profile)='object' and octet_length(profile::text)<=16000),
 revision integer not null default 1 check (revision>0),
 updated_at timestamptz not null default now()
);
alter table fitness_private.context enable row level security;
revoke all on fitness_private.context from public,anon,authenticated;

create function public.fitness_plugin_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.fitness_plugin_access() then raise exception 'Plugin access not authorized' using errcode='42501'; end if;
 return coalesce((select jsonb_build_object('profile',profile,'revision',revision,'updated_at',updated_at)
 from fitness_private.context where owner_id=auth.uid()),'null'::jsonb);
end; $$;
revoke all on function public.fitness_plugin_context() from public,anon;
grant execute on function public.fitness_plugin_context() to authenticated;
commit;
