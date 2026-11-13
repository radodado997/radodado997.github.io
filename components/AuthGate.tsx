"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Jedna wspólna obietnica: nawet przy podwójnym uruchomieniu efektu (React StrictMode)
// tworzymy co najwyżej jedną anonimową sesję.
let ensuring: Promise<string | null> | null = null;

function ensureSession(): Promise<string | null> {
  if (!ensuring) {
    ensuring = (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) return null;
      const { error } = await supabase.auth.signInAnonymously();
      return error ? error.message : null;
    })();
  }
  return ensuring;
}

// Bez logowania: każdy odwiedzający dostaje anonimową sesję w przeglądarce (ciasteczka/localStorage).
// Strony renderują się dopiero po jej utworzeniu, więc żadne zapytanie nie leci bez sesji.
export default function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureSession().then((err) => (err ? setError(err) : setReady(true)));
  }, []);

  if (error) {
    return (
      <section>
        <p role="alert">Nie udało się połączyć z serwerem: {error}</p>
      </section>
    );
  }
  if (!ready) return <p className="muted">Ładowanie choinki… 🎄</p>;
  return <>{children}</>;
}
