// The colony: biofilm growing, shrimp grazing, breeding and growing up, and
// the tank maturing. No DOM. The same step() runs live (small dt) and when
// catching up on time away (dt of a second or two).
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  const K = SC.K;
  const IDLE = 0, WALK = 1, GRAZE = 2, SWIM = 3;
  // Indexed by life stage: 0 shrimplet, 1 juvenile, 2 adult.
  const WALK_SP = [4, 7, 9]; // surface pixels per second
  const SWIM_SP = [12, 20, 26];
  const NEED = [0.4, 0.7, 1]; // appetite next to an adult's
  const rnd = Math.random;
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const stageOf = (s) => (s.age < K.BABY_T ? 0 : s.age < K.JUV_T ? 1 : 2);
  // How tall a shrimp is drawn, in pixels. One hanging under a floating plant
  // has its body below the spot it holds, so swims to and from there aim that
  // much lower.
  const bodyH = (s) => (s.age < K.BABY_T ? 3 : s.age < K.JUV_T ? 5 : s.sex === 0 ? 7 : 6);

  function growthAt(def, t) {
    const T = K.STAGE_T, tt = t / def.pace;
    if (tt >= T[4]) return 20;
    let s = 0;
    while (tt >= T[s + 1]) s++;
    return s * 5 + Math.floor((5 * (tt - T[s])) / (T[s + 1] - T[s]));
  }

  // A baby takes after its parents. Two of the same colour breed true, with a
  // rare throwback. Two different colours often give plain wild-type young.
  function genes(a, b) {
    const W = SC.WILD, r = rnd();
    if (a === b) return a !== W && r < 0.03 ? W : a;
    if (a === W || b === W) return r < 0.6 ? W : a === W ? b : a;
    return r < 0.25 ? W : r < 0.625 ? a : b;
  }

  function Colony(def, data) {
    this.def = def;
    this.t = data ? data.t : 0; // tank age, seconds
    this.born = data ? data.born : 0;
    this.shrimp = [];
    this.film = new Float32Array(def.w * def.h); // biofilm, 0..1, per tank pixel
    this.filmAvg = 0;
    this.G = -1;
    this.scape = null;
    this.version = 0; // goes up whenever the tank is redrawn
    this.events = [];
    this.males = [];
    this.pending = 0;
    this.rebuild(growthAt(def, this.t), data ? data.film : 0.2);
    if (data) {
      for (const r of data.shrimp) {
        const s = this.add(r[0], r[1], r[2]);
        s.belly = r[3];
        s.berried = r[4];
        s.mate = r[5];
        s.cool = r[6];
      }
    }
  }
  const CP = Colony.prototype;

  CP.cap = function () {
    const d = this.def;
    return Math.round(d.capStart + ((d.capMax - d.capStart) * this.G) / 20);
  };

  CP.progress = function () {
    const T = K.STAGE_T, tt = this.t / this.def.pace;
    if (tt >= T[4]) return { stage: 4, frac: 1 };
    let s = 0;
    while (tt >= T[s + 1]) s++;
    return { stage: s, frac: (tt - T[s]) / (T[s + 1] - T[s]) };
  };

  // Redraw the tank for a new growth step. Biofilm stays where it was; new
  // surfaces (a leaf that just grew) start with a thin film.
  CP.rebuild = function (G, fill) {
    const old = this.scape, sc = SC.buildScape(this.def, G);
    const nf = new Float32Array(this.film.length);
    const start = fill != null ? fill : this.filmAvg * 0.5;
    let was = null;
    if (old) {
      was = new Uint8Array(this.film.length);
      for (let i = 0; i < old.n; i++) was[old.cellGi[i]] = 1;
    }
    for (let i = 0; i < sc.n; i++) {
      const gi = sc.cellGi[i];
      nf[gi] = was && was[gi] ? this.film[gi] : start;
    }
    this.film = nf;
    this.scape = sc;
    this.G = G;
    this.version++;
    for (const s of this.shrimp) this.reseat(s);
  };

  CP.nearest = function (x, y) {
    const sc = this.scape, cx = sc.cellX, cy = sc.cellY;
    let best = 0, bd = 1e9;
    for (let i = 0; i < sc.n; i++) {
      const dx = cx[i] - x, dy = cy[i] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  // After a redraw, put a shrimp back on something solid.
  CP.reseat = function (s) {
    const sc = this.scape;
    if (s.st === SWIM) {
      s.tc = this.nearest(s.tx, s.ty);
      s.tx = sc.cellX[s.tc];
      s.ty = sc.cellY[s.tc] + (sc.cellHang[s.tc] ? bodyH(s) : 0);
      return;
    }
    const ci = this.nearest(s.x, s.y);
    const dx = sc.cellX[ci] - s.x, dy = sc.cellY[ci] - s.y;
    if (dx * dx + dy * dy <= 8) {
      s.c = s.tc = ci;
      s.hang = sc.cellHang[ci] === 1;
      s.x = sc.cellX[ci];
      s.y = sc.cellY[ci];
      if (s.st === WALK) { s.st = IDLE; s.tm = 0.5; }
    } else this.swimTo(s, ci, 0);
  };

  CP.add = function (v, sex, age, cell) {
    const sc = this.scape, ci = cell != null ? cell : ri(0, sc.n - 1);
    const s = {
      v, sex, age, // sex: 0 female, 1 male
      belly: 0.6 + rnd() * 0.3,
      berried: 0, // seconds of carrying eggs left; 0 = none
      mate: v, // colour of the father of the current clutch
      cool: rnd() * 60, // seconds until she can carry again
      x: sc.cellX[ci], y: sc.cellY[ci], dir: rnd() < 0.5 ? -1 : 1,
      st: IDLE, tm: rnd() * 2, c: ci, tc: ci, goal: 0,
      sx: 0, sy: 0, tx: 0, ty: 0, sd: 1, sp: 0, arc: 0,
      hang: sc.cellHang[ci] === 1, // upside-down under a floating plant
      ph: rnd() * 10, // so they do not all step in time
    };
    this.shrimp.push(s);
    return s;
  };

  // The shrimp the player picked: all adults, as near half female as it goes.
  CP.stock = function (picks) {
    const list = [];
    picks.forEach((n, v) => { for (let i = 0; i < n; i++) list.push(v); });
    for (let i = list.length - 1; i > 0; i--) {
      const j = ri(0, i), tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    list.forEach((v, i) => this.add(v, i % 2, K.JUV_T + rnd() * 300));
  };

  CP.swimTo = function (s, ci, goal) {
    const sc = this.scape;
    s.sx = s.x;
    s.sy = s.y + (s.st !== SWIM && s.hang ? bodyH(s) : 0);
    s.hang = false;
    s.tc = ci;
    s.tx = sc.cellX[ci];
    s.ty = sc.cellY[ci] + (sc.cellHang[ci] ? bodyH(s) : 0);
    const d = Math.hypot(s.tx - s.sx, s.ty - s.sy);
    s.sd = Math.max(0.5, d / SWIM_SP[stageOf(s)]);
    s.sp = 0;
    s.arc = Math.min(16, 3 + d * 0.22);
    s.goal = goal;
    s.st = SWIM;
    if (s.tx !== s.sx) s.dir = s.tx > s.sx ? 1 : -1;
  };

  CP.hatch = function (s, cap) {
    const room = cap - this.shrimp.length;
    if (room <= 0) { s.berried = 8; return; } // hold the eggs a little longer
    const sc = this.scape, n = Math.min(room, 3 + ri(0, 3));
    const home = Math.round(s.c), surf = sc.surfaces[sc.cellSurf[home]];
    for (let i = 0; i < n; i++) {
      const b = this.add(genes(s.v, s.mate), rnd() < 0.5 ? 0 : 1, 0, home);
      b.x = s.x;
      b.y = s.y;
      b.belly = 0.7;
      let j = home + ri(-14, 14);
      if (j < surf.a) j = surf.a;
      if (j >= surf.b) j = surf.b - 1;
      this.swimTo(b, j, 0);
    }
    s.berried = 0;
    s.cool = 90 + rnd() * 120;
    this.born += n;
    this.events.push({ type: 'born', x: s.x, y: s.y, n });
  };

  // An idle shrimp picks what to do next. Hungry ones go looking for biofilm:
  // first along the surface they are on, then anywhere in the tank.
  CP.decide = function (s, stg) {
    const sc = this.scape, film = this.film, gi = sc.cellGi;
    const ci = Math.round(s.c), surf = sc.surfaces[sc.cellSurf[ci]];
    if (s.belly < 0.85) {
      let best = -1, bf = 0.1;
      for (let k = 0; k < 6; k++) {
        let j = ci + ri(-28, 28);
        if (j < surf.a) j = surf.a;
        if (j >= surf.b) j = surf.b - 1;
        const v = film[gi[j]] - Math.abs(j - ci) * 0.004;
        if (v > bf) { bf = v; best = j; }
      }
      // A swim is only worth it for a clearly richer patch. Without this a
      // crowd settles on one picked-over branch and goes hungry beside food.
      let far = -1, ff = Math.max(0.15, bf + 0.25);
      for (let k = 0; k < 4; k++) {
        const j = ri(0, sc.n - 1), v = film[gi[j]];
        if (v > ff) { ff = v; far = j; }
      }
      if (far >= 0) { this.swimTo(s, far, 1); return; }
      if (best >= 0) {
        if (best === ci) { s.st = GRAZE; s.tm = 3 + rnd() * 5; }
        else { s.tc = best; s.st = WALK; s.goal = 1; }
        return;
      }
    }
    const r = rnd();
    if (r < 0.4) {
      let j = ci + ri(-22, 22);
      if (j < surf.a) j = surf.a;
      if (j >= surf.b) j = surf.b - 1;
      s.tc = j;
      s.st = WALK;
      s.goal = 0;
    } else if (r < 0.52) {
      let j = ri(0, sc.n - 1);
      if (stg === 0) {
        // shrimplets keep their swims short
        let bd = 1e9;
        for (let k = 0; k < 6; k++) {
          const q = ri(0, sc.n - 1), d = Math.abs(sc.cellX[q] - s.x) + Math.abs(sc.cellY[q] - s.y);
          if (d < bd) { bd = d; j = q; }
        }
      }
      this.swimTo(s, j, 0);
    } else if (r < 0.75) {
      s.st = GRAZE;
      s.tm = 2 + rnd() * 3;
    } else {
      s.st = IDLE;
      s.tm = 1 + rnd() * 3;
      if (rnd() < 0.3) s.dir = -s.dir;
    }
  };

  CP.update = function (s, dt, cap) {
    const sc = this.scape, film = this.film;
    s.age += dt;
    const stg = stageOf(s), need = NEED[stg];
    s.belly -= K.DRAIN * need * dt;
    if (s.belly < 0) s.belly = 0;

    // Breeding: a fed adult female, a male in the tank, and room for more.
    if (stg === 2 && s.sex === 0) {
      if (s.berried > 0) {
        s.berried -= dt;
        if (s.berried <= 0) this.hatch(s, cap);
      } else {
        s.cool -= dt;
        if (s.cool <= 0 && s.belly > 0.5 && this.males.length && this.shrimp.length + this.pending < cap && rnd() < dt / 20) {
          s.berried = K.GEST;
          s.mate = this.males[ri(0, this.males.length - 1)].v;
          this.pending += 4;
          this.events.push({ type: 'berried', x: s.x, y: s.y });
        }
      }
    }

    if (s.st === SWIM) {
      s.sp += dt / s.sd;
      if (s.sp >= 1) {
        s.c = s.tc;
        s.x = sc.cellX[s.tc];
        s.y = sc.cellY[s.tc];
        s.hang = sc.cellHang[s.tc] === 1;
        if (s.goal === 1) { s.st = GRAZE; s.tm = 3 + rnd() * 5; }
        else { s.st = IDLE; s.tm = 0.4 + rnd() * 2; }
      } else {
        const p = s.sp, e = p * p * (3 - 2 * p);
        s.x = s.sx + (s.tx - s.sx) * e;
        const y = s.sy + (s.ty - s.sy) * e - Math.sin(Math.PI * p) * s.arc;
        // stay under the surface, but no lower than where the swim starts or ends
        s.y = Math.max(Math.min(sc.waterTop + 9, s.sy, s.ty), y);
      }
    } else if (s.st === WALK) {
      const d = s.tc - s.c, step = WALK_SP[stg] * dt;
      if (Math.abs(d) <= step) {
        s.c = s.tc;
        if (s.goal === 1) { s.st = GRAZE; s.tm = 3 + rnd() * 5; }
        else { s.st = IDLE; s.tm = 0.5 + rnd() * 2; }
      } else {
        s.c += d > 0 ? step : -step;
        s.dir = d > 0 ? 1 : -1;
      }
      const ci = Math.round(s.c);
      s.x = sc.cellX[ci];
      s.y = sc.cellY[ci];
    } else if (s.st === GRAZE) {
      const ci = Math.round(s.c), gi = sc.cellGi[ci], f = film[gi];
      if (s.belly < 1 && f > 0.02) {
        const e = Math.min(f, K.EAT * need * dt);
        film[gi] = f - e;
        s.belly = Math.min(1, s.belly + e * K.FOOD);
      }
      s.tm -= dt;
      if (s.tm <= 0 || s.belly >= 1) {
        s.st = IDLE;
        s.tm = 0.3 + rnd() * 1.5;
      } else if (f <= 0.02) {
        // this spot is picked clean: shuffle over to the best patch close by
        const surf = sc.surfaces[sc.cellSurf[ci]];
        let best = -1, bf = 0.05;
        for (let k = -3; k <= 3; k++) {
          const j = ci + k;
          if (k && j >= surf.a && j < surf.b && film[sc.cellGi[j]] > bf) { bf = film[sc.cellGi[j]]; best = j; }
        }
        if (best >= 0) { s.tc = best; s.st = WALK; s.goal = 1; }
        else { s.st = IDLE; s.tm = 0.2 + rnd(); }
      }
    } else {
      s.tm -= dt;
      if (s.tm <= 0) this.decide(s, stg);
    }
  };

  CP.step = function (dt) {
    this.t += dt;
    const G = growthAt(this.def, this.t);
    if (G !== this.G) this.rebuild(G);
    const sc = this.scape, film = this.film, n = sc.n, cellGi = sc.cellGi, cap = this.cap();

    // Biofilm grows back fastest where it has been grazed bare. The rate is
    // set so a full tank eats most, not all, of what grows: a mature tank
    // feeds more shrimp because it has both more surface and richer growth.
    const g = ((1.3 * cap * (K.DRAIN / K.FOOD)) / (sc.richSum * 0.6)) * dt, rich = sc.cellRich;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const gi = cellGi[i];
      let f = film[gi];
      f += g * rich[i] * (1 - f);
      if (f > 1) f = 1;
      film[gi] = f;
      sum += f;
    }
    this.filmAvg = sum / n;

    this.males.length = 0;
    let berried = 0;
    for (const s of this.shrimp) {
      if (s.age < K.JUV_T) continue;
      if (s.sex === 1) this.males.push(s);
      else if (s.berried > 0) berried++;
    }
    this.pending = berried * 4;

    const list = this.shrimp, count = list.length; // babies born this step wait for the next
    for (let i = 0; i < count; i++) this.update(list[i], dt, cap);
  };

  CP.save = function () {
    return {
      tank: this.def.size.id, theme: this.def.theme.id, t: Math.round(this.t), born: this.born, film: +this.filmAvg.toFixed(3),
      shrimp: this.shrimp.map((s) => [s.v, s.sex, Math.round(s.age), +s.belly.toFixed(2), Math.max(0, Math.round(s.berried)), s.mate, Math.round(s.cool)]),
    };
  };

  // Saves from before themes existed name only a tank. Give each the theme
  // closest to how it used to look; the old 40 gallon was called "jungle".
  const OLD_LOOK = { cube: 'jungle', ten: 'river', long: 'mountain', jungle: 'jungle' };
  Colony.load = function (data) {
    const def = SC.tankDef(data.tank === 'jungle' ? 'grand' : data.tank, data.theme || OLD_LOOK[data.tank] || 'jungle');
    return def ? new Colony(def, data) : null;
  };

  SC.Colony = Colony;
  SC.stageOf = stageOf;
  SC.ST = { IDLE, WALK, GRAZE, SWIM };
})(typeof window !== 'undefined' ? window : globalThis);
