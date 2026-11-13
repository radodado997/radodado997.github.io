"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { messageFor } from "@/lib/santa/errors";

// Link zaproszenia: /join/?code=KOD. Dołącza do pokoju i przenosi do widoku pokoju,
// gdzie wybierasz swoją tożsamość z listy przygotowanej przez admina.
function JoinInner() {
  const code = useSearchParams().get("code") ?? "";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError("Ten link nie zawiera kodu zaproszenia.");
      return;
    }
    let cancelled = false;
    createClient()
      .rpc("join_room", { p_code: code })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) return setError(messageFor(error));
        router.replace(`/room/?id=${data as string}`);
      });
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  return (
    <section>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <a href="/">← Strona główna</a>
        </>
      ) : (
        <p>Dołączanie do pokoju… 🎄</p>
      )}
    </section>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="muted">Dołączanie… 🎁</p>}>
      <JoinInner />
    </Suspense>
  );
}
