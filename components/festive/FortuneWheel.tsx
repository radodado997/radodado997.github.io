"use client";

import type { CSSProperties } from "react";

// Koło fortuny to wyłącznie rozrywka. Segmenty nie mają nic wspólnego z wynikiem losowania,
// który pochodzi z bazy (funkcja draw_name). Wynik nie zależy od tego, gdzie koło się zatrzyma.
const SEGMENTS = [
  "🧦 Skarpetki",
  "☕ Kakao",
  "🥟 Pierogi",
  "🥾 Kalosze",
  "💌 Laurka",
  "🕯️ Świeca",
  "⛄ Bałwan",
  "😇 Zero prezentów",
];
const COLORS = ["#b3123b", "#0b5d3b", "#f5c542", "#7a0c24", "#1fa366", "#c2410c", "#1d4ed8", "#be185d"];
const R = 95;

// Punkt na okręgu; kąt 0 = góra, rośnie zgodnie z ruchem wskazówek zegara.
function point(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [100 + R * Math.sin(rad), 100 - R * Math.cos(rad)];
}

export default function FortuneWheel({
  angle,
  durationMs,
}: {
  angle: number;
  durationMs: number;
}) {
  const step = 360 / SEGMENTS.length;

  return (
    <div className="wheel-wrap">
      <div className="wheel-pointer" aria-hidden>
        ▼
      </div>
      <svg
        viewBox="0 0 200 200"
        className="wheel"
        role="img"
        aria-label="Koło fortuny (dekoracja)"
        style={
          {
            transform: `rotate(${angle}deg)`,
            transitionDuration: `${durationMs}ms`,
          } as CSSProperties
        }
      >
        {SEGMENTS.map((label, i) => {
          const [x1, y1] = point(i * step);
          const [x2, y2] = point((i + 1) * step);
          const mid = i * step + step / 2;
          return (
            <g key={label}>
              <path
                d={`M100,100 L${x1},${y1} A${R},${R} 0 0,1 ${x2},${y2} Z`}
                fill={COLORS[i]}
                stroke="#fff3b0"
                strokeWidth="1.5"
              />
              <text
                x="100"
                y="24"
                transform={`rotate(${mid} 100 100)`}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="700"
                fill="#fff"
              >
                {label}
              </text>
            </g>
          );
        })}
        <circle cx="100" cy="100" r="13" fill="#f5c542" stroke="#5a3a00" strokeWidth="2" />
        <text x="100" y="104" textAnchor="middle" fontSize="12">
          🎅
        </text>
      </svg>
    </div>
  );
}
