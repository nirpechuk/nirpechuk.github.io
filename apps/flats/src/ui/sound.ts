/** Tiny synthesized sounds (paper rustle, pop, chime) so there are no audio files to ship. */

const SOUND_KEY = "flats:sound";
let audioContext: AudioContext | null = null;

export function soundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "off";
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
}

function context(): AudioContext | null {
  if (!soundEnabled() || typeof AudioContext === "undefined") return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

export function playRustle(): void {
  const ctx = context();
  if (!ctx) return;
  const duration = 0.32;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) {
    const progress = index / samples.length;
    const crackle = Math.random() < 0.08 ? 1 : 0.35;
    samples[index] = (Math.random() * 2 - 1) * crackle * (1 - progress) ** 2;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3200;
  filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = 0.18;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

function tone(frequency: number, start: number, length: number, volume: number): void {
  const ctx = context();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  const gain = ctx.createGain();
  const at = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.05);
}

export function playPop(): void {
  tone(660, 0, 0.12, 0.12);
}

export function playChime(): void {
  tone(784, 0, 0.35, 0.12);
  tone(988, 0.1, 0.35, 0.1);
  tone(1319, 0.2, 0.5, 0.08);
}
