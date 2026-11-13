"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// „Jingle Bells” (1857, domena publiczna), zsyntezowany w Web Audio: zero plików audio.
// Gra w pętli bez końca. Każdy przebieg ma LOSOWE tempo i LOSOWE przesunięcie tonacji.
const MIN_BPM = 90;
const MAX_BPM = 230;
const REST_BEATS = 2; // przerwa między przebiegami

const FREQ: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0,
};

// [nuta, długość w ćwierćnutach]
const MELODY: [string, number][] = [
  ["E4", 1], ["E4", 1], ["E4", 2],
  ["E4", 1], ["E4", 1], ["E4", 2],
  ["E4", 1], ["G4", 1], ["C4", 1.5], ["D4", 0.5], ["E4", 2],
  ["F4", 1], ["F4", 1], ["F4", 1], ["F4", 1],
  ["F4", 1], ["E4", 1], ["E4", 1], ["E4", 1],
  ["E4", 1], ["D4", 1], ["D4", 1], ["E4", 1], ["D4", 2], ["G4", 2],
];

function tone(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  t: number,
  dur: number,
  peak: number,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Jeden przebieg melodii od czasu `start`. Zwraca czas, w którym kończy się przerwa.
function scheduleLoop(ctx: AudioContext, start: number): number {
  const bpm = MIN_BPM + Math.random() * (MAX_BPM - MIN_BPM);
  const q = 60 / bpm;
  const semitones = Math.floor(Math.random() * 7) - 3; // od -3 do +3 półtonów
  const shift = 2 ** (semitones / 12);

  let t = start;
  for (const [note, beats] of MELODY) {
    const dur = beats * q;
    const f = FREQ[note] * shift;
    tone(ctx, "triangle", f, t, dur * 0.9, 0.22);
    tone(ctx, "sine", f * 4, t, 0.35, 0.05); // dzwoneczek
    t += dur;
  }
  return t + REST_BEATS * q;
}

export default function MusicToggle() {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const stoppedByUser = useRef(false);

  const start = useCallback(() => {
    if (ctxRef.current) return;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;

    let nextAt = ctx.currentTime + 0.15;
    const tick = () => {
      if (ctxRef.current !== ctx) return;
      // Planujemy z wyprzedzeniem ok. 2 s, więc pętla nie zacina się i nie ma końca.
      while (nextAt < ctx.currentTime + 2) nextAt = scheduleLoop(ctx, nextAt);
      timerRef.current = window.setTimeout(tick, 400);
    };
    tick();
    setPlaying(true);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    void ctx?.close();
    setPlaying(false);
  }, []);

  // Przeglądarki wymagają gestu użytkownika, więc muzyka rusza przy pierwszym kliknięciu/klawiszu.
  // Jeśli ktoś sam wyciszył, nie włączamy jej ponownie bez jego decyzji.
  useEffect(() => {
    const onFirstGesture = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".music-toggle")) return; // przycisk obsługuje się sam
      if (!stoppedByUser.current) start();
    };
    window.addEventListener("pointerdown", onFirstGesture);
    window.addEventListener("keydown", onFirstGesture);
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      stop();
    };
  }, [start, stop]);

  return (
    <button
      className="music-toggle secondary"
      aria-pressed={playing}
      onClick={() => {
        if (ctxRef.current) {
          stoppedByUser.current = true;
          stop();
        } else {
          stoppedByUser.current = false;
          start();
        }
      }}
    >
      {playing ? "🔇 Wycisz muzykę" : "🎵 Włącz świąteczną muzykę"}
    </button>
  );
}
