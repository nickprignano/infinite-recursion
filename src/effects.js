// Turns game events into short-lived visual effects: rings, particles and glows. Pure, so the
// flash-safety rules are tested in Node.
//
// Flash safety: at most 3 glow events in any second and none bigger than a quarter of the
// playfield (both below the WCAG 2.3.1 limits). Reduce effects gives plain rings only.

export const MAX_GLOWS_PER_SECOND = 3;
export const MAX_PARTICLES = 200;

const SIZES = { kill: 14, split: 14, probe: 26, hit: 30, chip: 0 };

export class Effects {
  constructor(field, { reduced = () => false, random = Math.random } = {}) {
    this.maxArea = (field.width * field.height) / 4;
    this.reduced = reduced;
    this.random = random;
    this.rings = [];
    this.particles = [];
    this.glows = [];
    this.glowTimes = [];
  }

  add(events, time) {
    for (const e of events) {
      const size = SIZES[e.type];
      if (!size) continue;
      this.rings.push({ x: e.x, y: e.y, r: 2, max: size, age: 0, kind: e.type });
      if (this.reduced()) continue;
      this.tryGlow(e, size, time);
      const count = e.type === 'kill' || e.type === 'split' ? 8 : 16;
      for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
        const a = this.random() * Math.PI * 2;
        const v = 30 + this.random() * 60;
        this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.5, kind: e.type });
      }
    }
  }

  tryGlow(e, size, time) {
    this.glowTimes = this.glowTimes.filter((t) => time - t < 1);
    if (this.glowTimes.length >= MAX_GLOWS_PER_SECOND) return;
    const r = Math.min(size * 1.6, Math.sqrt(this.maxArea / Math.PI));
    this.glowTimes.push(time);
    this.glows.push({ x: e.x, y: e.y, r, age: 0, life: 0.25, time });
  }

  update(dt) {
    for (const ring of this.rings) {
      ring.age += dt;
      ring.r = 2 + (ring.max - 2) * Math.min(1, ring.age / 0.3);
    }
    this.rings = this.rings.filter((ring) => ring.age < 0.4);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const g of this.glows) g.age += dt;
    this.glows = this.glows.filter((g) => g.age < g.life);
    if (this.reduced()) {
      this.particles = [];
      this.glows = [];
    }
  }
}
