-- =============================================================================
-- Testy pgTAP: uruchamiane przez `supabase test db`
-- Sprawdzają RLS (punkt 5), uprawnienia, poprawność losowania i atomowość reguł.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

-- ---------- helpery: przełączanie między użytkownikami (jak PostgREST z JWT) ----------
create or replace function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text, false);
  set role authenticated;
end $$;

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
  set role anon;
end $$;

create or replace function pg_temp.as_postgres() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', false);
end $$;

-- ---------- użytkownicy ----------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ala@test.pl'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'bartek@test.pl'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'celina@test.pl'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'dawid@test.pl'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'outsider@test.pl');

-- =============================================================================
-- A. Tworzenie pokoju, role, dodawanie i wybór tożsamości
-- =============================================================================
select pg_temp.as_anon();
select throws_ok($$ select public.create_room('x') $$, '42501', null,
  'anon nie może utworzyć pokoju');
select pg_temp.as_postgres();

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select set_config('test.room', public.create_room('Święta')::text, false) $$,
  'zalogowany użytkownik tworzy pokój');
select is((select role from public.room_members
           where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
             and room_id = current_setting('test.room')::uuid),
  'admin', 'twórca pokoju dostaje rolę admin');

select lives_ok($$ select set_config('test.p_ala', public.add_participant(current_setting('test.room')::uuid, 'Ala')::text, false) $$,
  'admin dodaje Alę');
select lives_ok($$ select set_config('test.p_bartek', public.add_participant(current_setting('test.room')::uuid, 'Bartek')::text, false) $$,
  'admin dodaje Bartka');
select lives_ok($$ select set_config('test.p_celina', public.add_participant(current_setting('test.room')::uuid, 'Celina')::text, false) $$,
  'admin dodaje Celinę');
select lives_ok($$ select set_config('test.p_dawid', public.add_participant(current_setting('test.room')::uuid, 'Dawid')::text, false) $$,
  'admin dodaje Dawida');
select set_config('test.code', (select invite_code from public.rooms where id = current_setting('test.room')::uuid), false);
select throws_ok($$ select public.add_participant(current_setting('test.room')::uuid, ' ala ') $$,
  '23505', null, 'duplikat imienia (bez względu na wielkość liter) jest odrzucany');
select throws_ok($$ select public.add_participant(gen_random_uuid(), 'Obcy') $$,
  '42501', null, 'add_participant w obcym pokoju jest odrzucany');

-- Dołączanie
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select lives_ok($$ select public.join_room(current_setting('test.code')) $$,
  'Bartek dołącza kodem zaproszenia');
select throws_ok($$ select set_config('test.p_hack', public.add_participant(current_setting('test.room')::uuid, 'Hack')::text, false) $$,
  '42501', null, 'zwykły członek nie może dodawać osób');
select throws_ok($$ select public.start_room(current_setting('test.room')::uuid) $$,
  '42501', null, 'zwykły członek nie może wystartować losowania');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003');
select lives_ok($$ select public.join_room(current_setting('test.code')) $$,
  'Celina dołącza kodem zaproszenia');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000004');
select lives_ok($$ select public.join_room(current_setting('test.code')) $$,
  'Dawid dołącza kodem zaproszenia');

-- Outsider: nie widzi pokoju i nie może pobrać listy
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000005');
select is((select count(*)::int from public.rooms), 0, 'outsider nie widzi cudzych pokoi');
select throws_ok($$ select * from public.list_participants(current_setting('test.room')::uuid) $$,
  '42501', null, 'outsider nie może pobrać listy uczestników');
select throws_ok($$ select public.join_room('NIEMA-TAKIEGO') $$,
  'P0002', null, 'złe kody zaproszenia są odrzucane');

-- Wybór tożsamości: pierwszy wygrywa, drugi dostaje błąd
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select public.claim_identity(current_setting('test.room')::uuid,
    current_setting('test.p_ala')::uuid) $$,
  'admin przypisuje sobie tożsamość Ala');
select throws_ok($$ select public.claim_identity(current_setting('test.room')::uuid,
    current_setting('test.p_bartek')::uuid) $$,
  'P0001', 'already_claimed', 'jeden użytkownik nie może wybrać dwóch tożsamości');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select throws_ok($$ select public.claim_identity(current_setting('test.room')::uuid,
    current_setting('test.p_ala')::uuid) $$,
  'P0001', 'identity_unavailable', 'Bartek nie może przejąć tożsamości Ali');
select lives_ok($$ select public.claim_identity(current_setting('test.room')::uuid,
    current_setting('test.p_bartek')::uuid) $$,
  'Bartek wybiera swoją tożsamość');

-- Lista uczestników: bez user_id, z flagą is_mine
select is((select count(*)::int from public.list_participants(current_setting('test.room')::uuid)),
  4, 'lista uczestników zawiera 4 osoby');
select is((select is_mine from public.list_participants(current_setting('test.room')::uuid)
           where display_name = 'Bartek'), true, 'Bartek widzi, że jego wpis jest jego');

-- Start: wymaga przypisania wszystkich tożsamości
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select public.start_room(current_setting('test.room')::uuid) $$,
  'P0001', 'all_participants_must_claim_identity', 'start blokowany, dopóki ktoś nie wybrał tożsamości');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003');
select lives_ok($$ select public.claim_identity(current_setting('test.room')::uuid,
    current_setting('test.p_celina')::uuid) $$,
  'Celina wybiera tożsamość');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000004');
select lives_ok($$ select public.claim_identity(current_setting('test.room')::uuid,
    current_setting('test.p_dawid')::uuid) $$,
  'Dawid wybiera tożsamość');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select public.start_room(current_setting('test.room')::uuid) $$,
  'admin startuje losowanie po przypisaniu wszystkich');
select is((select status from public.rooms where id = current_setting('test.room')::uuid),
  'started', 'status pokoju to started');
select throws_ok($$ select set_config('test.p_nowy', public.add_participant(current_setting('test.room')::uuid, 'Nowy')::text, false) $$,
  'P0001', 'room_already_started', 'po starcie nie można dodawać osób');

-- Każdy członek ma swoją tożsamość; dane kontrolne
select pg_temp.as_postgres();
select is((select count(*)::int from public.room_participants
           where room_id = current_setting('test.room')::uuid and user_id is null),
  0, 'wszystkie wpisy mają przypisanego użytkownika');

-- =============================================================================
-- B. Losowanie i prywatność wyników (punkt 5)
-- =============================================================================
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select isnt(public.draw_name(current_setting('test.room')::uuid), 'Ala',
  'losujący nie wylosuje samego siebie');
select is(public.draw_name(current_setting('test.room')::uuid),
          public.get_my_draw(current_setting('test.room')::uuid),
  'ponowne wywołanie losowania zwraca ten sam wynik (idempotencja)');
select is((select count(*)::int from public.draws), 1, 'admin widzi tylko swoje losowanie');
select throws_ok($$ select public.draw_name(gen_random_uuid()) $$,
  'P0002', null, 'losowanie w nieistniejącym pokoju jest odrzucane');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000005');
select throws_ok($$ select public.draw_name(current_setting('test.room')::uuid) $$,
  'P0001', 'no_identity', 'outsider bez tożsamości nie może losować');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select lives_ok($$ select public.draw_name(current_setting('test.room')::uuid) $$,
  'Bartek losuje');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003');
select lives_ok($$ select public.draw_name(current_setting('test.room')::uuid) $$,
  'Celina losuje');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000004');
select lives_ok($$ select public.draw_name(current_setting('test.room')::uuid) $$,
  'Dawid losuje');

-- Członek widzi wyłącznie własny wynik (RLS na tabeli draws)
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003');
select is((select count(*)::int from public.draws), 1, 'Celina widzi dokładnie jeden wiersz losowania');
select is((select count(*)::int from public.draws d
           join public.room_participants p on p.id = d.drawer_id
           where p.display_name <> 'Celina'), 0, 'Celina nie widzi losowań innych osób');
select isnt(public.get_my_draw(current_setting('test.room')::uuid), null,
  'Celina odczytuje swój wynik przez get_my_draw');

-- Wynik Celiny nie jest widoczny nawet dla admina ani innych
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is((select count(*)::int from public.draws
           where drawer_id <> current_setting('test.p_ala')::uuid), 0,
  'admin nie widzi losowań pozostałych osób (punkt 5)');
select is((select drawn_count from public.rooms where id = current_setting('test.room')::uuid),
  4, 'członek widzi wyłącznie liczbę wylosowanych (licznik), nie kto kogo');
select is((select count(*)::int from public.room_participants),
  1, 'bezpośredni SELECT na room_participants zwraca tylko własny wiersz');

-- Brak bezpośredniego zapisu z klienta
select throws_ok($$ insert into public.draws (room_id, drawer_id, target_id)
                    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
  '42501', null, 'klient nie może wstawić losowania bezpośrednio');
select throws_ok($$ update public.rooms set drawn_count = 0 $$,
  '42501', null, 'klient nie może zmienić liczników pokoju');
select throws_ok($$ update public.room_participants set user_id = null $$,
  '42501', null, 'klient nie może zmienić przypisania tożsamości');
select throws_ok($$ delete from public.draws $$,
  '42501', null, 'klient nie może usuwać losowań');

-- Dokończenie: Ala (admin) jest ostatnia; sprawdzamy kompletność i poprawność
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select isnt(public.draw_name(current_setting('test.room')::uuid), null, 'ponowne losowanie przez admina zwraca wynik (idempotencja)');

select pg_temp.as_postgres();
select is((select count(*)::int from public.draws where room_id = current_setting('test.room')::uuid),
  4, 'każdy uczestnik ma dokładnie jedno losowanie');
select is((select count(distinct target_id)::int from public.draws
           where room_id = current_setting('test.room')::uuid),
  4, 'każda osoba została wylosowana dokładnie raz');
select is((select count(*)::int from public.draws
           where room_id = current_setting('test.room')::uuid and drawer_id = target_id),
  0, 'nikt nie wylosował samego siebie');
select is((select drawn_count from public.rooms where id = current_setting('test.room')::uuid),
  4, 'licznik wylosowanych jest zgodny z liczbą losowań');

-- Budżet ustalany przy tworzeniu pokoju
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select public.create_room('Zły budżet', -5) $$, '23514', null,
  'ujemny budżet jest odrzucany');
select lives_ok($$ select set_config('test.budget_room', public.create_room('Z budżetem', 75)::text, false) $$,
  'pokój z budżetem zostaje utworzony');
select is((select budget_pln from public.rooms where id = current_setting('test.budget_room')::uuid), 75,
  'budżet zapisuje się przy tworzeniu pokoju');
select lives_ok($$ select set_config('test.nobudget_room', public.create_room('Bez budżetu')::text, false) $$,
  'pokój bez budżetu zostaje utworzony');
select is((select budget_pln from public.rooms where id = current_setting('test.nobudget_room')::uuid), null,
  'budżet jest opcjonalny (NULL = bez limitu)');
select pg_temp.as_postgres();

-- =============================================================================
-- C. Poprawność algorytmu na wielu losowych grach (w tym przypadki ślepego zaułka)
-- =============================================================================
create or replace function pg_temp.play_game(p_n int) returns boolean
language plpgsql as $$
declare
  v_users  uuid[] := '{}';
  v_pids   uuid[] := '{}';
  v_room   uuid;
  v_code   text;
  v_admin  uuid;
  v_order  uuid[];
  v_pid    uuid;
  u        uuid;
  i        int;
begin
  for i in 1..p_n loop
    v_users := v_users || gen_random_uuid();
  end loop;
  insert into auth.users (id, email)
    select x, x::text || '@game.test' from unnest(v_users) x;
  v_admin := v_users[1];

  perform pg_temp.as_user(v_admin);
  v_room := public.create_room('gra');
  for i in 1..p_n loop
    v_pids := v_pids || public.add_participant(v_room, 'p' || i);
  end loop;
  select invite_code into v_code from public.rooms where id = v_room;

  for i in 1..p_n loop
    perform pg_temp.as_user(v_users[i]);
    perform public.join_room(v_code);
    perform public.claim_identity(v_room, v_pids[i]);
  end loop;

  perform pg_temp.as_user(v_admin);
  perform public.start_room(v_room);

  -- losowa kolejność losujących, żeby trafiać różne ścieżki
  select array_agg(x order by random()) into v_order from unnest(v_users) x;
  foreach u in array v_order loop
    perform pg_temp.as_user(u);
    perform public.draw_name(v_room);
  end loop;

  perform pg_temp.as_postgres();
  if (select count(*) from public.draws where room_id = v_room) <> p_n then
    raise exception 'game %: liczba losowań <> n', p_n;
  end if;
  if (select count(distinct target_id) from public.draws where room_id = v_room) <> p_n then
    raise exception 'game %: ktoś wylosowany więcej niż raz lub wcale', p_n;
  end if;
  if exists (select 1 from public.draws where room_id = v_room and drawer_id = target_id) then
    raise exception 'game %: samolosowanie', p_n;
  end if;
  return true;
end $$;

create or replace function pg_temp.run_games(p_count int) returns int
language plpgsql as $$
declare
  ok int := 0;
  i  int;
begin
  for i in 1..p_count loop
    if pg_temp.play_game(3 + (i % 6)) then ok := ok + 1; end if;
  end loop;
  return ok;
end $$;

select is(pg_temp.run_games(300), 300,
  '300 losowych gier (n = 3..8) zawsze kończy się poprawnym losowaniem bez ślepego zaułka');

select * from finish();
rollback;
