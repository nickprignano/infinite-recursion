// The player's settings: Easy and Reduce effects. Effects are reduced when the switch is on or the
// system asks for reduced motion, watched live so a change mid-game applies at once.
import { load, save } from './storage.js';

const KEY = 'infinite-recursion-settings';

export class Settings {
  constructor(storage, media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')) {
    this.storage = storage;
    this.media = media;
    const saved = load(KEY, {}, storage);
    this.reduceSwitch = saved.reduceSwitch === true;
    this.easy = saved.easy === true;
  }

  get reduced() {
    return this.reduceSwitch || this.media?.matches === true;
  }

  set(name, value) {
    this[name] = value;
    save(KEY, { reduceSwitch: this.reduceSwitch, easy: this.easy }, this.storage);
  }
}
