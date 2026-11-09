// Controls. Swarm on a phone: touch the strip under the playfield; the cannon goes to your thumb's
// x and fires while you touch, and lifting stops both. Divide on a phone: four hold buttons (turn
// left, turn right, thrust, fire), each touch tracked on its own so two thumbs work and a thumb can
// slide between buttons. Keyboard: arrows or A/D move or turn, Up or W thrusts, Space fires (hold to
// keep firing). The game reads `state()` once per step.

export class Input {
  constructor(strip, fieldWidth, pads) {
    this.strip = strip;
    this.pads = new Map(); // pointer id -> the pad it's holding
    this.fieldWidth = fieldWidth;
    this.keys = new Set();
    this.pointer = null; // { id, x } of the touch steering the cannon
    this.onKey = null; // called with single-press keys (p, m, Enter...) for the screens

    strip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      strip.setPointerCapture?.(e.pointerId);
      this.pointer = { id: e.pointerId, x: this.toField(e) };
    });
    strip.addEventListener('pointermove', (e) => {
      if (this.pointer?.id === e.pointerId) this.pointer.x = this.toField(e);
    });
    const end = (e) => {
      if (this.pointer?.id === e.pointerId) this.pointer = null;
    };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointercancel', end);
    strip.addEventListener('contextmenu', (e) => e.preventDefault());

    const padAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pad]')?.dataset.pad ?? null;
    pads.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pads.set(e.pointerId, padAt(e));
    });
    pads.addEventListener('pointermove', (e) => {
      if (this.pads.has(e.pointerId)) this.pads.set(e.pointerId, padAt(e));
    });
    const lift = (e) => this.pads.delete(e.pointerId);
    pads.addEventListener('pointerup', lift);
    pads.addEventListener('pointercancel', lift);
    pads.addEventListener('contextmenu', (e) => e.preventDefault());

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) e.preventDefault();
      if (!e.repeat) this.onKey?.(key);
      this.keys.add(key);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    addEventListener('blur', () => this.clear());
  }

  toField(e) {
    const rect = this.strip.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * this.fieldWidth;
  }

  clear() {
    this.keys.clear();
    this.pointer = null;
    this.pads.clear();
  }

  state() {
    const k = this.keys;
    const held = new Set(this.pads.values());
    return {
      moveTo: this.pointer ? this.pointer.x : null,
      left: k.has('ArrowLeft') || k.has('a') || held.has('left'),
      right: k.has('ArrowRight') || k.has('d') || held.has('right'),
      thrust: k.has('ArrowUp') || k.has('w') || held.has('thrust'),
      fire: this.pointer !== null || k.has(' ') || held.has('fire'),
    };
  }
}
