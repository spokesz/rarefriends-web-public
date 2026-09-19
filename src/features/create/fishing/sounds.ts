/** Original demo cues, synthesized locally without audio downloads or SDK dependencies. */
type Tone = Readonly<{
  kind: "tone"; at: number; midi: number; duration: number; level: number;
  endMidi?: number; chip?: number; decay?: number; attack?: number; release?: number;
}>;
type Tick = Readonly<{ kind: "tick"; at: number; level: number; clap: boolean }>;
type Voice = Tone | Tick;
type Cue = Readonly<{ duration: number; seed: number; voices: readonly Voice[] }>;
const SAMPLE_RATE = 48_000;
const tone = (midi: number, duration: number, level: number, at = 0, options: Partial<Omit<Tone, "kind" | "midi" | "duration" | "level" | "at">> = {}): Tone =>
  ({ kind: "tone", at, midi, duration, level, ...options });
const tick = (at: number, level: number, clap = false): Tick => ({ kind: "tick", at, level, clap });
const sparkle = (notes: readonly number[], at = 0, level = 0.25): Tone[] => notes.map((midi, index) =>
  tone(midi, [0.09, 0.11, 0.22][index], level * [1, 0.85, 0.7][index], at + [0, 0.055, 0.12][index], { attack: 0.005, release: 0.027, chip: 0.18 }));

// Seeds retain each cue's original position in the sound kit, including the unused purchase cue.
const cues = {
  select: { duration: 0.1, seed: 1, voices: [tone(67, 0.08, 0.22, 0, { attack: 0.003, release: 0.02 })] },
  "action-start": { duration: 0.25, seed: 3, voices: [tone(48, 0.21, 0.23, 0, { endMidi: 60, decay: 1, chip: 0.16 }), tick(0.025, 0.09)] },
  "action-ready": { duration: 0.27, seed: 4, voices: [tone(76, 0.085, 0.24, 0, { attack: 0.004, release: 0.025, chip: 0.18 }), tone(79, 0.12, 0.25, 0.115, { attack: 0.004, release: 0.03, chip: 0.18 })] },
  anticipation: { duration: 0.3, seed: 5, voices: [...sparkle([60, 64, 67]).map(voice => ({ ...voice, duration: Math.min(voice.duration, 0.14) })), tick(0, 0.08), tick(0.055, 0.07), tick(0.12, 0.06)] },
  impact: { duration: 0.23, seed: 6, voices: [tone(57, 0.17, 0.14, 0, { endMidi: 40, chip: 0.12, decay: 0.55 }), tick(0, 0.25, true), tick(0.035, 0.13, true), tick(0.075, 0.08, true)] },
  "reveal-common": { duration: 0.38, seed: 7, voices: [tone(48, 0.24, 0.17, 0, { chip: 0.12, decay: 0.65 }), ...sparkle([60, 64, 67])] },
  "reveal-rare": { duration: 0.58, seed: 8, voices: [tone(43, 0.24, 0.15, 0, { chip: 0.12, decay: 0.65 }), ...sparkle([67, 72, 76]), tone(76, 0.37, 0.09, 0.18, { chip: 0.1, decay: 1.2, release: 0.1 })] },
  "reveal-legendary": { duration: 1.05, seed: 9, voices: [tone(48, 0.18, 0.12, 0, { endMidi: 60, chip: 0.16 }), ...sparkle([72, 76, 79], 0.13, 0.27),
    ...[36, 60, 64, 67].map((midi, index) => tone(midi, 0.65, [0.19, 0.14, 0.1, 0.08][index], 0.37, { decay: 1.4, attack: 0.016, release: 0.2, chip: 0.1 })),
  ] },
  reward: { duration: 0.36, seed: 10, voices: sparkle([72, 76, 79]) },
} satisfies Record<string, Cue>;
export type FishingSoundCue = keyof typeof cues;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const triangle = (phase: number) => 4 * Math.abs(phase % 1 - 0.5) - 1;
const smooth = (amount: number) => Math.sin(Math.PI / 2 * Math.min(1, Math.max(0, amount))) ** 2;

function renderSound(cue: FishingSoundCue): Float32Array {
  const definition: Cue = cues[cue];
  const output = new Float64Array(Math.round(definition.duration * SAMPLE_RATE));
  let randomState = 0x52465354 ^ definition.seed;
  const noise = () => {
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    return (randomState >>> 0) / 0x100000000 * 2 - 1;
  };
  for (const voice of definition.voices) {
    const duration = voice.kind === "tone" ? voice.duration : voice.clap ? 0.105 : 0.037;
    const count = Math.round(duration * SAMPLE_RATE), start = Math.round(voice.at * SAMPLE_RATE);
    let phase = 0, filtered = 0;
    for (let index = 0; index < count && start + index < output.length; index++) {
      const t = index / SAMPLE_RATE, remaining = (count - 1 - index) / SAMPLE_RATE;
      let sample: number;
      if (voice.kind === "tone") {
        const frequency = hz(voice.midi), end = hz(voice.endMidi ?? voice.midi);
        phase += frequency * (end / frequency) ** (t / duration) / SAMPLE_RATE;
        const envelope = smooth(t / (voice.attack ?? 0.009)) * smooth(remaining / (voice.release ?? 0.045)) * Math.exp(-t / (duration * (voice.decay ?? 0.78)));
        const chip = voice.chip ?? 0.24;
        sample = voice.level * envelope * ((1 - chip) * Math.sin(2 * Math.PI * phase) + chip * triangle(phase + 0.75));
      } else {
        filtered += (1 - (1 - 0.17) ** (48000 / SAMPLE_RATE)) * (noise() - filtered);
        const envelope = Math.min(1, t / 0.001) * Math.exp(-t / (voice.clap ? 0.021 : 0.007)) * Math.min(1, remaining / 0.009);
        sample = voice.level * envelope * (0.8 * filtered + 0.2 * Math.sin(2 * Math.PI * (voice.clap ? 210 : 740) * t));
      }
      output[start + index] += sample;
    }
  }
  let peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  const gain = peak ? 0.7 / peak : 0;
  return Float32Array.from(output, sample => sample * gain);
}

/** Audio starts only after a game gesture; hiding, muting or leaving stops every cue. */
export function createFishingSounds() {
  let context: AudioContext | null = null, master: GainNode | null = null;
  let muted = false, unlocked = false, unsupported = false, disposed = false, generation = 0;
  let pending: Promise<boolean> | null = null;
  const buffers = new Map<FishingSoundCue, AudioBuffer>();
  const playing = new Set<AudioBufferSourceNode>();
  const doc = typeof document === "undefined" ? null : document;
  const win = typeof window === "undefined" ? null : window;
  const hidden = () => Boolean(doc?.hidden);

  function release(source: AudioBufferSourceNode) {
    playing.delete(source); source.onended = null; source.disconnect();
  }
  function halt(source: AudioBufferSourceNode) {
    try { source.stop(); } catch { /* The source may already have ended. */ }
    release(source);
  }
  function stop() {
    generation++;
    if (pending) { pending = null; unlocked = false; }
    for (const source of playing) halt(source);
  }
  const visibility = () => { if (hidden()) stop(); };
  doc?.addEventListener("visibilitychange", visibility);
  win?.addEventListener("pagehide", stop);

  function unlock(): Promise<boolean> {
    if (disposed || muted || hidden() || unsupported) return Promise.resolve(false);
    if (unlocked && context?.state === "running") return Promise.resolve(true);
    if (pending) return pending;
    if (context?.state === "closed") {
      stop(); master?.disconnect(); context = null; master = null; buffers.clear();
    }
    if (!context) {
      try {
        const AudioContextClass = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) { unsupported = true; return Promise.resolve(false); }
        context = new AudioContextClass(); master = context.createGain();
        master.gain.value = 0.65 * 0.3; master.connect(context.destination);
      } catch {
        void context?.close().catch(() => {});
        context = null; master = null; unsupported = true;
        return Promise.resolve(false);
      }
    }
    const active = context, currentGeneration = generation;
    let resume: Promise<void>;
    try { resume = active.state === "running" ? Promise.resolve() : active.resume(); }
    catch { unlocked = false; return Promise.resolve(false); }
    unlocked = false;
    const attempt = resume.then(() => {
      if (disposed || currentGeneration !== generation || muted || hidden() || context !== active || active.state !== "running") return false;
      unlocked = true; return true;
    }, () => false).finally(() => { if (pending === attempt) pending = null; });
    pending = attempt;
    return attempt;
  }

  function play(cue: FishingSoundCue): boolean {
    if (disposed || muted || hidden() || !unlocked || !context || !master || context.state !== "running") return false;
    let source: AudioBufferSourceNode | null = null;
    try {
      let buffer = buffers.get(cue);
      if (!buffer) {
        const pcm = renderSound(cue);
        buffer = context.createBuffer(1, pcm.length, SAMPLE_RATE); buffer.getChannelData(0).set(pcm); buffers.set(cue, buffer);
      }
      if (playing.size >= 4) halt(playing.values().next().value!);
      source = context.createBufferSource(); source.buffer = buffer; source.connect(master);
      const current = source; source.onended = () => release(current); playing.add(source);
      source.start(context.currentTime); return true;
    } catch {
      if (source) halt(source);
      return false;
    }
  }

  return {
    unlock, play, stop,
    setMuted(next: boolean) {
      if (disposed) return;
      muted = next;
      if (master) master.gain.value = muted ? 0 : 0.65 * 0.3;
      if (muted) stop();
    },
    dispose() {
      if (disposed) return;
      disposed = true; unlocked = false; stop(); buffers.clear();
      doc?.removeEventListener("visibilitychange", visibility);
      win?.removeEventListener("pagehide", stop);
      master?.disconnect(); master = null;
      void context?.close().catch(() => {}); context = null;
    },
  };
}
