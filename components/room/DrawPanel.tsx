"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { messageFor } from "@/lib/santa/errors";
import type { Room } from "@/lib/santa/types";
import Confetti from "@/components/festive/Confetti";
import FortuneWheel from "@/components/festive/FortuneWheel";

const SPIN_MS = 4500;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Przydziały powstały przy zatwierdzeniu pokoju. Losowanie tylko odsłania wynik
// osoby wywołującej (draw_name); wynik zwraca wyłącznie baza, dla powiązanego konta.
// Panel renderowany jest tylko dla pokoju po starcie i dla osoby z wybraną tożsamością.
export default function DrawPanel({ room }: { room: Room }) {
  const [supabase] = useState(() => createClient());
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_my_draw", { p_room: room.id }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(messageFor(error));
      else setResult((data as string | null) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [room.id, supabase]);

  async function draw() {
    setBusy(true);
    setSpinning(true);
    setError(null);
    // Koło kręci się kilka obrotów plus losowy kąt. To tylko efekt wizualny, nie wynik.
    setAngle((a) => a + 360 * 6 + Math.round(Math.random() * 360));

    // Czekamy, aż skończy się animacja ORAZ odpowie baza; wynik pokazujemy dopiero potem.
    const [rpc] = await Promise.all([supabase.rpc("draw_name", { p_room: room.id }), wait(SPIN_MS)]);

    setSpinning(false);
    setBusy(false);
    if (rpc.error) {
      setError(messageFor(rpc.error));
    } else {
      setResult(rpc.data as string);
      setBurst((b) => b + 1);
    }
  }

  const notDrawnYet = room.participant_count - room.drawn_count;
  const hasBudget = room.budget_pln !== null;

  return (
    <section>
      <h2>🎁 Losowanie prezentów 🎁</h2>
      <p className="budget">
        Budżet prezentu:{" "}
        <strong>{hasBudget ? `${room.budget_pln} zł` : "bez limitu (Mikołaj jest hojny)"}</strong>
        {hasBudget && <span className="muted"> (sugestia, zupełnie wiążąca 🎄)</span>}
      </p>
      <p className="budget">
        Osób, które jeszcze nie losowały: <strong>{notDrawnYet}</strong> z {room.participant_count} ❄️
      </p>

      {loading ? (
        <p className="muted">Przygotowuję sanie… 🛷</p>
      ) : result ? (
        <div className="reveal-wrap">
          <div className="gift" aria-hidden>
            🎁
          </div>
          <p className="result reveal">
            Wylosowałeś/aś:
            <br />
            <strong>{result}</strong> 🎄
          </p>
        </div>
      ) : (
        <>
          <FortuneWheel angle={angle} durationMs={SPIN_MS} />
          <p className="hint" style={{ textAlign: "center" }}>
            Koło to rozrywka dla gości. Wynik losowania pochodzi z bazy, nie z koła 🎡
          </p>
          <div style={{ textAlign: "center" }}>
            <button onClick={draw} disabled={busy}>
              {spinning ? "Koło się kręci… 🎡" : "🎲 Losuj"}
            </button>
          </div>
        </>
      )}

      <p className="hint">
        Wynik widzisz tylko Ty. Pozostali uczestnicy, w tym administrator, nie mają do niego dostępu.
        Mikołaj wie wszystko, ale nie powie. 🎅
      </p>
      {error && <p role="alert">{error}</p>}

      <Confetti burstKey={burst} />
    </section>
  );
}
