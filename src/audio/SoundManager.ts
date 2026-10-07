export type SoundName = 'spawn' | 'peg' | 'land' | 'win' | 'bigWin';

export interface SoundPlayer {
  play(name: SoundName): void;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
}

interface Tone {
  readonly frequency: number;
  readonly duration: number;
  readonly delay?: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
  readonly slideTo?: number;
}

const MUTE_KEY = 'plinko.muted';
const PEG_MIN_INTERVAL_MS = 35;

/**
 * Tiny synthesised sound effects via the Web Audio API, so the game needs no
 * audio assets. Swap the tone recipes for samples later without touching
 * callers. Fails silently where audio is unavailable.
 */
export class SoundManager implements SoundPlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPegAt = 0;
  private pegToggle = 0;
  private isMuted: boolean;

  constructor() {
    this.isMuted = readStoredMute();
  }

  get muted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Storage unavailable (private mode); the setting just won't persist.
    }
  }

  /** Must be called from a user gesture so browsers allow audio. */
  unlock(): void {
    const context = this.ensureContext();
    if (context?.state === 'suspended') void context.resume();
  }

  play(name: SoundName): void {
    if (this.isMuted) return;
    switch (name) {
      case 'spawn':
        this.tones([{ frequency: 520, slideTo: 780, duration: 0.09, type: 'sine', gain: 0.12 }]);
        break;
      case 'peg': {
        const now = performance.now();
        if (now - this.lastPegAt < PEG_MIN_INTERVAL_MS) return;
        this.lastPegAt = now;
        this.pegToggle = (this.pegToggle + 1) % 5;
        this.tones([{ frequency: 1100 + this.pegToggle * 90, duration: 0.035, type: 'triangle', gain: 0.05 }]);
        break;
      }
      case 'land':
        this.tones([{ frequency: 220, slideTo: 140, duration: 0.14, type: 'sine', gain: 0.18 }]);
        break;
      case 'win':
        this.tones([
          { frequency: 660, duration: 0.1, type: 'triangle', gain: 0.1 },
          { frequency: 880, duration: 0.16, delay: 0.08, type: 'triangle', gain: 0.1 },
        ]);
        break;
      case 'bigWin':
        this.tones(
          [523, 659, 784, 1047, 1319].map((frequency, i) => ({
            frequency,
            duration: 0.22,
            delay: i * 0.085,
            type: 'triangle' as const,
            gain: 0.1,
          })),
        );
        break;
    }
  }

  private tones(tones: readonly Tone[]): void {
    const context = this.ensureContext();
    const master = this.master;
    if (!context || !master || context.state !== 'running') return;
    const start = context.currentTime;
    for (const tone of tones) {
      const at = start + (tone.delay ?? 0);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.type ?? 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, at);
      if (tone.slideTo) oscillator.frequency.exponentialRampToValueAtTime(tone.slideTo, at + tone.duration);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(tone.gain ?? 0.1, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration);
      oscillator.connect(gain).connect(master);
      oscillator.start(at);
      oscillator.stop(at + tone.duration + 0.02);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext === 'undefined') return null;
    try {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.context.destination);
    } catch {
      this.context = null;
    }
    return this.context;
  }
}

function readStoredMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
