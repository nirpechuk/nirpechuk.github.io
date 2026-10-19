-- An administrator can merge duplicate residents without stranding either device.
-- Only private administrator SQL can create a merge; public callers cannot link keys.
create table if not exists flats_private.room_merges (
  source_id uuid primary key references flats_private.players(id) on delete cascade,
  target_id uuid not null references flats_private.players(id) on delete cascade,
  check(source_id<>target_id)
);
alter table flats_private.room_merges enable row level security;
revoke all on flats_private.room_merges from public,anon,authenticated;

create or replace function flats_private.authorize(p_id uuid,p_token text)
returns flats_private.players language plpgsql set search_path=pg_catalog as $$
declare p flats_private.players;
begin
  select * into p from flats_private.players target where target.id=p_id and target.deleted_at is null
    and (target.token_hash=extensions.digest(p_token,'sha256') or exists(
      select 1 from flats_private.room_merges m join flats_private.players source on source.id=m.source_id
      where m.target_id=target.id and source.token_hash=extensions.digest(p_token,'sha256')
    ));
  if not found then raise exception using errcode='P0002',message='This flat is no longer available.';end if;
  return p;
end $$;

create or replace function public.flats_resolve_room(p_player_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare canonical_id uuid; p flats_private.players;
begin
  -- A source key can only follow the merge explicitly registered for that source.
  select m.target_id into canonical_id from flats_private.room_merges m
    join flats_private.players source on source.id=m.source_id
    where source.id=p_player_id and source.token_hash=extensions.digest(p_token,'sha256');
  p:=flats_private.authorize(coalesce(canonical_id,p_player_id),p_token);
  return jsonb_build_object('playerId',p.id,'groupCode',p.group_code,
    'name',p.profile->>'name','petName',p.profile->>'petName','petKind',p.profile->>'petKind');
end $$;
revoke all on function public.flats_resolve_room(uuid,text) from public;
grant execute on function public.flats_resolve_room(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
