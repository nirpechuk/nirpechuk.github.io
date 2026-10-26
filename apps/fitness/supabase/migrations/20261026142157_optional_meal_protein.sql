-- Calorie-only estimates must not require invented macros.
begin;

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
      if k='calories' and not(new.data ? k) then raise exception 'Calories are required'; end if;
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

commit;
