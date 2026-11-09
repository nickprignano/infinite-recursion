// Controls. Phone: touch the strip under the playfield; the cannon goes to your thumb's x and
// fires while you touch, and lifting stops both. Keyboard: arrows or A/D move, Space fires (hold to
// keep firing). The game reads `state()` once per step.

export class Input {
  constructor(strip, fieldWidth) {
    this.strip = strip;
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

  get touching() {
    return this.pointer !== null;
  }

  clear() {
    this.keys.clear();
    this.pointer = null;
  }

  state() {
    const k = this.keys;
    return {
      moveTo: this.pointer ? this.pointer.x : null,
      left: k.has('ArrowLeft') || k.has('a'),
      right: k.has('ArrowRight') || k.has('d'),
      fire: this.pointer !== null || k.has(' '),
    };
  }
}
