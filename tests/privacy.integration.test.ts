// Test integracyjny punktu 5 przez REST/RPC (dokładnie tak, jak działa klient).
// Model: przydziały powstają przy zatwierdzeniu (start_room), a draw_name tylko odsłania wynik.
// Wymaga działającego projektu Supabase z migracjami oraz zmiennych w środowisku:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Bez nich test jest pomijany. Uruchomienie: npm test
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(URL && ANON && SERVICE);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!enabled)("punkt 5: prywatność wyników przez API (RLS + RPC)", () => {
  const admin = enabled ? createClient(URL!, SERVICE!, opts) : (null as unknown as SupabaseClient);
  const created: string[] = [];

  // Bez logowania: każdy uczestnik to anonimowa sesja (ta sama ścieżka co w aplikacji).
  async function newUser() {
    const client = createClient(URL!, ANON!, opts);
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    created.push(data.user!.id);
    return { client, id: data.user!.id };
  }

  let roomId: string;
  const players: { client: SupabaseClient; id: string }[] = [];
  let outsider: SupabaseClient;
  const names: string[] = [];
  const participantIds: string[] = [];

  beforeAll(async () => {
    for (let i = 0; i < 3; i++) players.push(await newUser());
    outsider = (await newUser()).client;

    const [admin0] = players;
    const { data: rid, error: createErr } = await admin0.client.rpc("create_room", { p_name: "Test" });
    if (createErr) throw createErr;
    roomId = rid as string;

    const { data: room, error: codeErr } = await admin0.client
      .from("rooms").select("invite_code").eq("id", roomId).single();
    if (codeErr) throw codeErr;

    for (const n of ["Ala", "Bartek", "Celina"]) {
      names.push(n);
      const { data, error } = await admin0.client.rpc("add_participant", { p_room: roomId, p_name: n });
      if (error) throw error;
      participantIds.push(data as string);
    }

    for (let i = 1; i < 3; i++) {
      const { error } = await players[i].client.rpc("join_room", { p_code: room!.invite_code });
      if (error) throw error;
    }

    // Admin i pierwszy uczestnik wybierają tożsamość przed startem; trzeci dopiero po nim.
    for (let i = 0; i < 2; i++) {
      const { error } = await players[i].client.rpc("claim_identity", {
        p_room: roomId,
        p_participant: participantIds[i],
      });
      if (error) throw error;
    }

    const { error: startErr } = await admin0.client.rpc("start_room", { p_room: roomId });
    if (startErr) throw startErr;

    const { error: lateErr } = await players[2].client.rpc("claim_identity", {
      p_room: roomId,
      p_participant: participantIds[2],
    });
    if (lateErr) throw lateErr;
  });

  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  it("przed losowaniem get_my_draw nie zdradza wyniku", async () => {
    const { data, error } = await players[1].client.rpc("get_my_draw", { p_room: roomId });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("osoba, która wybrała tożsamość po zatwierdzeniu, może wylosować", async () => {
    const { data, error } = await players[2].client.rpc("draw_name", { p_room: roomId });
    expect(error).toBeNull();
    expect(names).toContain(data);
  });

  it("losowanie jest idempotentne i get_my_draw zwraca ten sam wynik", async () => {
    const first = await players[0].client.rpc("draw_name", { p_room: roomId });
    const second = await players[0].client.rpc("draw_name", { p_room: roomId });
    expect(first.error).toBeNull();
    expect(second.data).toBe(first.data);
    const mine = await players[0].client.rpc("get_my_draw", { p_room: roomId });
    expect(mine.data).toBe(first.data);
  });

  it("klient nie może czytać tabeli draws (ani swoich, ani cudzych)", async () => {
    for (const p of players) {
      const { error } = await p.client.from("draws").select("*");
      expect(error).not.toBeNull();
    }
  });

  it("każdy losuje raz, a licznik rośnie wspólnie dla wszystkich", async () => {
    const { error } = await players[1].client.rpc("draw_name", { p_room: roomId });
    expect(error).toBeNull();
    const { data } = await players[1].client.from("rooms").select("participant_count, drawn_count").eq("id", roomId).single();
    expect(data).toEqual({ participant_count: 3, drawn_count: 3 });
  });

  it("bezpośredni SELECT na room_participants zwraca tylko własny wiersz", async () => {
    const { data } = await players[1].client.from("room_participants").select("*");
    expect(data).toHaveLength(1);
  });

  it("lista uczestników nie zawiera user_id (nie da się powiązać osoby z kontem)", async () => {
    const { data, error } = await players[0].client.rpc("list_participants", { p_room: roomId });
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    for (const row of data as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty("user_id");
    }
  });

  it("osoba spoza pokoju nie widzi pokoju, losowań ani listy uczestników", async () => {
    const rooms = await outsider.from("rooms").select("id");
    expect(rooms.data).toHaveLength(0);
    const draws = await outsider.from("draws").select("*");
    expect(draws.error).not.toBeNull();
    const list = await outsider.rpc("list_participants", { p_room: roomId });
    expect(list.error).not.toBeNull();
    const mine = await outsider.rpc("get_my_draw", { p_room: roomId });
    expect(mine.error).not.toBeNull();
  });

  it("klient nie może zapisywać bezpośrednio do tabel", async () => {
    const { error: e1 } = await players[0].client.from("rooms").update({ drawn_count: 0 }).eq("id", roomId);
    const { error: e2 } = await players[0].client.from("draws").insert({
      room_id: roomId,
      drawer_id: "00000000-0000-0000-0000-000000000000",
      target_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
  });
});
