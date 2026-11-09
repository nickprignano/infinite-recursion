// Sounds, all synthesized with the Web Audio API, so there's nothing to license. The march is one
// note that rises in pitch and quickens as the swarm thins, not a melody.
import { load, save } from './storage.js';

const MUTE_KEY = 'infinite-recursion-muted';

export class Audio {
  constructor() {
    this.muted = load(MUTE_KEY, false) === true;
    this.ctx = null;
    this.warble = null;
  }

  // Browsers only allow sound after a tap or key press. iOS also suspends sound after the phone
  // locks or the app goes to the background, so each tap resumes it.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AudioContext) this.ctx = new AudioContext();
  }

  setMuted(muted) {
    this.muted = muted;
    save(MUTE_KEY, muted);
    if (muted) this.probe(false);
  }

  tone(freq, ms, { type = 'sine', volume = 0.1, slideTo = null, delay = 0 } = {}) {
    const { ctx } = this;
    const start = ctx.currentTime + delay / 1000;
    const end = start + ms / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, end);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.setValueAtTime(volume, Math.max(start, end - 0.02));
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }

  noise(ms, { volume = 0.05 } = {}) {
    const { ctx } = this;
    const length = Math.ceil((ctx.sampleRate * ms) / 1000);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }

  // The Probe's warble, on while it's on screen.
  probe(on) {
    if (!on || this.muted || !this.ctx) {
      if (this.warble) {
        this.warble.forEach((node) => node.stop());
        this.warble = null;
      }
      return;
    }
    if (this.warble) return;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const depth = this.ctx.createGain();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 620;
    lfo.frequency.value = 7;
    depth.gain.value = 90;
    gain.gain.value = 0.025;
    lfo.connect(depth).connect(osc.frequency);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    lfo.start();
    this.warble = [osc, lfo];
  }

  // One march beat; `thinned` is the share of the swarm gone (0 to 1).
  march(thinned) {
    if (this.muted || !this.ctx) return;
    this.tone(90 * (1 + thinned), 70, { type: 'triangle', volume: 0.07 });
  }

  play(name) {
    if (this.muted || !this.ctx) return;
    switch (name) {
      case 'fire':
        this.tone(1400, 60, { type: 'square', volume: 0.025, slideTo: 700 });
        break;
      case 'kill':
        this.noise(120, { volume: 0.05 });
        this.tone(520, 120, { type: 'triangle', volume: 0.05, slideTo: 180 });
        break;
      case 'chip':
        this.noise(40, { volume: 0.02 });
        break;
      case 'probe':
        [660, 880, 1100].forEach((f, i) => this.tone(f, 90, { type: 'triangle', volume: 0.06, delay: i * 80 }));
        break;
      case 'hit':
        this.noise(400, { volume: 0.08 });
        this.tone(300, 700, { type: 'sawtooth', volume: 0.05, slideTo: 60 });
        break;
      case 'extra-life':
        [523, 659, 784].forEach((f, i) => this.tone(f, 120, { type: 'square', volume: 0.04, delay: i * 110 }));
        break;
      case 'lesson':
        this.tone(440, 160, { type: 'sine', volume: 0.07 });
        this.tone(660, 260, { type: 'sine', volume: 0.07, delay: 150 });
        break;
      case 'cleared':
        this.tone(392, 120, { type: 'triangle', volume: 0.06 });
        this.tone(587, 220, { type: 'triangle', volume: 0.06, delay: 110 });
        break;
      case 'over':
        this.tone(330, 1200, { type: 'triangle', volume: 0.07, slideTo: 82 });
        break;
    }
  }
}
