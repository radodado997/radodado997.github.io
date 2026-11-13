-- =============================================================================
-- Budżet prezentu ustalany przy tworzeniu pokoju (opcjonalny, w złotych).
-- =============================================================================

alter table public.rooms
  add column budget_pln integer
  check (budget_pln is null or budget_pln between 0 and 100000);

drop function if exists public.create_room(text);

create or replace function public.create_room(p_name text, p_budget_pln integer default null)
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

  insert into public.rooms (name, created_by, budget_pln)
  values (btrim(p_name), v_uid, p_budget_pln)
  returning id into v_room;

  insert into public.room_members (room_id, user_id, role)
  values (v_room, v_uid, 'admin');

  return v_room;
end;
$$;

revoke execute on function public.create_room(text, integer) from public, anon;
grant execute on function public.create_room(text, integer) to authenticated;
