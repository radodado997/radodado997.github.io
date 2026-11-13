"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { messageFor } from "@/lib/santa/errors";
import type { MemberRole, Participant, Room } from "@/lib/santa/types";
import AdminPanel from "@/components/room/AdminPanel";
import DrawPanel from "@/components/room/DrawPanel";
import IdentityPicker from "@/components/room/IdentityPicker";

type Me = { id: string; display_name: string } | null;

export default function RoomView({ initialRoom }: { initialRoom: Room }) {
  const [supabase] = useState(() => createClient());
  const [room, setRoom] = useState<Room>(initialRoom);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinBase, setJoinBase] = useState("");
  const [copied, setCopied] = useState(false);

  // Strona pokoju to .../room/, więc ../join/ wskazuje poprawnie także przy basePath (GitHub Pages).
  useEffect(() => {
    setJoinBase(new URL("../join/", window.location.href).href);
  }, []);

  const inviteLink = joinBase ? `${joinBase}?code=${room.invite_code}` : "";

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const reload = useCallback(async () => {
    const [membership, mine, list] = await Promise.all([
      supabase.from("room_members").select("role").eq("room_id", room.id).maybeSingle(),
      supabase.from("room_participants").select("id, display_name").eq("room_id", room.id).maybeSingle(),
      supabase.rpc("list_participants", { p_room: room.id }),
    ]);
    setRole((membership.data?.role as MemberRole | undefined) ?? null);
    setMe((mine.data as Me) ?? null);
    if (list.error) setError(messageFor(list.error));
    else setParticipants((list.data ?? []) as Participant[]);
    setLoading(false);
  }, [room.id, supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Realtime: zmiany statusu i liczników (tylko liczby, RLS filtruje pokoje).
  useEffect(() => {
    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          setRoom((prev) => ({ ...prev, ...(payload.new as Room) }));
          reload();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, supabase, reload]);

  if (loading) return <p>Ładowanie…</p>;

  const isAdmin = role === "admin";
  const isOpen = room.status === "open";

  return (
    <>
      <Link href="/">← Wszystkie pokoje</Link>
      <h1>{room.name}</h1>
      <p className="muted">
        Status: {isOpen ? "zapisy" : "losowanie rozpoczęte"} · Osób: {room.participant_count} ·
        Wybrało tożsamość: {room.claimed_count}
      </p>
      {isAdmin && (
        <section>
          <strong>Link dla uczestników:</strong>
          <p>
            <code style={{ wordBreak: "break-all" }}>{inviteLink || `join/?code=${room.invite_code}`}</code>
          </p>
          <button className="secondary" onClick={copyLink} disabled={!inviteLink}>
            {copied ? "Skopiowano ✓" : "Kopiuj link"}
          </button>
          <p className="hint">Osoba otwiera link, wybiera swoją tożsamość z listy i nie musi się logować.</p>
        </section>
      )}
      {error && <p role="alert">{error}</p>}

      {isAdmin && isOpen && (
        <AdminPanel room={room} participants={participants} onChange={reload} />
      )}

      {isOpen && !me && (
        <IdentityPicker room={room} participants={participants} onDone={reload} />
      )}
      {isOpen && me && (
        <section>
          Twoja tożsamość: <strong>{me.display_name}</strong>. Czekaj na start losowania.
        </section>
      )}

      {!isOpen && me && <DrawPanel room={room} />}
      {!isOpen && !me && (
        <section>Losowanie wystartowało bez Twojej tożsamości, więc nie możesz w nim uczestniczyć.</section>
      )}
    </>
  );
}
