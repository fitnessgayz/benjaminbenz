-- Persist a safe YouTube demo destination on every saved program exercise.
-- The client UI has historically generated this fallback at render time, but
-- keeping it in the JSON makes programs complete for every reader and client.
-- Suppress program-update notifications while this metadata-only backfill runs.
alter table public.client_programs disable trigger fwb_program_notifications;

update public.client_programs as program
set workouts = coalesce((
  select jsonb_agg(
    case
      when jsonb_typeof(workout.value) <> 'object' then workout.value
      else jsonb_set(
        workout.value,
        '{exercises}',
        coalesce((
          select jsonb_agg(
            case
              when jsonb_typeof(exercise.value) <> 'object' then exercise.value
              else exercise.value || jsonb_build_object(
                'video',
                case
                  when coalesce(
                    nullif(btrim(exercise.value ->> 'video'), ''),
                    nullif(btrim(exercise.value ->> 'videoUrl'), ''),
                    nullif(btrim(exercise.value ->> 'video_url'), ''),
                    nullif(btrim(exercise.value ->> 'youtube_url'), '')
                  ) ~* '^(https?://)?(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)/'
                  then case
                    when coalesce(
                      nullif(btrim(exercise.value ->> 'video'), ''),
                      nullif(btrim(exercise.value ->> 'videoUrl'), ''),
                      nullif(btrim(exercise.value ->> 'video_url'), ''),
                      nullif(btrim(exercise.value ->> 'youtube_url'), '')
                    ) ~* '^https?://'
                    then coalesce(
                      nullif(btrim(exercise.value ->> 'video'), ''),
                      nullif(btrim(exercise.value ->> 'videoUrl'), ''),
                      nullif(btrim(exercise.value ->> 'video_url'), ''),
                      nullif(btrim(exercise.value ->> 'youtube_url'), '')
                    )
                    else 'https://' || coalesce(
                      nullif(btrim(exercise.value ->> 'video'), ''),
                      nullif(btrim(exercise.value ->> 'videoUrl'), ''),
                      nullif(btrim(exercise.value ->> 'video_url'), ''),
                      nullif(btrim(exercise.value ->> 'youtube_url'), '')
                    )
                  end
                  else 'https://www.youtube.com/results?search_query=' ||
                    trim(both '+' from regexp_replace(
                      coalesce(nullif(btrim(exercise.value ->> 'name'), ''), 'workout'),
                      '[^[:alnum:]]+',
                      '+',
                      'g'
                    )) ||
                    '+exercise+demo'
                end
              )
            end
            order by exercise.ordinality
          )
          from jsonb_array_elements(
            case
              when jsonb_typeof(workout.value -> 'exercises') = 'array'
              then workout.value -> 'exercises'
              else '[]'::jsonb
            end
          ) with ordinality as exercise(value, ordinality)
        ), '[]'::jsonb),
        true
      )
    end
    order by workout.ordinality
  )
  from jsonb_array_elements(
    case
      when jsonb_typeof(program.workouts) = 'array' then program.workouts
      else '[]'::jsonb
    end
  ) with ordinality as workout(value, ordinality)
), '[]'::jsonb)
where jsonb_typeof(program.workouts) = 'array';

alter table public.client_programs enable trigger fwb_program_notifications;
