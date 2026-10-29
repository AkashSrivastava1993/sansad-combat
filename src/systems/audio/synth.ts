import type { SfxInfo, SfxName } from './sfx';

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let blockClip: AudioBuffer | null = null;
let blockClipEndsAt = 0;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  // Overlapping hits would clip without a compressor.
  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp).connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  void loadBuffer(ctx, '/sfx/block.mp3').then((b) => (blockClip = b));
  return ctx;
}

// Mobile browsers only allow audio after a user gesture.
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
function unlock(): void {
  const c = audio();
  if (!c) return;
  void c.resume().then(() => {
    if (c.state === 'running') UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlock));
  });
}
UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlock, { passive: true }));

function envelope(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0, attack = 0.004): void {
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  envelope(g, t, peak, attack, dur);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + attack + dur + 0.02);
}

function noise(c: AudioContext, filter: BiquadFilterType, f0: number, f1: number, dur: number, peak: number, q = 1, delay = 0, attack = 0.004): void {
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const biquad = c.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(f0, t);
  biquad.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  envelope(g, t, peak, attack, dur);
  src.connect(biquad).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.02);
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function hit(c: AudioContext, damage: number): void {
  const k = clamp(damage / 12, 0.5, 1.6);
  const r = 0.9 + Math.random() * 0.25;
  tone(c, 'sine', 180 * r, 45, 0.16, 0.9 * k);
  tone(c, 'triangle', 340 * r, 90, 0.08, 0.35 * k);
  noise(c, 'bandpass', 1900, 600, 0.08, 0.55 * k, 0.8);
  if (k > 1) tone(c, 'sine', 95, 30, 0.35, 0.8);
}

const SYNTHS: Record<SfxName, (c: AudioContext, info: SfxInfo) => void> = {
  attack: (c) => noise(c, 'bandpass', 450 + Math.random() * 200, 2400, 0.14, 0.22, 1.2, 0, 0.05),
  hit: (c, info) => hit(c, info.damage ?? 10),
  block: (c) => {
    tone(c, 'square', 190, 120, 0.07, 0.18);
    tone(c, 'triangle', 720, 520, 0.1, 0.12);
    noise(c, 'highpass', 3200, 3200, 0.05, 0.25);
  },
  shield: (c) => {
    tone(c, 'sine', 1040, 1020, 0.55, 0.22);
    tone(c, 'sine', 1560, 1530, 0.4, 0.12);
    noise(c, 'highpass', 4000, 4000, 0.04, 0.15);
  },
  special: (c) => {
    tone(c, 'sawtooth', 150, 900, 0.45, 0.16, 0, 0.1);
    noise(c, 'bandpass', 300, 4000, 0.45, 0.25, 2, 0, 0.1);
    tone(c, 'sine', 1200, 2600, 0.3, 0.14, 0.3);
    tone(c, 'sine', 90, 40, 0.4, 0.5, 0.42);
  },
  ko: (c) => {
    tone(c, 'sine', 120, 28, 0.8, 1.0);
    tone(c, 'sawtooth', 70, 30, 0.5, 0.25);
    noise(c, 'lowpass', 900, 90, 0.9, 0.7, 0.5);
  },
  roundStart: (c) => {
    tone(c, 'sine', 196, 194, 1.3, 0.3);
    tone(c, 'sine', 294, 291, 1.0, 0.2);
    tone(c, 'sine', 392, 388, 0.7, 0.15);
    noise(c, 'bandpass', 3000, 3000, 0.08, 0.1);
  },
  fight: (c) => {
    tone(c, 'square', 392, 392, 0.12, 0.16);
    tone(c, 'square', 587, 587, 0.3, 0.2, 0.12);
    tone(c, 'sine', 100, 50, 0.3, 0.6, 0.12);
  },
  timeUp: (c) => {
    tone(c, 'sawtooth', 140, 130, 0.55, 0.22);
    tone(c, 'square', 140, 130, 0.55, 0.1, 0.02);
  },
  win: (c) => {
    tone(c, 'square', 523, 523, 0.14, 0.14);
    tone(c, 'square', 659, 659, 0.14, 0.14, 0.14);
    tone(c, 'square', 784, 784, 0.4, 0.16, 0.28);
  },
};

const VOICE_EXTENSIONS = ['mp3', 'm4a', 'ogg', 'wav'];
const voices = new Map<string, Promise<AudioBuffer | null>>();

async function loadBuffer(c: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    // The dev server answers unknown paths with index.html.
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
    return await c.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchVoice(c: AudioContext, id: string): Promise<AudioBuffer | null> {
  for (const ext of VOICE_EXTENSIONS) {
    const buffer = await loadBuffer(c, `/voices/${id}.${ext}`);
    if (buffer) return buffer;
  }
  return null;
}

/** Looks for public/voices/<id>.(mp3|m4a|ogg|wav) once per session; the match-win clip is `<fighter id>-win`. */
export function preloadVoice(id: string): void {
  const c = audio();
  if (c && !voices.has(id)) voices.set(id, fetchVoice(c, id));
}

export interface VoiceHandle {
  stop(): void;
}

interface ActiveVoice extends VoiceHandle {
  startedAt: number;
  playing: boolean;
}

/** A newer voice may only cut in on one that has already been talking this long (seconds). */
const VOICE_PRIORITY_S = 4.5;
let currentVoice: ActiveVoice | null = null;

/** Starts a fighter's voice clip; an earlier clip keeps the floor for VOICE_PRIORITY_S unless `force` is set. */
export function startVoice(id: string, force = false): VoiceHandle | null {
  const c = audio();
  const loading = voices.get(id);
  if (!c || !master || c.state !== 'running' || !loading) return null;
  if (!force && currentVoice?.playing && c.currentTime - currentVoice.startedAt < VOICE_PRIORITY_S) return null;
  currentVoice?.stop();

  let src: AudioBufferSourceNode | null = null;
  const gain = c.createGain();
  gain.connect(master);
  const voice: ActiveVoice = {
    startedAt: c.currentTime,
    playing: true,
    stop() {
      if (!voice.playing) return;
      voice.playing = false;
      // A short fade avoids a click.
      gain.gain.setTargetAtTime(0, c.currentTime, 0.015);
      src?.stop(c.currentTime + 0.08);
    },
  };
  currentVoice = voice;
  void loading.then((buffer) => {
    if (!buffer || !voice.playing) {
      voice.playing = false;
      return;
    }
    src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.onended = () => {
      voice.playing = false;
    };
    src.start();
  });
  return voice;
}

export function synthPlay(name: SfxName, info: SfxInfo): void {
  const c = audio();
  if (!c || c.state !== 'running') return;
  if (name === 'block' && blockClip) {
    // Back-to-back blocks would stack the long clip, so let it finish first.
    if (c.currentTime < blockClipEndsAt) return;
    const src = c.createBufferSource();
    src.buffer = blockClip;
    src.connect(master!);
    src.start();
    blockClipEndsAt = c.currentTime + blockClip.duration;
    return;
  }
  SYNTHS[name](c, info);
  if (name === 'win' && info.fighterId) startVoice(`${info.fighterId}-win`, true);
}
