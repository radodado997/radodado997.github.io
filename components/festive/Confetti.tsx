"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

const COLORS = ["#ff3b3b", "#ffd23f", "#3bd16f", "#3ba7ff", "#ff6fd8", "#ffffff", "#f5c542"];

type Piece = {
  id: string;
  left: number;
  x: number;
  color: string;
  dur: number;
  delay: number;
};

// Wybuch konfetti. Zmiana `burstKey` uruchamia nowy wybuch; po ~6 s elementy znikają.
export default function Confetti({ burstKey }: { burstKey: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (burstKey === 0) return;
    setPieces(
      Array.from({ length: 120 }, (_, i) => ({
        id: `${burstKey}-${i}`,
        left: Math.random() * 100,
        x: Math.random() * 300 - 150,
        color: COLORS[i % COLORS.length],
        dur: 2.6 + Math.random() * 2.6,
        delay: Math.random() * 0.6,
      })),
    );
    const t = window.setTimeout(() => setPieces([]), 6000);
    return () => clearTimeout(t);
  }, [burstKey]);

  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          aria-hidden
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              "--x": `${p.x}px`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}
