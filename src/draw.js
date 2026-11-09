// Draws the game on the canvas: vector lines in prignano-theme colors, following light and dark.
// Glow is a wide faint stroke under a thin bright one, not shadowBlur, which is slow on phones.
import { pieceVelocity } from './divide.js';
import { invaderPos } from './game.js';

const TOKENS = ['--bg', '--fg', '--muted', '--accent', '--active', '--border'];

function lightness(color) {
  const m = color.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

export function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const p = Object.fromEntries(TOKENS.map((t) => [t.slice(2), style.getPropertyValue(t).trim()]));
  p.dark = lightness(p.bg) < 0.5;
  return p;
}

// Our own invader shapes, one per row type, each with two marching frames. Units are playfield
// units around the invader's center (16 by 12).
const SHAPES = [
  // A hexagon with a visor line and two feet.
  (ctx, f) => {
    poly(ctx, [[-7, 0], [-4, -6], [4, -6], [7, 0], [4, 5], [-4, 5]]);
    line(ctx, -4, -1, 4, -1);
    line(ctx, -4, 5, f ? -3 : -6, 7);
    line(ctx, 4, 5, f ? 3 : 6, 7);
  },
  // An orb with a band and three short legs.
  (ctx, f) => {
    ctx.beginPath();
    ctx.arc(0, -1, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, -5.5, -1, 5.5, -1);
    for (const x of [-4, 0, 4]) line(ctx, x, 4.5, x + (f ? 1.5 : -1.5), 7);
  },
  // A downward arrowhead with a core dot and flicking wingtips.
  (ctx, f) => {
    poly(ctx, [[-8, f ? -6 : -4], [0, 1], [8, f ? -6 : -4], [8, 0], [0, 6], [-8, 0]]);
    dot(ctx, 0, -1, 1.3);
  },
];

// Each trait adds a visible part, bigger per level, so the swarm can be read at a glance.
function traitParts(ctx, traits) {
  if (traits.aim) {
    const top = -7.5 - traits.aim * 1.5;
    line(ctx, 0, -6.5, 0, top);
    dot(ctx, 0, top, 1.1);
  }
  for (let i = 0; i < traits.fire; i++) line(ctx, -2 + i * 2, 5.5, -2 + i * 2, 8.5);
  if (traits.dodge) {
    const reach = 8 + traits.dodge * 1.6;
    for (const side of [-1, 1]) poly(ctx, [[side * 8, -2.5], [side * reach, -4.5], [side * 8, 1]]);
  }
}

function poly(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();
}

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Divide's nodes: a hexagon holding a smaller one holding a smaller one. A piece of a given size
// draws only the layers from its own inward, so the children of a split are visibly the parent's
// insides.
function nested(ctx, radii, size, rot) {
  for (let s = size; s < radii.length; s++) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = rot * (s % 2 ? -1 : 1) + (k * Math.PI) / 3;
      const x = Math.cos(a) * radii[s];
      const y = Math.sin(a) * radii[s];
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

// A node's traits, drawn in its heading's frame (up = where it's going): a tick for Aim, trails for
// Speed, side fins for Dodge. Bigger per level.
function nodeTraits(ctx, traits, r) {
  if (traits.aim) {
    const tip = -r - 3 - traits.aim * 2;
    line(ctx, 0, -r - 1, 0, tip);
    poly(ctx, [[-2, tip + 3], [0, tip], [2, tip + 3]]);
  }
  for (let i = 0; i < traits.speed; i++) {
    const x = (i - (traits.speed - 1) / 2) * 4;
    line(ctx, x, r + 2, x, r + 5 + r * 0.3);
  }
  if (traits.dodge) {
    const reach = r + 2 + traits.dodge * 2;
    for (const side of [-1, 1]) poly(ctx, [[side * r * 0.85, -r * 0.3], [side * reach, 0], [side * r * 0.85, r * 0.3]]);
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.palette = readPalette();
  }

  refreshPalette() {
    this.palette = readPalette();
  }

  // Sizes the backing store for the screen (at most 2x) and returns the scale from playfield units.
  resize(cssWidth, cssHeight, field) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssWidth * ratio);
    this.canvas.height = Math.round(cssHeight * ratio);
    this.scale = (cssWidth * ratio) / field.width;
  }

  // Strokes a path twice for a soft glow, then once thin and bright. With effects reduced, once.
  glowStroke(draw, color, width, reduced) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (!reduced) {
      ctx.save();
      ctx.globalAlpha = this.palette.dark ? 0.28 : 0.14;
      if (this.palette.dark) ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = width * 3.2;
      draw();
      ctx.restore();
    }
    ctx.lineWidth = width;
    draw();
  }

  render(state, effects, reduced) {
    if (state.mode === 'divide') return this.renderDivide(state, effects, reduced);
    const { ctx, palette: pal } = this;
    const c = state.config;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Ground line under the cannon.
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 1;
    line(ctx, 0, c.cannon.y + c.cannon.height / 2 + 6, c.field.width, c.cannon.y + c.cannon.height / 2 + 6);

    // Barriers: small filled cells.
    ctx.fillStyle = pal.active;
    for (const b of state.barriers) {
      for (let r = 0; r < b.rows; r++) {
        for (let col = 0; col < b.cols; col++) {
          if (b.cells[r * b.cols + col]) ctx.fillRect(b.x + col * b.cell + 0.3, b.y + r * b.cell + 0.3, b.cell - 0.6, b.cell - 0.6);
        }
      }
    }

    // The swarm.
    const frame = Math.floor(Math.abs(state.swarm.ox) / 6) % 2;
    const rowColors = [pal.accent, pal.active, pal.fg];
    for (const inv of state.invaders) {
      if (!inv.alive) continue;
      const { x, y } = invaderPos(state, inv);
      ctx.save();
      ctx.translate(x, y);
      this.glowStroke(() => {
        SHAPES[inv.row % SHAPES.length](ctx, frame);
        traitParts(ctx, inv.traits);
      }, rowColors[inv.row % rowColors.length], 1.2, reduced);
      ctx.restore();
    }

    if (state.probe) this.drawProbe(state.probe, reduced);

    // The cannon (hidden while it respawns after a hit).
    if (state.cannon.respawn <= 0 && state.phase !== 'over') {
      ctx.save();
      ctx.translate(state.cannon.x, c.cannon.y);
      this.glowStroke(() => {
        poly(ctx, [[-10, 5], [10, 5], [7, 0], [-7, 0]]);
        poly(ctx, [[-3, 0], [-3, -3], [3, -3], [3, 0]]);
        line(ctx, 0, -3, 0, -7);
      }, pal.fg, 1.3, reduced);
      ctx.restore();
    }

    // Shots.
    this.glowStroke(() => {
      for (const s of state.shots) line(ctx, s.x, s.y, s.x, s.y + 7);
    }, pal.accent, 1.5, reduced);
    this.glowStroke(() => {
      for (const s of state.enemyShots) {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 7);
        ctx.lineTo(s.x + 1.5, s.y - 4.5);
        ctx.lineTo(s.x - 1.5, s.y - 2);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
    }, pal.fg, 1.2, reduced);

    this.drawEffects(effects);
  }

  // The Probe: a lens with a faint scan line under it.
  drawProbe(p, reduced) {
    const { ctx, palette: pal } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1;
    line(ctx, 0, 5, 0, 22);
    ctx.restore();
    this.glowStroke(() => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -1, 5, Math.PI, 0);
      ctx.stroke();
      dot(ctx, -6, 0.5, 0.9);
      dot(ctx, 0, 1.5, 0.9);
      dot(ctx, 6, 0.5, 0.9);
    }, pal.accent, 1.2, reduced);
    ctx.restore();
  }

  // Effects: glows (limited), rings, particles.
  drawEffects(effects) {
    const { ctx, palette: pal } = this;
    for (const g of effects.glows) {
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      grad.addColorStop(0, pal.accent);
      grad.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - g.age / g.life);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = 1;
    for (const ring of effects.rings) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - ring.age / 0.4);
      ctx.strokeStyle = ring.kind === 'hit' ? pal.fg : pal.accent;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = pal.fg;
    for (const p of effects.particles) {
      ctx.save();
      ctx.globalAlpha = 1 - p.age / p.life;
      line(ctx, p.x, p.y, p.x - p.vx * 0.04, p.y - p.vy * 0.04);
      ctx.restore();
    }
  }

  // Draws at every wrapped copy that shows: something near an edge also shows at the other side.
  wrapped(x, y, r, field, draw) {
    for (const ox of [-field.width, 0, field.width]) {
      for (const oy of [-field.height, 0, field.height]) {
        const cx = x + ox;
        const cy = y + oy;
        if (cx + r < 0 || cx - r > field.width || cy + r < 0 || cy - r > field.height) continue;
        this.ctx.save();
        this.ctx.translate(cx, cy);
        draw();
        this.ctx.restore();
      }
    }
  }

  renderDivide(state, effects, reduced) {
    const { ctx, palette: pal } = this;
    const c = state.config;
    const field = c.field;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, field.width, field.height);
    ctx.clip();

    const sizeColors = [pal.accent, pal.active, pal.fg];
    for (const p of state.pieces) {
      const r = c.nodes.radius[p.size];
      const { vx, vy } = pieceVelocity(state, p);
      const heading = Math.atan2(vx, -vy);
      this.wrapped(p.x, p.y, r + 12, field, () => {
        this.glowStroke(() => {
          nested(ctx, c.nodes.radius, p.size, p.rot);
          ctx.rotate(heading);
          nodeTraits(ctx, p.traits, r);
        }, sizeColors[p.size], 1.2, reduced);
      });
    }

    if (state.probe) this.drawProbe(state.probe, reduced);

    // The ship: a rounded dart with a round cockpit, faint while it can't be hit.
    const ship = state.ship;
    if (ship.alive && state.phase !== 'over') {
      this.wrapped(ship.x, ship.y, 12, field, () => {
        ctx.rotate(ship.angle);
        if (ship.faint > 0) ctx.globalAlpha = 0.4;
        this.glowStroke(() => {
          ctx.beginPath();
          ctx.moveTo(0, -10);
          ctx.lineTo(7, 7);
          ctx.quadraticCurveTo(0, 2, -7, 7);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, -1, 2.2, 0, Math.PI * 2);
          ctx.stroke();
        }, pal.fg, 1.3, reduced);
        if (ship.thrusting) {
          const flick = Math.floor(state.time * 20) % 2 ? 3 : 0;
          this.glowStroke(() => {
            ctx.beginPath();
            ctx.moveTo(-3, 6);
            ctx.lineTo(0, 11 + flick);
            ctx.lineTo(3, 6);
            ctx.stroke();
          }, pal.accent, 1.2, reduced);
        }
      });
    }

    this.glowStroke(() => {
      for (const s of state.shots) {
        const len = Math.hypot(s.vx, s.vy);
        line(ctx, s.x, s.y, s.x - (s.vx / len) * 5, s.y - (s.vy / len) * 5);
      }
    }, pal.accent, 1.5, reduced);

    this.drawEffects(effects);
    ctx.restore();
  }
}
