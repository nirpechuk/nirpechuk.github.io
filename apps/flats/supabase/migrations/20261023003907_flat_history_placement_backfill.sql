-- Qualify the outer placement value so nested unlock rows cannot shadow it.
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
    select coalesce(jsonb_object_agg(placement.key,placement.value),'{}'::jsonb) into placed from jsonb_each(p->'layout'->'slots') placement
      where exists(select 1 from jsonb_array_elements(earned) u where u->>'id'=placement.value->>'itemId');
    room:=jsonb_build_object('slots',placed,
      'wallpaper',case when exists(select 1 from jsonb_array_elements(earned) u where u->>'id'=p->'layout'->>'wallpaper') then p->'layout'->>'wallpaper' else 'plain-paper' end,
      'flooring',case when exists(select 1 from jsonb_array_elements(earned) u where u->>'id'=p->'layout'->>'flooring') then p->'layout'->>'flooring' else 'bare-boards' end);
    state:=p||jsonb_build_object('workouts',exercised,'unlocks',earned,'layout',room);
    insert into flats_private.room_history(player_id,day,kind,approximate,profile) values(p_id,d,'reconstructed',true,state);
  end loop;
  insert into flats_private.room_history(player_id,day,kind,profile) values(p_id,current_date,'recording_started',p);
end $$;
revoke all on function flats_private.seed_room_history(uuid,jsonb) from public,anon,authenticated;


-- Repair only the estimates, from the original captured baseline. Exact snapshots stay untouched.
update flats_private.room_history h set profile=jsonb_set(h.profile,'{layout,slots}',
  (select coalesce(jsonb_object_agg(placement.key,placement.value),'{}'::jsonb)
   from jsonb_each((select baseline.profile->'layout'->'slots' from flats_private.room_history baseline
     where baseline.player_id=h.player_id and not baseline.approximate order by baseline.id limit 1)) placement
   where exists(select 1 from jsonb_array_elements(h.profile->'unlocks') u where u->>'id'=placement.value->>'itemId')))
where h.approximate;
