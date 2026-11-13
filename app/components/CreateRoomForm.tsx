"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { messageFor } from "@/lib/santa/errors";

const MAX_BUDGET = 100000;

export default function CreateRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Pusty budżet = bez limitu (NULL w bazie).
    let budgetPln: number | null = null;
    if (budget.trim() !== "") {
      budgetPln = Math.round(Number(budget));
      if (!Number.isFinite(budgetPln) || budgetPln < 0 || budgetPln > MAX_BUDGET) {
        setError(`Budżet musi mieścić się w zakresie 0–${MAX_BUDGET.toLocaleString("pl-PL")} zł.`);
        return;
      }
    }

    setBusy(true);
    const { data, error } = await createClient().rpc("create_room", {
      p_name: name,
      p_budget_pln: budgetPln,
    });
    setBusy(false);
    if (error) return setError(messageFor(error));
    router.push(`/room/?id=${data as string}`);
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>Utwórz pokój</h2>
      <p className="muted">Wpisz nazwę i budżet. Zostaniesz administratorem i dostaniesz link dla uczestników.</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="np. Rodzinne Mikołajki"
        maxLength={80}
        required
      />
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_BUDGET}
        step={1}
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        placeholder="Budżet w zł (opcjonalnie)"
        style={{ width: "min(220px, 100%)" }}
      />
      <div>
        <button disabled={busy || !name.trim()}>{busy ? "Ubieram choinkę… 🎄" : "Utwórz"}</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
