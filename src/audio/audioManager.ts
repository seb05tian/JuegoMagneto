export type SoundCue = 'coin' | 'crystal' | 'battery' | 'shield' | 'repel' | 'empty' | 'hit' | 'combo' | 'target' | 'overdrive' | 'goal' | 'record' | 'end' | 'click';

// A light C pentatonic motif with intentional rests; low notes mark every
// fourth beat so the loop feels like a tune rather than a metronome.
const MUSIC_NOTES = [523.25, 0, 392, 659.25, 587.33, 0, 392, 783.99, 698.46, 0, 587.33, 880, 783.99, 659.25, 587.33, 392];
const MUSIC_BASS = [130.81, 0, 0, 0, 174.61, 0, 0, 0, 110, 0, 0, 0, 146.83, 0, 0, 0];

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicEpoch = 0;
  private musicIndex = 0;
  private userMuted = false;
  private interruptionMuted = false;
  private readonly activeOscillators = new Set<OscillatorNode>();

  constructor(muted = false) {
    this.userMuted = muted;
  }

  async unlock(): Promise<void> {
    const AudioContextConstructor = window.AudioContext;
    if (!this.context && AudioContextConstructor) {
      this.context = new AudioContextConstructor({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = this.isMuted() ? 0 : 0.7;
      this.master.connect(this.context.destination);
    }
    if (this.context?.state === 'suspended') await this.context.resume().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.userMuted = muted;
    this.updateMasterGain();
  }

  isUserMuted(): boolean {
    return this.userMuted;
  }

  setInterrupted(interrupted: boolean): void {
    this.interruptionMuted = interrupted;
    this.updateMasterGain();
    if (interrupted) this.stopMusic();
  }

  playMusic(): void {
    if (this.musicTimer !== null || this.interruptionMuted) return;
    const epoch = ++this.musicEpoch;
    void this.unlock().then(() => {
      if (epoch !== this.musicEpoch || this.musicTimer !== null || this.interruptionMuted || !this.context) return;
      this.musicIndex = 0;
      this.playMusicNote();
      this.musicTimer = window.setInterval(() => this.playMusicNote(), 280);
    });
  }

  stopMusic(): void {
    this.musicEpoch += 1;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  play(cue: SoundCue, intensity = 1): void {
    if (!this.context || !this.master || this.isMuted()) return;
    const patterns: Record<SoundCue, { notes: number[]; duration: number; wave: OscillatorType; gain: number }> = {
      coin: { notes: [783.99, 1174.66, 1567.98], duration: 0.15, wave: 'sine', gain: 0.17 },
      crystal: { notes: [659.25, 987.77, 1318.51, 1760], duration: 0.23, wave: 'sine', gain: 0.14 },
      battery: { notes: [392, 523.25, 659.25, 783.99], duration: 0.26, wave: 'triangle', gain: 0.14 },
      shield: { notes: [523.25, 698.46, 880, 1046.5], duration: 0.26, wave: 'sine', gain: 0.14 },
      repel: { notes: [220, 110, 55], duration: 0.24, wave: 'sawtooth', gain: 0.105 },
      empty: { notes: [293.66, 220, 164.81], duration: 0.27, wave: 'triangle', gain: 0.1 },
      hit: { notes: [174.61, 116.54, 77.78], duration: 0.23, wave: 'square', gain: 0.1 },
      combo: { notes: [587.33, 783.99, 1174.66], duration: 0.2, wave: 'triangle', gain: 0.14 },
      target: { notes: [392, 587.33, 783.99, 1174.66], duration: 0.27, wave: 'triangle', gain: 0.15 },
      overdrive: { notes: [392, 587.33, 783.99, 1174.66, 1567.98], duration: 0.38, wave: 'sawtooth', gain: 0.12 },
      goal: { notes: [523.25, 659.25, 783.99, 1046.5], duration: 0.28, wave: 'triangle', gain: 0.14 },
      record: { notes: [523.25, 659.25, 783.99, 1046.5, 1318.51], duration: 0.4, wave: 'sine', gain: 0.16 },
      end: { notes: [392, 329.63, 261.63], duration: 0.35, wave: 'triangle', gain: 0.1 },
      click: { notes: [660], duration: 0.07, wave: 'sine', gain: 0.08 },
    };
    const pattern = patterns[cue];
    const start = this.context.currentTime;
    pattern.notes.forEach((frequency, index) => {
      this.playTone(frequency * (cue === 'coin' ? 1 + Math.min(4, intensity - 1) * 0.025 : 1), pattern.duration, pattern.wave, pattern.gain, start + index * 0.055);
    });
  }

  dispose(): void {
    this.stopMusic();
    for (const oscillator of this.activeOscillators) {
      try { oscillator.stop(); } catch { /* already ended */ }
    }
    this.activeOscillators.clear();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.master = null;
  }

  get activeTimerCount(): number {
    return this.musicTimer === null ? 0 : 1;
  }

  private isMuted(): boolean {
    return this.userMuted || this.interruptionMuted;
  }

  private updateMasterGain(): void {
    if (!this.master || !this.context) return;
    const target = this.isMuted() ? 0 : 0.7;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.025);
  }

  private playMusicNote(): void {
    if (!this.context || this.interruptionMuted) return;
    const index = this.musicIndex % MUSIC_NOTES.length;
    const note = MUSIC_NOTES[index] ?? 0;
    const bass = MUSIC_BASS[index] ?? 0;
    const now = this.context.currentTime;
    if (note > 0) this.playTone(note, 0.19, 'sine', 0.022, now);
    if (bass > 0) this.playTone(bass, 0.32, 'triangle', 0.028, now);
    this.musicIndex += 1;
  }

  private playTone(
    frequency: number,
    duration: number,
    wave: OscillatorType,
    volume: number,
    startAt: number,
  ): void {
    if (!this.context || !this.master || this.isMuted()) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), startAt + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    this.activeOscillators.add(oscillator);
    oscillator.onended = () => {
      this.activeOscillators.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.01);
  }
}
