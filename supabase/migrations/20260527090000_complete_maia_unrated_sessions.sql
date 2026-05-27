drop function if exists public.finalize_training_session_atomic(
  uuid,
  uuid,
  jsonb,
  double precision,
  integer,
  text,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer,
  double precision,
  double precision,
  jsonb,
  text,
  text,
  integer,
  integer,
  numeric
);

create or replace function public.finalize_training_session_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_evaluated_moves jsonb,
  p_eval_preservation_score double precision,
  p_sequence_length integer,
  p_reflection_note text,
  p_completed_at timestamptz,
  p_elo_before integer,
  p_elo_after integer,
  p_elo_delta integer,
  p_k_factor integer,
  p_opponent_elo integer,
  p_expected_score double precision,
  p_actual_score double precision,
  p_position_evaluations jsonb,
  p_training_outcome text,
  p_review_outcome text,
  p_average_cp_loss integer,
  p_max_single_cp_loss integer,
  p_rating_deviation_after numeric,
  p_is_rated boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_session public.training_sessions%rowtype;
  v_training_item public.user_training_items%rowtype;
  v_current_interval integer;
  v_pass_interval integer;
  v_new_interval integer;
  v_is_mastered_fail boolean;
  v_should_master boolean;
begin
  if p_completed_at is null then
    raise exception using errcode = '22023', message = 'Missing completion timestamp.';
  end if;

  if p_sequence_length is null or p_sequence_length < 1 then
    raise exception using errcode = '22023', message = 'Invalid completed sequence length.';
  end if;

  if p_evaluated_moves is null or jsonb_typeof(p_evaluated_moves) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid evaluated move sequence.';
  end if;

  if p_position_evaluations is null or jsonb_typeof(p_position_evaluations) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid position evaluations.';
  end if;

  if p_training_outcome is null or p_training_outcome not in ('pass', 'acceptable', 'fail') then
    raise exception using errcode = '22023', message = 'Invalid training outcome.';
  end if;

  if p_review_outcome is null or p_review_outcome not in ('pass', 'acceptable', 'fail') then
    raise exception using errcode = '22023', message = 'Invalid review outcome.';
  end if;

  select *
  into v_session
  from public.training_sessions
  where id = p_session_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Training session was not found.';
  end if;

  if v_session.completed_at is not null then
    raise exception using errcode = 'P0001', message = 'Training session is already completed.';
  end if;

  if v_session.moves_played is distinct from p_evaluated_moves
     or v_session.sequence_length is distinct from p_sequence_length then
    raise exception using errcode = 'P0001', message = 'Active training session changed before completion.';
  end if;

  if v_session.queue_source = 'filler' then
    if v_session.selected_training_item_id is not null
       or v_session.filler_id is null
       or v_session.filler_origin is null then
      raise exception using errcode = 'P0001', message = 'Filler session identity is invalid.';
    end if;
  elsif v_session.queue_source in ('review', 'active') then
    if v_session.selected_training_item_id is null
       or v_session.filler_id is not null
       or v_session.filler_origin is not null then
      raise exception using errcode = 'P0001', message = 'Personal session identity is invalid.';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'Training session queue source is invalid.';
  end if;

  update public.training_sessions
  set
    eval_preservation_score = p_eval_preservation_score,
    reflection_note = p_reflection_note,
    completed_at = p_completed_at,
    elo_before = p_elo_before,
    elo_after = p_elo_after,
    elo_delta = p_elo_delta,
    k_factor = p_k_factor,
    opponent_elo = p_opponent_elo,
    expected_score = p_expected_score,
    actual_score = p_actual_score,
    position_evaluations = p_position_evaluations,
    training_outcome = p_training_outcome,
    average_cp_loss = p_average_cp_loss,
    max_single_cp_loss = p_max_single_cp_loss
  where id = v_session.id;

  if p_is_rated and v_session.selected_training_item_id is not null then
    select *
    into v_training_item
    from public.user_training_items
    where id = v_session.selected_training_item_id
      and user_id = p_user_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Selected training item was not found.';
    end if;

    v_current_interval := greatest(1, coalesce(v_training_item.interval_days, 1));
    v_pass_interval := greatest(1, round(v_current_interval::numeric * 2.5)::integer);

    v_new_interval :=
      case p_review_outcome
        when 'pass' then v_pass_interval
        when 'acceptable' then greatest(1, round(v_pass_interval::numeric / 2)::integer)
        when 'fail' then 1
      end;

    v_is_mastered_fail :=
      v_training_item.status = 'mastered'
      and p_review_outcome = 'fail';

    if v_is_mastered_fail then
      v_new_interval := greatest(v_new_interval, 30);
    end if;

    v_should_master :=
      not v_is_mastered_fail
      and p_review_outcome = 'pass'
      and v_new_interval >= 60;

    update public.user_training_items
    set
      review_count = coalesce(review_count, 0) + 1,
      last_attempt_at = p_completed_at,
      next_review_at =
        case
          when v_should_master then null
          else p_completed_at + make_interval(days => v_new_interval)
        end,
      interval_days = v_new_interval,
      pass_count =
        coalesce(pass_count, 0)
        + case when p_review_outcome = 'pass' then 1 else 0 end,
      acceptable_count =
        coalesce(acceptable_count, 0)
        + case when p_review_outcome = 'acceptable' then 1 else 0 end,
      fail_count =
        coalesce(fail_count, 0)
        + case when p_review_outcome = 'fail' then 1 else 0 end,
      status =
        case
          when v_is_mastered_fail then status
          when v_should_master then 'mastered'
          else 'review'
        end,
      mastered_at =
        case
          when v_should_master then p_completed_at
          else mastered_at
        end
    where id = v_training_item.id
      and user_id = p_user_id;
  end if;

  update public.user_blindspot_profile
  set
    blindspots_elo = case when p_is_rated then p_elo_after else blindspots_elo end,
    rating_deviation = case when p_is_rated then p_rating_deviation_after else rating_deviation end,
    total_sequences = coalesce(total_sequences, 0) + case when p_is_rated then 1 else 0 end,
    last_session_at = p_completed_at,
    next_filler_cursor =
      coalesce(next_filler_cursor, 0)
      + case when v_session.queue_source = 'filler' then 1 else 0 end
  where user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Blindspots profile was not found.';
  end if;

  return v_session.id;
end;
$function$;

revoke all on function public.finalize_training_session_atomic(
  uuid,
  uuid,
  jsonb,
  double precision,
  integer,
  text,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer,
  double precision,
  double precision,
  jsonb,
  text,
  text,
  integer,
  integer,
  numeric,
  boolean
) from public;

revoke all on function public.finalize_training_session_atomic(
  uuid,
  uuid,
  jsonb,
  double precision,
  integer,
  text,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer,
  double precision,
  double precision,
  jsonb,
  text,
  text,
  integer,
  integer,
  numeric,
  boolean
) from anon, authenticated;

grant execute on function public.finalize_training_session_atomic(
  uuid,
  uuid,
  jsonb,
  double precision,
  integer,
  text,
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer,
  double precision,
  double precision,
  jsonb,
  text,
  text,
  integer,
  integer,
  numeric,
  boolean
) to service_role;
