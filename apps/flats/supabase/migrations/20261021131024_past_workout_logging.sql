create or replace function public.flats_update_player(p_player_id uuid,p_token text,p_action text,p_day date,p_value jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p flats_private.players; v_profile jsonb; workouts jsonb; unlocked jsonb; entry text;
begin
  -- Lock first, then authorize, so deletion and concurrent mutations cannot race.
  perform 1 from flats_private.players where id=p_player_id for update;
  p:=flats_private.authorize(p_player_id,p_token);v_profile:=p.profile;
  -- Keep the existing one-day timezone allowance; only workouts may be backdated.
  if p_day is null or not isfinite(p_day) or p_day > current_date+1
    or (p_action not in ('workout','workoutType') and p_day < current_date-1)
    then raise exception 'Please check your device date.';end if;
  if p_action in ('workout','workoutType') then
    if p_value is not null and jsonb_typeof(p_value)<>'null' and p_value#>>'{}' not in ('run','walk','gym','yoga','swim','dance','other') then raise exception 'Choose a workout type.';end if;
    if p_action='workout' then
      if exists(select 1 from jsonb_array_elements(v_profile->'workouts') w where w->>'day'=p_day::text) then raise exception 'A workout is already logged for that day.';end if;
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

