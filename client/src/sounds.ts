import { getSoundEnabled } from "./soundSettings";

type SoundName = "move" | "capture" | "win" | "lose";

const FILES: Record<SoundName, string> = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
  win: "/sounds/win.mp3",
  lose: "/sounds/lose.mp3",
};

// Audio elements are created once and reused. The old code built a brand-new
// AudioContext (twice!) for every single sound — browsers cap the number of
// contexts, so sounds lagged and then stopped working in longer games.
const cache: Partial<Record<SoundName, HTMLAudioElement>> = {};
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(frequency: number, duration: number) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.25, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

function fallback(type: SoundName) {
  switch (type) {
    case "move":
      beep(600, 0.08);
      break;
    case "capture":
      beep(300, 0.15);
      break;
    case "win":
      beep(523, 0.2);
      setTimeout(() => beep(659, 0.2), 200);
      setTimeout(() => beep(784, 0.3), 400);
      break;
    case "lose":
      beep(400, 0.3);
      setTimeout(() => beep(300, 0.3), 300);
      break;
  }
}

export const playSound = (type: SoundName) => {
  if (!getSoundEnabled()) return;
  try {
    let el = cache[type];
    if (!el) {
      el = new Audio(FILES[type]);
      el.preload = "auto";
      cache[type] = el;
    }
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => fallback(type));
  } catch {
    fallback(type);
  }
};

// Warm the cache so the first move doesn't wait on a network fetch.
export const preloadSounds = () => {
  (Object.keys(FILES) as SoundName[]).forEach((k) => {
    if (!cache[k]) {
      const a = new Audio(FILES[k]);
      a.preload = "auto";
      cache[k] = a;
    }
  });
};
