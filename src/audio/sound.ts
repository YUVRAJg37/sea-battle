// All game audio, synthesized with the Web Audio API: no files to load. Effects are short shaped
// bursts of noise and oscillators; the sea is filtered noise with slow swells; the music is a
// small step sequencer over a four-chord loop that thickens during battle.

export type SoundSetting = 'all' | 'effects' | 'off';
type MusicMood = 'calm' | 'battle';

const STORAGE_KEY = 'sea-battle.sound';
const NEXT_SETTING: Record<SoundSetting, SoundSetting> = { all: 'effects', effects: 'off', off: 'all' };
export const SETTING_LABEL: Record<SoundSetting, string> = { all: 'Sound on', effects: 'Music off', off: 'Muted' };

// Dm – B♭ – F – C, as MIDI notes: chord tones for the pad and arpeggio, and a bass root.
const PROGRESSION = [
  { chord: [50, 53, 57], bass: 38 },
  { chord: [46, 50, 53], bass: 34 },
  { chord: [53, 57, 60], bass: 41 },
  { chord: [48, 52, 55], bass: 36 },
];
const BPM = 84;
const STEP = 60 / BPM / 2; // eighth notes
const STEPS_PER_BAR = 8;
const LOOKAHEAD_S = 0.3;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function loadSetting(): SoundSetting {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'all' || saved === 'effects' || saved === 'off') return saved;
  } catch {
    // storage blocked: use the default
  }
  return 'all';
}

interface Envelope {
  attack?: number;
  duration: number;
  gain: number;
  at?: number; // seconds from now
}

export class Sound {
  setting: SoundSetting = loadSetting();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private sea!: GainNode;
  private noise!: AudioBuffer;
  private mood: MusicMood = 'calm';
  private step = 0;
  private nextStepAt = 0;

  /** Browsers only allow audio after a user gesture: call this from the first tap or key press. */
  unlock(): void {
    if (this.ctx) return void this.ctx.resume();
    const ctx = (this.ctx = new AudioContext());
    this.master = this.bus(ctx.destination, 0.8);
    this.sfx = this.bus(this.master, 0.9);
    this.music = this.bus(this.master, 0.5);
    this.sea = this.bus(this.master, 0.35);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applySetting();
    this.startSea();
    this.nextStepAt = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 100);
  }

  cycleSetting(): SoundSetting {
    this.setting = NEXT_SETTING[this.setting];
    try {
      localStorage.setItem(STORAGE_KEY, this.setting);
    } catch {
      // fine: it just won't be remembered
    }
    this.applySetting();
    return this.setting;
  }

  setMood(mood: MusicMood): void {
    this.mood = mood;
  }

  // --- Effects -----------------------------------------------------------------

  cannon(): void {
    this.tone('sine', 140, 40, { duration: 0.45, gain: 0.9 });
    this.hiss('lowpass', 1400, 200, { duration: 0.5, gain: 0.7 });
  }

  explosion(): void {
    this.tone('sine', 80, 28, { duration: 1.1, gain: 0.9 });
    this.hiss('lowpass', 900, 80, { duration: 1.8, gain: 1, attack: 0.005 });
    for (let i = 0; i < 4; i++) this.hiss('highpass', 3000, 2000, { duration: 0.06, gain: 0.25, at: 0.1 + Math.random() * 0.5 });
  }

  splash(): void {
    this.hiss('bandpass', 1800, 350, { duration: 0.9, gain: 0.7, attack: 0.01 });
    this.tone('sine', 700, 200, { duration: 0.15, gain: 0.2 });
  }

  torpedo(): void {
    this.hiss('lowpass', 300, 1000, { duration: 0.9, gain: 0.35, attack: 0.1 });
    for (let i = 0; i < 6; i++) this.tone('sine', 300 + Math.random() * 500, 200, { duration: 0.06, gain: 0.12, at: i * 0.12 });
  }

  /** A jet passing overhead: engine roar and air rush swelling in and out, with a Doppler drop. */
  airstrike(): void {
    // Timed to the jet's flight across the board (about 2.2 s).
    this.hiss('bandpass', 500, 2200, { duration: 1.1, gain: 0.55, attack: 0.85 });
    this.hiss('bandpass', 2200, 400, { duration: 1.4, gain: 0.5, attack: 0.02, at: 1.05 });
    this.tone('sawtooth', 210, 120, { duration: 2.4, gain: 0.08, attack: 1.0 });
  }

  /** A bomb's falling whistle. */
  bomb(): void {
    this.tone('sine', 1500, 450, { duration: 0.5, gain: 0.12 });
  }

  radar(): void {
    this.tone('sine', 1400, 1350, { duration: 0.9, gain: 0.3 });
    this.tone('sine', 1400, 1350, { duration: 0.7, gain: 0.1, at: 0.28 }); // echo
  }

  scout(): void {
    this.tone('triangle', 880, 880, { duration: 0.12, gain: 0.2 });
    this.tone('triangle', 1320, 1320, { duration: 0.2, gain: 0.2, at: 0.13 });
  }

  sink(): void {
    this.hiss('lowpass', 220, 60, { duration: 2.6, gain: 0.8, attack: 0.2 });
    this.tone('sine', 55, 25, { duration: 2.4, gain: 0.6, attack: 0.1 });
  }

  click(): void {
    this.tone('square', 1800, 1500, { duration: 0.03, gain: 0.06 });
  }

  select(): void {
    this.tone('triangle', 660, 990, { duration: 0.09, gain: 0.14 });
  }

  place(): void {
    this.tone('sine', 300, 160, { duration: 0.14, gain: 0.3 });
  }

  chat(): void {
    this.tone('sine', 988, 988, { duration: 0.09, gain: 0.15 });
    this.tone('sine', 1319, 1319, { duration: 0.14, gain: 0.15, at: 0.1 });
  }

  victory(): void {
    [72, 76, 79, 84].forEach((n, i) => this.tone('triangle', hz(n), hz(n), { duration: i === 3 ? 1.2 : 0.2, gain: 0.25, at: i * 0.15 }));
  }

  defeat(): void {
    [69, 67, 64, 62].forEach((n, i) => this.tone('triangle', hz(n), hz(n), { duration: i === 3 ? 1.4 : 0.3, gain: 0.22, at: i * 0.28 }));
  }

  // --- Building blocks ---------------------------------------------------------------

  private bus(to: AudioNode, gain: number): GainNode {
    const node = this.ctx!.createGain();
    node.gain.value = gain;
    node.connect(to);
    return node;
  }

  private applySetting(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.setting === 'off' ? 0 : 0.8, t, 0.05);
    this.music.gain.setTargetAtTime(this.setting === 'all' ? 0.5 : 0, t, 0.2);
  }

  private envelope(gain: GainNode, { attack = 0.005, duration, gain: peak, at = 0 }: Envelope): number {
    const start = this.ctx!.currentTime + at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    return start;
  }

  /** An oscillator sweeping from one pitch to another. */
  private tone(type: OscillatorType, from: number, to: number, env: Envelope, out: AudioNode = this.sfx): void {
    if (!this.ctx || this.setting === 'off') return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    const start = this.envelope(gain, env);
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + env.duration);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + env.duration + 0.05);
  }

  /** Filtered noise with the filter sweeping from one frequency to another. */
  private hiss(type: BiquadFilterType, from: number, to: number, env: Envelope): void {
    if (!this.ctx || this.setting === 'off') return;
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    src.buffer = this.noise;
    src.loop = true;
    filter.type = type;
    const start = this.envelope(gain, env);
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + env.duration);
    src.connect(filter).connect(gain).connect(this.sfx);
    src.start(start, Math.random());
    src.stop(start + env.duration + 0.05);
  }

  // --- The sea ---------------------------------------------------------------------

  private startSea(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 450;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    // A slow LFO on the volume makes waves roll in and out.
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.09;
    depth.gain.value = 0.35;
    lfo.connect(depth).connect(swell.gain);
    src.connect(filter).connect(swell).connect(this.sea);
    src.start();
    lfo.start();
    const gull = () => {
      if (this.setting !== 'off') {
        for (let i = 0; i < 3; i++) this.tone('sine', 1900, 1150, { duration: 0.18, gain: 0.025, at: i * 0.22 }, this.sea);
      }
      setTimeout(gull, 12_000 + Math.random() * 14_000);
    };
    setTimeout(gull, 6000);
  }

  // --- Music -------------------------------------------------------------------------

  /** Schedules the next few steps of the loop ahead of time, so timers jittering doesn't matter. */
  private schedule(): void {
    const ctx = this.ctx!;
    if (this.setting !== 'all') {
      this.nextStepAt = ctx.currentTime + 0.1;
      return;
    }
    while (this.nextStepAt < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(this.step, this.nextStepAt - ctx.currentTime);
      this.step = (this.step + 1) % (STEPS_PER_BAR * PROGRESSION.length);
      this.nextStepAt += STEP;
    }
  }

  private playStep(step: number, at: number): void {
    const { chord, bass } = PROGRESSION[Math.floor(step / STEPS_PER_BAR)]!;
    const beat = step % STEPS_PER_BAR;
    const battle = this.mood === 'battle';
    const bar = STEP * STEPS_PER_BAR;
    if (beat === 0) {
      for (const n of chord) {
        this.tone('sawtooth', hz(n), hz(n), { attack: 0.8, duration: bar + 0.6, gain: 0.018, at }, this.musicPad());
        this.tone('sawtooth', hz(n) * 1.004, hz(n) * 1.004, { attack: 0.8, duration: bar + 0.6, gain: 0.014, at }, this.musicPad());
      }
    }
    if (beat === 0 || beat === 4) this.tone('triangle', hz(bass), hz(bass), { duration: STEP * 3, gain: 0.16, at }, this.music);
    if (!battle) return;
    if (beat % 2 === 0) this.tone('sine', 95, 45, { duration: 0.22, gain: 0.14, at }, this.music);
    const arp = chord[[0, 1, 2, 1][beat % 4]!]! + 12;
    this.tone('triangle', hz(arp), hz(arp), { duration: STEP * 0.9, gain: 0.03, at }, this.music);
  }

  private padFilter: BiquadFilterNode | null = null;

  /** Soft lowpass so the saw pad sits underneath everything. */
  private musicPad(): AudioNode {
    if (!this.padFilter) {
      this.padFilter = this.ctx!.createBiquadFilter();
      this.padFilter.type = 'lowpass';
      this.padFilter.frequency.value = 900;
      this.padFilter.connect(this.music);
    }
    return this.padFilter;
  }
}
