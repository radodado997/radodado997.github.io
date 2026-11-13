"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type Flake = {
  id: number;
  left: number;
  size: number;
  dur: number;
  delay: number;
  drift: number;
  opacity: number;
  char: string;
};

const BULB_COLORS = ["#ff3b3b", "#ffd23f", "#3bd16f", "#3ba7ff", "#ff6fd8"];
const FLAKE_CHARS = ["❄", "❅", "❆", "✻", "•", "❉"];

// Płatki generujemy po stronie klienta (po hydratacji), żeby nie było rozjazdu SSR/klient.
export default function FestiveBackground() {
  const [flakes, setFlakes] = useState<Flake[]>([]);

  useEffect(() => {
    setFlakes(
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 8 + Math.random() * 24,
        dur: 8 + Math.random() * 14,
        delay: -Math.random() * 22,
        drift: Math.random() * 180 - 90,
        opacity: 0.4 + Math.random() * 0.6,
        char: FLAKE_CHARS[i % FLAKE_CHARS.length],
      })),
    );
  }, []);

  return (
    <>
      <div className="lights" aria-hidden>
        {Array.from({ length: 26 }, (_, i) => (
          <span
            key={i}
            className="bulb"
            style={
              {
                "--c": BULB_COLORS[i % BULB_COLORS.length],
                "--d": `${(i * 0.23) % 1.6}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="sleigh" aria-hidden>
        🛷🦌🦌🎅
      </div>

      <div className="ornament o-left" aria-hidden>
        🎄
      </div>
      <div className="ornament o-right" aria-hidden>
        ⛄
      </div>

      {flakes.map((f) => (
        <span
          key={f.id}
          className="snowflake"
          aria-hidden
          style={
            {
              left: `${f.left}%`,
              fontSize: `${f.size}px`,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
              opacity: f.opacity,
              "--drift": `${f.drift}px`,
            } as CSSProperties
          }
        >
          {f.char}
        </span>
      ))}
    </>
  );
}
