"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Room } from "@/lib/santa/types";
import RoomView from "@/components/room/RoomView";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Widok pokoju: /room/?id=UUID (parametr zamiast dynamicznej ścieżki, bo eksport statyczny).
function RoomInner() {
  const id = useSearchParams().get("id") ?? "";
  const [room, setRoom] = useState<Room | null | undefined>(undefined); // undefined = ładowanie

  useEffect(() => {
    if (!UUID.test(id)) {
      setRoom(null);
      return;
    }
    // Jeśli użytkownik nie jest członkiem, RLS zwróci null.
    createClient()
      .from("rooms")
      .select("id, name, invite_code, status, participant_count, claimed_count, drawn_count, budget_pln")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setRoom((data as Room | null) ?? null));
  }, [id]);

  if (room === undefined) return <p className="muted">Ładowanie pokoju… 🕯️</p>;
  if (room === null) {
    return (
      <section>
        <p>Nie masz dostępu do tego pokoju. Otwórz link zaproszenia od administratora, żeby dołączyć.</p>
        <Link href="/">← Strona główna</Link>
      </section>
    );
  }
  return <RoomView key={room.id} initialRoom={room} />;
}

export default function RoomPage() {
  return (
    <Suspense fallback={<p className="muted">Ładowanie… 🎁</p>}>
      <RoomInner />
    </Suspense>
  );
}
