-- =============================================================================
-- Secret Santa – schemat, RLS i funkcje RPC
-- Wszystkie zapisy idą wyłącznie przez funkcje SECURITY DEFINER.
-- Klient (rola authenticated) nie ma uprawnień INSERT/UPDATE/DELETE do tabel.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabele
-- ---------------------------------------------------------------------------

create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  invite_code     text not null unique
                  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by      uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'open' check (status in ('open', 'started')),
  -- Liczniki (tylko liczby, bez informacji kto kogo wylosował).
  -- Są aktualizowane wyłącznie przez funkcje; klient ich nie zmienia.
  participant_count int not null default 0 check (participant_count >= 0),
  claimed_count     int not null default 0 check (claimed_count >= 0),
  drawn_count       int not null default 0 check (drawn_count >= 0),
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  constraint rooms_counts_order check (claimed_count <= participant_count
                                       and drawn_count <= participant_count)
);

-- Rola użytkownika w pokoju: 'admin' (twórca) albo 'member'.
create table public.room_members (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create unique index room_members_one_admin_uq on public.room_members (room_id) where role = 'admin';
create index room_members_user_idx on public.room_members (user_id);

-- Lista osób (tożsamości). user_id = NULL oznacza, że wpis jest jeszcze do wzięcia.
-- Po wybraniu tożsamości wpis dostaje user_id i znika z puli wyboru.
create table public.room_participants (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  user_id      uuid references auth.users (id) on delete restrict,
  created_at   timestamptz not null default now(),
  -- Klucz złożony pozwala FK z draws wymusić, że losujący i wylosowany należą do tego samego pokoju.
  constraint room_participants_room_id_uq unique (room_id, id),
  -- Jeden użytkownik = jedna tożsamość w pokoju (NULL-e się nie kolidują).
  constraint room_participants_one_identity_uq unique (room_id, user_id)
);
create unique index room_participants_name_uq
  on public.room_participants (room_id, lower(btrim(display_name)));

-- Wyniki losowania. Każdy losujący losuje raz, każda osoba zostaje wylosowana raz.
create table public.draws (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null,
  drawer_id   uuid not null,
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  constraint draws_drawer_fk foreign key (room_id, drawer_id)
    references public.room_participants (room_id, id) on delete cascade,
  constraint draws_target_fk foreign key (room_id, target_id)
    references public.room_participants (room_id, id) on delete cascade,
  constraint draws_drawer_uq unique (room_id, drawer_id),
  constraint draws_target_uq unique (room_id, target_id),
  constraint draws_no_self check (drawer_id <> target_id)
);

-- ---------------------------------------------------------------------------
-- 2. Funkcje pomocnicze (SECURITY DEFINER, stały search_path)
-- ---------------------------------------------------------------------------

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_room_admin(p_room uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security – tylko odczyt, zapis wyłącznie przez RPC
-- ---------------------------------------------------------------------------

alter table public.rooms             enable row level security;
alter table public.room_members      enable row level security;
alter table public.room_participants enable row level security;
alter table public.draws             enable row level security;

-- Pokój widzą wyłącznie jego członkowie (lista pokoi + Realtime na liczniki).
create policy rooms_select_member on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

create policy room_members_select_own on public.room_members
  for select to authenticated
  using (user_id = auth.uid());

-- Klient widzi wyłącznie WŁASNY wiersz uczestnika.
-- Lista wszystkich osób idzie przez funkcję list_participants (bez user_id innych osób).
create policy room_participants_select_own on public.room_participants
  for select to authenticated
  using (user_id = auth.uid());

-- KLUCZOWE DLA PUNKTU 5: losowanie widzi TYLKO osoba losująca.
-- Admin ani inni członkowie nie mają żadnej polityki SELECT dla tej tabeli poza własnym wierszem.
create policy draws_select_own_drawer on public.draws
  for select to authenticated
  using (
    exists (
      select 1 from public.room_participants p
      where p.id = draws.drawer_id and p.user_id = auth.uid()
    )
  );

-- Brak polityk INSERT/UPDATE/DELETE dla authenticated/anon -> zapis tylko przez funkcje.

revoke all on all tables in schema public from anon, authenticated;
grant select on public.rooms, public.room_members, public.room_participants, public.draws
  to authenticated;

-- Realtime: rooms (liczniki i status) – bezpieczne, bo zawierają wyłącznie liczby.
-- Realtime respektuje RLS, więc członkowie dostają zdarzenia tylko ze swoich pokoi.
alter publication supabase_realtime add table public.rooms;

-- ---------------------------------------------------------------------------
-- 4. Funkcje RPC
-- ---------------------------------------------------------------------------

-- 4.1 Utworzenie pokoju; twórca staje się administratorem (rola w room_members).
create or replace function public.create_room(p_name text)
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

  insert into public.rooms (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_room;

  insert into public.room_members (room_id, user_id, role)
  values (v_room, v_uid, 'admin');

  return v_room;
end;
$$;

-- 4.2 Dołączenie do pokoju kodem zaproszenia (tylko przed startem losowania).
create or replace function public.join_room(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_room   uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select r.id, r.status into v_room, v_status
  from public.rooms r
  where r.invite_code = upper(btrim(p_code));

  if v_room is null then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.room_members m where m.room_id = v_room and m.user_id = v_uid) then
    return v_room; -- już członek, idempotentnie
  end if;

  if v_status <> 'open' then
    raise exception 'room_already_started';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (v_room, v_uid, 'member');

  return v_room;
end;
$$;

-- 4.3 Admin dodaje osobę (wpis do wyboru tożsamości).
create or replace function public.add_participant(p_room uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_id     uuid;
begin
  if not public.is_room_admin(p_room) then
    raise exception 'forbidden_not_admin' using errcode = '42501';
  end if;

  select r.status into v_status from public.rooms r where r.id = p_room for update;
  if v_status <> 'open' then
    raise exception 'room_already_started';
  end if;

  begin
    insert into public.room_participants (room_id, display_name)
    values (p_room, btrim(p_name))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'duplicate_name' using errcode = '23505';
  end;

  update public.rooms set participant_count = participant_count + 1 where id = p_room;
  return v_id;
end;
$$;

-- 4.4 Admin usuwa wpis, który nikt jeszcze nie przejął.
create or replace function public.remove_participant(p_room uuid, p_participant uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_room_admin(p_room) then
    raise exception 'forbidden_not_admin' using errcode = '42501';
  end if;

  select r.status into v_status from public.rooms r where r.id = p_room for update;
  if v_status <> 'open' then
    raise exception 'room_already_started';
  end if;

  delete from public.room_participants
  where id = p_participant and room_id = p_room and user_id is null;

  if not found then
    raise exception 'participant_not_removable';
  end if;

  update public.rooms set participant_count = participant_count - 1 where id = p_room;
end;
$$;

-- 4.5 Lista osób dla członków pokoju – BEZ user_id (kto jest kim nie wycieka).
create or replace function public.list_participants(p_room uuid)
returns table (id uuid, display_name text, is_claimed boolean, is_mine boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_room_member(p_room) then
    raise exception 'forbidden_not_member' using errcode = '42501';
  end if;

  return query
    select p.id,
           p.display_name,
           (p.user_id is not null)           as is_claimed,
           (p.user_id = auth.uid())          as is_mine
    from public.room_participants p
    where p.room_id = p_room
    order by lower(p.display_name);
end;
$$;

-- 4.6 Wybór tożsamości. Atomowo: wpis zostaje przypisany do użytkownika,
-- więc nikt inny nie może go już przejąć (WHERE user_id IS NULL + blokada pokoju).
create or replace function public.claim_identity(p_room uuid, p_participant uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_status text;
  v_rows   int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_room_member(p_room) then
    raise exception 'forbidden_not_member' using errcode = '42501';
  end if;

  select r.status into v_status from public.rooms r where r.id = p_room for update;
  if v_status <> 'open' then
    raise exception 'room_already_started';
  end if;

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

-- 4.7 Start losowania: wymaga >= 3 osób i przypisania wszystkich tożsamości.
create or replace function public.start_room(p_room uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status  text;
  v_total   int;
  v_claimed int;
begin
  if not public.is_room_admin(p_room) then
    raise exception 'forbidden_not_admin' using errcode = '42501';
  end if;

  select r.status, r.participant_count, r.claimed_count
    into v_status, v_total, v_claimed
  from public.rooms r where r.id = p_room for update;

  if v_status <> 'open' then
    raise exception 'room_already_started';
  end if;
  if v_total < 3 then
    raise exception 'need_at_least_3_participants';
  end if;
  if v_claimed <> v_total then
    raise exception 'all_participants_must_claim_identity';
  end if;

  update public.rooms
     set status = 'started', started_at = now()
   where id = p_room;
end;
$$;

-- 4.8 Losowanie (atomowe, odporne na podwójne kliknięcie i równoległe żądania).
-- Zwraca imię wylosowanej osoby TYLKO wywołującemu.
--
-- Reguła poprawności: losujący U (jeszcze nie losowali) i pula P (jeszcze nie wylosowani)
-- mają równą liczność. Jedyny ślepy zaułek to |U| = 2, gdy pozostała osoba x z U jest
-- jednocześnie w P: wtedy losujący musi wylosować x. Dzięki temu zawsze da się dokończyć losowanie.
create or replace function public.draw_name(p_room uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid           uuid := auth.uid();
  v_status        text;
  v_me            uuid;
  v_target        uuid;
  v_name          text;
  v_unassigned    int;
  v_other         uuid;
  v_other_in_pool boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Blokada wiersza pokoju serializuje wszystkie losowania w tym pokoju.
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

  -- Idempotentnie: jeśli już losował, zwróć ten sam wynik.
  select d.target_id into v_target from public.draws d
  where d.room_id = p_room and d.drawer_id = v_me;

  if v_target is null then
    select count(*) into v_unassigned
    from public.room_participants p
    where p.room_id = p_room
      and not exists (select 1 from public.draws d
                      where d.room_id = p_room and d.drawer_id = p.id);

    -- Gdy zostały dokładnie 2 losujących (ja i v_other), sprawdź, czy v_other jest jeszcze w puli.
    select p.id into v_other
    from public.room_participants p
    where p.room_id = p_room and p.id <> v_me
      and not exists (select 1 from public.draws d
                      where d.room_id = p_room and d.drawer_id = p.id)
    limit 1;

    v_other_in_pool := v_other is not null and exists (
      select 1 from public.room_participants q
      where q.id = v_other
        and not exists (select 1 from public.draws d
                        where d.room_id = p_room and d.target_id = q.id)
    );

    select p.id into v_target
    from public.room_participants p
    where p.room_id = p_room
      and p.id <> v_me                                    -- wyklucz samego siebie
      and not exists (select 1 from public.draws d        -- wyklucz już wylosowanych
                      where d.room_id = p_room and d.target_id = p.id)
      and (v_unassigned <> 2 or not v_other_in_pool or p.id = v_other)  -- unikaj ślepego zaułka
    order by random()
    limit 1;

    if v_target is null then
      raise exception 'no_valid_target';  -- nie powinno wystąpić przy zachowanej niezmienniczości
    end if;

    insert into public.draws (room_id, drawer_id, target_id)
    values (p_room, v_me, v_target);

    update public.rooms set drawn_count = drawn_count + 1 where id = p_room;
  end if;

  select p.display_name into v_name
  from public.room_participants p where p.id = v_target;

  return v_name;
end;
$$;

-- 4.9 Odczyt WŁASNEGO wyniku (null, jeśli jeszcze nie losowano).
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
  where d.room_id = p_room and me.user_id = auth.uid();

  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Uprawnienia do funkcji: tylko zalogowani
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;

grant execute on function public.create_room(text)                     to authenticated;
grant execute on function public.join_room(text)                       to authenticated;
grant execute on function public.add_participant(uuid, text)           to authenticated;
grant execute on function public.remove_participant(uuid, uuid)        to authenticated;
grant execute on function public.list_participants(uuid)               to authenticated;
grant execute on function public.claim_identity(uuid, uuid)            to authenticated;
grant execute on function public.start_room(uuid)                      to authenticated;
grant execute on function public.draw_name(uuid)                       to authenticated;
grant execute on function public.get_my_draw(uuid)                     to authenticated;
-- Funkcje pomocnicze używane przez polityki RLS:
grant execute on function public.is_room_member(uuid)                  to authenticated;
grant execute on function public.is_room_admin(uuid)                   to authenticated;
