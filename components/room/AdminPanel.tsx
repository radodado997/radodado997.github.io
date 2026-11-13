"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { messageFor } from "@/lib/santa/errors";
import type { Participant, Room } from "@/lib/santa/types";

type Props = { room: Room; participants: Participant[]; onChange: () => void };

// Uwaga: to tylko interfejs. Uprawnienia admina egzekwuje baza (is_room_admin w funkcjach RPC).
export default function AdminPanel({ room, participants, onChange }: Props) {
  const [supabase] = useState(() => createClient());
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(messageFor(error));
    else onChange();
    return !error;
  }

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => supabase.rpc("add_participant", { p_room: room.id, p_name: name }))) {
      setName("");
    }
  }

  const canStart = room.participant_count >= 3 && room.claimed_count === room.participant_count;

  return (
    <section>
      <h2>Panel administratora</h2>
      <form onSubmit={addParticipant}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Imię lub nazwa osoby"
          maxLength={80}
          required
        />
        <button disabled={busy || !name.trim()}>Dodaj osobę</button>
      </form>

      <ul className="list">
        {participants.map((p) => (
          <li key={p.id}>
            <span>
              {p.display_name} {p.is_claimed ? "✅" : <span className="muted">(wolne)</span>}
            </span>
            {!p.is_claimed && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run(() => supabase.rpc("remove_participant", { p_room: room.id, p_participant: p.id }))}
              >
                Usuń
              </button>
            )}
          </li>
        ))}
      </ul>

      <button
        disabled={busy || !canStart}
        onClick={() => {
          if (confirm("Rozpocząć losowanie? Po starcie zmiana listy osób nie będzie możliwa.")) {
            run(() => supabase.rpc("start_room", { p_room: room.id }));
          }
        }}
      >
        Start losowania
      </button>
      {!canStart && (
        <p className="hint">
          Start wymaga co najmniej 3 osób, z których każda wybrała swoją tożsamość.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
