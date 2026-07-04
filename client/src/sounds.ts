import { getSoundEnabled } from "./soundSettings";

function createTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
): AudioBuffer {
  const audioCtx = new (
    window.AudioContext || (window as any).webkitAudioContext
  )();
  const sampleRate = audioCtx.sampleRate;
  const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    data[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 3);
  }
  return buffer;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
) {
  if (!getSoundEnabled()) return; // 👈 check if sound is enabled
  try {
    const audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const buffer = createTone(frequency, duration, type);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  } catch (e) {
    // Silently ignore
  }
}

export const playSound = (type: "move" | "capture" | "win" | "lose") => {
  switch (type) {
    case "move":
      playTone(600, 0.08);
      break;
    case "capture":
      playTone(300, 0.15);
      break;
    case "win":
      playTone(523, 0.2);
      setTimeout(() => playTone(659, 0.2), 200);
      setTimeout(() => playTone(784, 0.3), 400);
      break;
    case "lose":
      playTone(400, 0.3);
      setTimeout(() => playTone(300, 0.3), 300);
      break;
  }
};
