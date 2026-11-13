"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { messageFor } from "@/lib/santa/errors";
import type { Participant, Room } from "@/lib/santa/types";

type Props = { room: Room; participants: Participant[]; onDone: () => void };

export default function IdentityPicker({ room, participants, onDone }: Props) {
  const [supabase] = useState(() => createClient());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const free = participants.filter((p) => !p.is_claimed);

  async function claim(p: Participant) {
    if (!confirm(`Czy na pewno jesteś: ${p.display_name}? Tej tożsamości nie będzie można zmienić.`)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("claim_identity", { p_room: room.id, p_participant: p.id });
    setBusy(false);
    if (error) setError(messageFor(error));
    else onDone();
  }

  return (
    <section>
      <h2>Kim jesteś?</h2>
      <p className="muted">
        Wybierz swój wpis. Po wyborze ta tożsamość zostaje przypisana tylko do Ciebie.
      </p>
      {free.length === 0 ? (
        <p>Wszystkie wpisy są już wybrane.</p>
      ) : (
        <ul className="list">
          {free.map((p) => (
            <li key={p.id}>
              <span>{p.display_name}</span>
              <button disabled={busy} onClick={() => claim(p)}>To ja</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
