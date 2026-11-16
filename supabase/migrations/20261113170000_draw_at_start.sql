-- =============================================================================
-- Nowy model: przydziały powstają przy ZATWIERDZENIU (start_room), a nie w trakcie.
-- - Admin dodaje osoby i zatwierdza. Losowanie jest gotowe od razu.
-- - Każdy może wejść w dowolnym momencie, wybrać tożsamość i wylosować.
-- - Wynik odsłania się dopiero przy wywołaniu draw_name (revealed_at).
-- - Klient nie może czytać tabeli draws wprost (ani przed, ani po losowaniu).
-- =============================================================================

alter table public.draws add column revealed_at timestamptz;

-- Klient nie ma już żadnego dostępu do przydziałów.
drop policy if exists draws_select_own_drawer on public.draws;
revoke select on public.draws from authenticated;

-- Dołączanie kodem w dowolnym momencie (także po zatwierdzeniu).
create or replace function public.join_room(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_room uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select r.id into v_room from public.rooms r where r.invite_code = upper(btrim(p_code));
  if v_room is null then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (v_room, v_uid, 'member')
  on conflict (room_id, user_id) do nothing;

  return v_room;
end;
$$;

-- Wybór tożsamości: w dowolnym momencie (przed i po zatwierdzeniu).
create or replace function public.claim_identity(p_room uuid, p_participant uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_room_member(p_room) then
    raise exception 'forbidden_not_member' using errcode = '42501';
  end if;

  -- Blokada pokoju serializuje wybory tożsamości.
  perform 1 from public.rooms r where r.id = p_room for update;

  if exists (select 1 from public.room_participants p
             where p.room_id = p_room and p.user_id = v_uid) then
    raise exception 'already_claimed';
  end if;

  update public.room_participants
     set user_id = v_uid
   where id = p_participant and room_id = p_room and user_id is null;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'identity_unavailable';
  end if;

  update public.rooms set claimed_count = claimed_count + 1 where id = p_room;
end;
$$;

-- Zatwierdzenie: losuje cykl przydziałów dla WSZYSTKICH osób (każdy daje jednej, każdy dostaje jednego,
-- nikt nie daje sobie). Wybór tożsamości nie jest wymagany.
create or replace function public.start_room(p_room uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_total  int;
  v_ids    uuid[];
  v_n      int;
  i        int;
begin
  if not public.is_room_admin(p_room) then
    raise exception 'forbidden_not_admin' using errcode = '42501';
  end if;

  select r.status, r.participant_count into v_status, v_total
  from public.rooms r where r.id = p_room for update;

  if v_status <> 'open' then
    raise exception 'room_already_started';
  end if;
  if v_total < 3 then
    raise exception 'need_at_least_3_participants';
  end if;

  -- Losowa kolejność tworzy jeden wielki cykl: i -> i+1 -> ... -> n -> 1.
  select array_agg(p.id order by random()) into v_ids
  from public.room_participants p where p.room_id = p_room;
  v_n := array_length(v_ids, 1);

  for i in 1..v_n loop
    insert into public.draws (room_id, drawer_id, target_id)
    values (p_room, v_ids[i], v_ids[i % v_n + 1]);
  end loop;

  update public.rooms set status = 'started', started_at = now() where id = p_room;
end;
$$;

-- Losowanie: odsłania przydział losującego. Idempotentne (kolejne wywołania zwracają ten sam wynik).
create or replace function public.draw_name(p_room uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_status   text;
  v_me       uuid;
  v_target   uuid;
  v_revealed timestamptz;
  v_name     text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select r.status into v_status from public.rooms r where r.id = p_room for update;
  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'started' then
    raise exception 'room_not_started';
  end if;

  select p.id into v_me from public.room_participants p
  where p.room_id = p_room and p.user_id = v_uid;
  if v_me is null then
    raise exception 'no_identity';
  end if;

  select d.target_id, d.revealed_at into v_target, v_revealed
  from public.draws d where d.room_id = p_room and d.drawer_id = v_me;
  if v_target is null then
    raise exception 'no_assignment';
  end if;

  if v_revealed is null then
    update public.draws set revealed_at = now()
    where room_id = p_room and drawer_id = v_me;
    update public.rooms set drawn_count = drawn_count + 1 where id = p_room;
  end if;

  select p.display_name into v_name from public.room_participants p where p.id = v_target;
  return v_name;
end;
$$;

-- Odczyt WŁASNEGO wyniku: zwraca imię tylko po odsłonięciu (null przed losowaniem).
create or replace function public.get_my_draw(p_room uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_name text;
begin
  select t.display_name into v_name
  from public.draws d
  join public.room_participants me on me.id = d.drawer_id and me.room_id = d.room_id
  join public.room_participants t  on t.id  = d.target_id and t.room_id  = d.room_id
  where d.room_id = p_room
    and me.user_id = auth.uid()
    and d.revealed_at is not null;

  return v_name;
end;
$$;
