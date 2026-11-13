"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CreateRoomForm from "./components/CreateRoomForm";

type RoomRow = { id: string; name: string; status: string; participant_count: number };

export default function HomePage() {
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);

  useEffect(() => {
    // RLS zwraca wyłącznie pokoje, do których ta przeglądarka dołączyła.
    createClient()
      .from("rooms")
      .select("id, name, status, participant_count")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRooms((data ?? []) as RoomRow[]));
  }, []);

  return (
    <>
      <h1>🎄 Secret Santa 🎁</h1>
      <p className="subtitle">Cichy Mikołaj z budżetem nieograniczonym (w teorii)</p>

      <CreateRoomForm />

      <section>
        <h2>Twoje pokoje</h2>
        {rooms === null ? (
          <p className="muted">Szukam Twoich pokoi… 🔍</p>
        ) : rooms.length > 0 ? (
          <ul className="list">
            {rooms.map((r) => (
              <li key={r.id}>
                <a href={`room/?id=${r.id}`}>{r.name}</a>
                <span className="muted">
                  {r.status === "open" ? "zapisy" : "losowanie trwa"} · {r.participant_count} os.
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nie dołączyłeś jeszcze do żadnego pokoju. Otwórz link zaproszenia.</p>
        )}
      </section>
    </>
  );
}
