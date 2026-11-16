// Draws a tank, pixel by pixel, for a given growth step, and works out where
// shrimp can stand. No canvas calls here: everything goes into plain pixel
// buffers, so edges stay crisp and Node can run it for tests.
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  const hash2 = SC.hash2, R = Math.round;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // '#rrggbb' to the 32-bit value an ImageData buffer wants (little-endian RGBA).
  function col(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
  }
  SC.col32 = col;

  // Every list runs light to dark.
  const RAW = {
    // substrates
    sand: ['#efdfb4', '#d9c392', '#b99f70', '#967d57'],
    white: ['#fbf6e6', '#ebe2c8', '#d2c6a6', '#b3a688'],
    soil: ['#73594a', '#523f33', '#3b2d25', '#2a201b'],
    mud: ['#5e5a40', '#45432f', '#333224', '#24241a'],
    pebble: ['#d9cfbb', '#b5a892', '#8f8370', '#6b6255', '#9aa0a6', '#7a6a58'],
    // rock
    rock: ['#c3c9d1', '#959dab', '#6c7484', '#4a5060', '#323744'],
    river: ['#ddd2bd', '#b9aa92', '#92836d', '#6b5f50', '#4a4138'],
    reef: ['#cdbdd3', '#a492b4', '#7a6b90', '#574b6e', '#3b3352'],
    dark: ['#8f8f84', '#6c6c62', '#4f4f48', '#383833', '#272724'],
    // wood
    wood: ['#bd9462', '#93693c', '#6a4728', '#49301c'],
    darkwood: ['#8c6a48', '#66482e', '#47311f', '#2f2015'],
    log: ['#b39a78', '#8a7355', '#63513b', '#433627'],
    // plants
    leaf: ['#a4de62', '#66b649', '#3e8e3e', '#286737', '#1c4b30'],
    back: ['#5fa25a', '#3f8450', '#2c6748', '#1f4f40'],
    darkleaf: ['#6f9a52', '#4a7a44', '#32603c', '#234a34'],
    red: ['#f59a74', '#d8604e', '#a53c40', '#74303a'],
    moss: ['#86cc52', '#52a03f', '#337434', '#22532c'],
    kelp: ['#d2c860', '#9aa040', '#667532', '#435228'],
    sea: ['#8fe0b0', '#4fb890', '#2f8f7a', '#1f6a62', '#164f4d'],
    litter: ['#b98548', '#8f5f34', '#6c4428', '#4d301f'],
    root: ['#7a8450', '#565f3c'],
    // corals
    coralPink: ['#ffc2d1', '#f58aa6', '#cf5a80', '#963a62'],
    coralOrange: ['#ffd9a0', '#f7a552', '#cf7332', '#944a22'],
    coralPurple: ['#ddc2ff', '#b08af5', '#835acf', '#5c3a96'],
    coralTeal: ['#c2ffe6', '#6fe6b8', '#38b48c', '#227f66'],
    // kit
    sponge: ['#56617a', '#3c4459', '#2b3142'],
    tube: ['#d5e3ea', '#9fbccb', '#7fa0b0'],
  };
  const P = {};
  for (const k in RAW) P[k] = RAW[k].map(col);
  const CORALS = [P.coralPink, P.coralOrange, P.coralPurple, P.coralTeal];
  const TIP = col('#fff8ee'), CORALLINE = col('#e58ab4');

  // What a solid pixel is made of. 7 to 10 are the four coral colours.
  const M = { SUB: 1, ROCK: 2, WOOD: 3, LEAF: 4, SPONGE: 5, BALL: 6, CORAL: 7 };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  const PEBBLES = [0, 1, 1, 2, 4, 5, 2, 0]; // which pebble shades turn up, and how often
  const SHELL = ['.LL.', 'LPPL', 'DPPD'], STAR = ['..O..', 'OOYOO', '.OOO.', 'O...O'];
  const DECOR_INK = { L: col('#fff4e0'), P: col('#f2b8b0'), D: col('#c98f8a'), O: col('#f08a3a'), Y: col('#ffc76a') };

  // G is the growth step, 0 (just set up) to 20 (fully grown in).
  // Every random choice is made in the same order whatever G is, so a plant
  // stays the same plant from one step to the next and only gets bigger.
  function buildScape(def, G) {
    const w = def.w, h = def.h, L = def.layout;
    const S = {
      def, G, w, h, waterTop: 6,
      bg: new Uint32Array(w * h), // behind the shrimp
      fg: new Uint32Array(w * h), // in front of the shrimp, 0 = clear
      solid: new Uint8Array(w * h),
      gy: new Int16Array(w), // top row of the substrate in each column
      bubble: { x: 0, y: 0 },
    };
    const rng = SC.RNG(def.seed);
    const bg = S.bg, fg = S.fg, solid = S.solid, WT = S.waterTop;
    const inb = (x, y) => x >= 0 && x < w && y >= 0 && y < h;
    const put = (x, y, c) => { if (inb(x, y)) bg[y * w + x] = c; };
    const putS = (x, y, c, m) => { if (inb(x, y)) { bg[y * w + x] = c; solid[y * w + x] = m; } };
    const putF = (x, y, c) => { if (inb(x, y)) fg[y * w + x] = c; };
    // the first solid row in a column: where something set down there would rest
    const topAt = (x) => {
      x = clamp(R(x), 0, w - 1);
      for (let y = WT + 9; y < h; y++) if (solid[y * w + x]) return y;
      return h - 1;
    };
    // Things a shrimp can cling to and climb: plant stems, roots, coral.
    // Each is a run of x,y points from the bottom up.
    const climb = [];

    // A tapering curved branch, stamped into the solid map; colour comes later.
    function branch(b, mat, hold) {
      const x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3], x2 = b[4], y2 = b[5], r0 = b[6], r1 = b[7];
      const n = Math.ceil((Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1)) * 2) || 1;
      const run = [];
      let lastY = 1e9;
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        const px = R(u * u * x0 + 2 * u * t * x1 + t * t * x2), py = R(u * u * y0 + 2 * u * t * y1 + t * t * y2);
        const r = r0 + (r1 - r0) * t, rr = r * r, rc = Math.ceil(r);
        for (let dy = -rc; dy <= rc; dy++) {
          for (let dx = -rc; dx <= rc; dx++) {
            if (dx * dx + dy * dy <= rr && inb(px + dx, py + dy)) solid[(py + dy) * w + px + dx] = mat;
          }
        }
        if (py !== lastY) { run.push(px, py); lastY = py; }
      }
      if (!hold || run.length < 8) return;
      if (run[1] < run[run.length - 1]) {
        // drawn top-down (a root): flip it so the run climbs
        const rev = [];
        for (let k = run.length - 2; k >= 0; k -= 2) rev.push(run[k], run[k + 1]);
        climb.push({ pts: rev, solid: mat, rich: hold });
      } else climb.push({ pts: run, solid: mat, rich: hold });
    }

    // ---- substrate height ----
    {
      const base = h - L.subDepth, p1 = rng() * 6.28, p2 = rng() * 6.28;
      let prev = 0;
      for (let x = 0; x < w; x++) {
        let v = base + Math.sin(x * 0.045 + p1) * 1.6 + Math.sin(x * 0.11 + p2) * 0.8;
        for (const m of L.hills) {
          const d = (x - m.x * w) / (m.r * w);
          v -= m.h * Math.exp(-d * d);
        }
        const r = R(v);
        prev = x === 0 ? r : clamp(r, prev - 1, prev + 1);
        S.gy[x] = prev;
      }
    }

    // ---- water, with soft light shafts ----
    {
      const water = def.water.map(col), nb = water.length, airC = col('#3b3658');
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let c = airC;
          if (y >= WT) {
            const t = (y - WT) / (h - WT);
            let f = t * (nb - 1);
            const shaft = (((x + y * 0.55 + def.seed) % 52) + 52) % 52;
            if (shaft < 8 && t < 0.8) f = Math.max(0, f - 0.45 * (1 - t));
            const i = Math.floor(f), fr = clamp((f - i - 0.25) / 0.5, 0, 1);
            const thr = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
            c = water[Math.min(nb - 1, i + (fr > thr ? 1 : 0))];
          }
          bg[y * w + x] = c;
        }
      }
    }

    // ---- stem plants, ribbon grass and kelp, behind everything ----
    const stems = [];
    for (const c of L.stems) {
      for (let i = 0; i < c.n; i++) {
        stems.push({
          x: R((c.x0 + ((c.x1 - c.x0) * (i + rng())) / c.n) * w),
          maxH: rng.range(c.h[0], c.h[1]), born: rng.int(c.born[0], c.born[1]),
          phase: rng() * 6.28, kind: c.kind,
        });
      }
    }
    const valls = [];
    for (const c of L.vall) {
      for (let i = 0; i < c.n; i++) {
        valls.push({
          x: R((c.x0 + ((c.x1 - c.x0) * (i + rng())) / c.n) * w),
          maxLen: rng.range(h * 0.85, h * 1.15), born: rng.int(c.born[0], c.born[1]),
          lean: c.lean, seed: rng.int(1, 9999), kind: c.kind,
        });
      }
    }
    for (const v of valls) {
      const len = R(v.maxLen * clamp((G - v.born + 1) / 9, 0, 1));
      if (G < v.born || len < 4) continue;
      const run = [];
      climb.push({ pts: run, rich: 0.15 });
      if (v.kind === 'kelp') {
        // kelp sways as it rises, with a blade every few rows
        const x0 = clamp(v.x, 5, w - 6);
        let x = x0, y = S.gy[x0] + 1;
        for (let i = 0; i < len && y > WT + 3; i++, y--) {
          x = x0 + R(Math.sin(i * 0.16 + v.seed) * 2.2 * Math.min(1, i / 10));
          put(x, y, P.kelp[2]);
          if (i > 3 && i % 4 === 0) {
            const side = (i >> 2) & 1 ? 1 : -1;
            put(x + side, y, P.kelp[1]);
            put(x + side * 2, y - 1, P.kelp[0]);
            put(x + side * 3, y - 1, P.kelp[1]);
          }
          run.push(x, y);
        }
        put(x, y, P.kelp[0]);
        continue;
      }
      let x = clamp(v.x, 2, w - 3), y = S.gy[x] + 1, trail = 0;
      for (let i = 0; i < len && trail < 14; i++) {
        put(x, y, P.back[1]);
        put(x + 1, y, P.back[0]);
        if (y > WT + 2) {
          run.push(x, y);
          y--;
          // in a current the blade bends further over the higher it gets
          if (hash2(i, v.seed, 9) < (L.flow ? 0.12 + 0.6 * (i / v.maxLen) : 0.2)) x += v.lean;
        } else {
          x += v.lean || 1; // reached the top: trail along the surface
          trail++;
        }
      }
    }
    for (const st of stems) {
      if (G < st.born) continue;
      const H = R(st.maxH * clamp((G - st.born + 2) / 9, 0, 1));
      if (H < 3) continue;
      const bx = clamp(st.x, 3, w - 4), base = S.gy[bx] + 2, red = st.kind === 'red';
      const pal = st.kind === 'dark' ? P.darkleaf : P.back;
      let x = bx, y = base;
      const run = [];
      climb.push({ pts: run, rich: 0.15 });
      for (let i = 0; i <= H; i++) {
        y = base - i;
        if (y <= WT + 3) break;
        x = bx + R(Math.sin(i * 0.1 + st.phase) * 1.8 * Math.min(1, i / 16));
        run.push(x, y);
        const hot = red && i / H > 0.5;
        put(x, y, hot ? P.red[2] : pal[2]);
        if (i > 1 && i % 3 === 0) {
          const lc = hot ? P.red[1] : pal[1], tip = hot ? P.red[0] : pal[0];
          put(x - 1, y, lc);
          put(x + 1, y, lc);
          if (i < H - 2) {
            put(x - 2, y - 1, tip);
            put(x + 2, y - 1, tip);
          }
        }
      }
      const crown = red ? P.red[0] : st.kind === 'dark' ? P.darkleaf[0] : P.leaf[0];
      put(x, y - 1, crown);
      put(x - 1, y - 1, crown);
      put(x + 1, y - 1, crown);
    }

    // ---- rocks ----
    // round: a smooth river stone. peak: narrows toward the top, like a crag.
    const rocks = [];
    {
      const pal = P[L.rockPal], reef = L.rockPal === 'reef';
      for (const r of L.rocks) {
        const cx = R(r.x * w), rx = r.rx, ry = r.ry;
        const cy = S.gy[clamp(cx, 0, w - 1)] - R(ry * 0.5);
        rocks.push({ cx, cy, rx, ry });
        const p1 = rng() * 6.28, p2 = rng() * 6.28, p3 = rng() * 6.28, sd = rng.int(1, 9999);
        const pw = r.round ? 2 : 2.5, amp = r.round ? 0.4 : 1;
        for (let y = Math.floor(cy - ry * 1.5); y <= Math.ceil(cy + ry * 1.5); y++) {
          for (let x = Math.floor(cx - rx * 1.5); x <= Math.ceil(cx + rx * 1.5); x++) {
            if (!inb(x, y) || y < WT + 8) continue;
            const ny = (y - cy) / ry;
            let nx = (x - cx) / rx;
            if (r.peak) nx /= 1 - 0.72 * clamp((0.6 - ny) / 1.6, 0, 1);
            const th = Math.atan2(ny, nx);
            const rad = 1 + amp * (0.14 * Math.sin(3 * th + p1) + 0.09 * Math.sin(5 * th + p2) + 0.05 * Math.sin(9 * th + p3));
            const d = Math.pow(Math.pow(Math.abs(nx), pw) + Math.pow(Math.abs(ny), pw), 1 / pw);
            if (d >= rad) continue;
            const lum = -(nx * 0.5 + ny * 0.85) / rad + (hash2(x, y, sd) - 0.5) * 0.3 * amp + Math.sin(x * 0.35 + y * 0.8 + p2) * 0.14 * amp;
            let c = lum > 0.5 ? pal[0] : lum > 0.12 ? pal[1] : lum > -0.3 ? pal[2] : pal[3];
            // pink crust that creeps over reef rock as the tank ages
            if (reef && hash2(x >> 1, y >> 1, sd + 5) < 0.04 + 0.1 * (G / 20)) c = CORALLINE;
            putS(x, y, c, M.ROCK);
          }
        }
      }
    }

    // ---- wood: mark it now, colour it once the substrate is in ----
    for (const b of L.wood) branch(b, M.WOOD, 0);
    for (const rc of L.roots) {
      // roots that come down from above the water and spread into the mud
      const cx = rc.x * w;
      branch([cx, -5, cx + rng.range(-1.5, 1.5), 5, cx, 14, 5.5, 4], M.WOOD, 0);
      for (let i = 0; i < rc.n; i++) {
        const off = (rc.n === 1 ? 0 : ((i / (rc.n - 1)) * 2 - 1) * rc.spread) + rng.range(-3, 3);
        const x2 = clamp(cx + off, 4, w - 5), yEnd = S.gy[R(x2)] + 6;
        branch([cx + off * 0.12, 11, cx + off * rng.range(0.75, 1.15), yEnd * rng.range(0.28, 0.48), x2, yEnd, 2.3, 1.3], M.WOOD, 0.5);
      }
    }

    // ---- substrate ----
    {
      const kind = L.sub, sp = P[kind];
      for (let x = 0; x < w; x++) {
        for (let y = S.gy[x]; y < h; y++) {
          const d = y - S.gy[x], r = hash2(x, y, def.seed);
          let c;
          if (kind === 'soil' || kind === 'mud') {
            const grain = ((x + (y >> 1)) & 1) === 0;
            c = d === 0 ? (r < 0.5 ? sp[0] : sp[1]) : d < 4 ? (grain ? sp[1] : sp[2]) : grain ? sp[2] : sp[3];
            if (d > 0 && r < (kind === 'soil' ? 0.07 : 0.03)) c = sp[0];
          } else if (kind === 'pebble') {
            // rounded stones: each pixel belongs to the nearest of a loose
            // scatter of stone centres, with a dark gap where two stones meet
            const gx = Math.floor(x / 4), gr = Math.floor(y / 3);
            let d1 = 1e9, d2 = 1e9, stone = 0;
            for (let j = -1; j <= 1; j++) {
              for (let k = -1; k <= 1; k++) {
                const a = gx + k, b = gr + j;
                const px = a * 4 + 2 + (hash2(a, b, def.seed + 3) - 0.5) * 3.2, py = b * 3 + 1.5 + (hash2(a, b, def.seed + 4) - 0.5) * 2.2;
                const dd = Math.hypot(x - px, (y - py) * 1.25);
                if (dd < d1) { d2 = d1; d1 = dd; stone = hash2(a, b, def.seed + 5); } else if (dd < d2) d2 = dd;
              }
            }
            c = d2 - d1 < 0.75 ? sp[3] : sp[PEBBLES[Math.floor(stone * PEBBLES.length)]];
            if (d === 0 && d2 - d1 >= 0.75) c = stone < 0.5 ? sp[0] : sp[1];
          } else {
            c = d === 0 ? sp[0] : d < 3 ? (r < 0.18 ? sp[0] : r < 0.36 ? sp[2] : sp[1]) : r < 0.2 ? sp[1] : r < 0.4 ? sp[3] : sp[2];
            // ripple marks in the white sand
            if (kind === 'white' && d > 0 && (d + Math.floor(x / 5)) % 4 === 0 && r < 0.5) c = sp[2];
          }
          putS(x, y, c, M.SUB);
        }
      }
    }

    // ---- fallen leaves on the floor ----
    for (const lf of L.litter) {
      if (G < lf.born) continue;
      const cx = R(lf.x * w);
      for (let dx = -lf.rx; dx <= lf.rx; dx++) {
        const x = cx + dx;
        if (x < 2 || x >= w - 2) continue;
        const base = S.gy[x] - 1;
        if (solid[base * w + x]) continue; // a rock or a root is already here
        const u = dx / (lf.rx + 0.5), top = base - R(1.6 * Math.sqrt(Math.max(0, 1 - u * u)));
        for (let y = top; y <= base; y++) {
          putS(x, y, y === top ? P.litter[0] : dx === 0 || y === base ? P.litter[2] : P.litter[1], M.LEAF);
        }
      }
    }

    // ---- moss balls ----
    for (const b of L.balls) {
      if (G < b.born) continue;
      const r = Math.max(2, R(b.r * clamp((G - b.born + 4) / 8, 0.5, 1)));
      const cx = R(b.x * w), cy = S.gy[cx] - r + 1;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + 1) continue;
          const lum = (-dx - dy * 1.4) / r + (hash2(cx + dx, cy + dy, 5) - 0.5) * 0.9;
          putS(cx + dx, cy + dy, lum > 0.7 ? P.moss[0] : lum > -0.1 ? P.moss[1] : lum > -0.9 ? P.moss[2] : P.moss[3], M.BALL);
        }
      }
    }

    // ---- sponge filter ----
    {
      const fx = R(L.filter * w), gyf = S.gy[fx], top = gyf - 13;
      for (let y = top; y < gyf; y++) {
        for (let dx = -4; dx <= 4; dx++) {
          if ((y === top || y === gyf - 1) && Math.abs(dx) === 4) continue;
          const c = dx === -4 || hash2(fx + dx, y, 3) < 0.2 ? P.sponge[0] : (dx + y) & 1 ? P.sponge[1] : P.sponge[2];
          putS(fx + dx, y, c, M.SPONGE);
        }
      }
      for (let dx = -5; dx <= 5; dx++) put(fx + dx, gyf, P.sponge[2]);
      const tubeTop = top - 11;
      for (let y = tubeTop; y < top; y++) {
        put(fx - 1, y, P.tube[1]);
        put(fx, y, P.tube[0]);
        put(fx + 1, y, P.tube[1]);
      }
      for (let y = 0; y < top - 2; y++) put(fx + 3, y, P.tube[2]); // air line
      put(fx + 2, top - 3, P.tube[2]);
      S.bubble.x = fx;
      S.bubble.y = tubeTop - 1;
    }

    // ---- corals ----
    const tips = [];
    for (const c of L.corals) {
      if (G < c.born) continue;
      const grow = clamp((G - c.born + 2) / 12, 0, 1), pal = CORALS[c.pal], cx = R(c.x * w);
      if (c.kind === 'dome') {
        // a brain coral: a low dome with wandering stripes
        const r = Math.max(2, R(c.size * (0.45 + 0.55 * grow))), base = topAt(cx) - 1;
        for (let dy = -r; dy <= 0; dy++) {
          for (let dx = -r - 1; dx <= r + 1; dx++) {
            const d = Math.hypot(dx / 1.25, dy);
            if (d > r) continue;
            const stripe = (Math.floor(d * 1.2 + Math.atan2(-dy, dx) * 2.2 + 10) & 1) === 0;
            putS(cx + dx, base + dy, d > r - 1.1 && dy < -r * 0.3 ? pal[0] : stripe ? pal[1] : pal[2], M.BALL);
          }
        }
      } else if (c.kind === 'branch') {
        // a staghorn coral: a trunk that forks twice
        const rc = SC.RNG(c.seed), g = 0.35 + 0.65 * grow, mat = M.CORAL + c.pal;
        const fork = (x, y, ang, len, r, depth) => {
          ang = clamp(ang, 0.35, Math.PI - 0.35);
          const bend = rc.range(-0.25, 0.25) * len * g;
          const x2 = x + Math.cos(ang) * len * g, y2 = y - Math.sin(ang) * len * g;
          const mx = (x + x2) / 2 - Math.sin(ang) * bend, my = (y + y2) / 2 - Math.cos(ang) * bend;
          branch([x, y, mx, my, x2, y2, r, Math.max(0.8, r * 0.75)], mat, depth < 2 ? 0.5 : 0);
          if (depth === 2) { tips.push(R(x2), R(y2)); return; }
          const n = depth === 0 ? 3 : 2, fan = depth === 0 ? 1.5 : 1.1;
          for (let i = 0; i < n; i++) {
            fork(x2, y2, ang + (i / (n - 1) - 0.5) * fan + rc.range(-0.15, 0.15), len * rc.range(0.6, 0.8), r * 0.8, depth + 1);
          }
        };
        fork(cx, topAt(cx) + 1, 1.57 + rc.range(-0.15, 0.15), c.size * 0.42, 1.7, 0);
      }
    }

    // ---- shading for wood, coral and rock, from what is next to each pixel ----
    {
      const woodPal = P[L.woodPal], rockPal = P[L.rockPal];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, m = solid[i];
          if (m === M.WOOD || m >= M.CORAL) {
            const pal = m === M.WOOD ? woodPal : CORALS[m - M.CORAL];
            const up = y === 0 || solid[i - w] === m, up2 = y < 2 || solid[i - 2 * w] === m, dn = y < h - 1 && solid[i + w] === m;
            let c = !up ? pal[0] : !dn ? pal[3] : !up2 ? pal[1] : pal[2];
            if (m === M.WOOD && up && dn && hash2(x >> 1, y, 31) < 0.14) c = pal[3];
            bg[i] = c;
          } else if (m === M.ROCK && y > 0 && y < h - 1) {
            if (solid[i - w] === 0 && hash2(x, y, 41) < 0.8) bg[i] = rockPal[0];
            else if (solid[i + w] !== M.ROCK) bg[i] = rockPal[4];
          }
        }
      }
      for (let k = 0; k < tips.length; k += 2) if (solid[tips[k + 1] * w + tips[k]] >= M.CORAL) put(tips[k], tips[k + 1], TIP);
    }

    // ---- rock faces: where a rock is too steep to stand on, a shrimp can cling to its side ----
    for (const r of rocks) {
      for (const side of [-1, 1]) {
        const far = clamp(R(r.cx + side * r.rx * 1.6), 1, w - 2), yTop = Math.max(WT + 9, R(r.cy - r.ry * 1.6));
        let run = null, lastX = 0;
        for (let y = Math.min(h - 1, R(r.cy + r.ry * 1.5)); y >= yTop; y--) {
          let ex = -1; // the outermost rock pixel on this side of this row
          for (let x = far; side < 0 ? x <= r.cx : x >= r.cx; x -= side) {
            if (solid[y * w + x] === M.ROCK) { ex = x; break; }
          }
          if (ex >= 0 && !solid[y * w + ex + side] && y < S.gy[ex] - 1 && (!run || Math.abs(ex - lastX) <= 2)) {
            if (!run) climb.push({ pts: (run = []), solid: M.ROCK, rich: 0.5, side });
            run.push(ex, y);
            lastX = ex;
          } else run = null;
        }
      }
    }

    // ---- sea fans: a flat net of ribs, nothing to stand on but good to climb ----
    for (const c of L.corals) {
      if (c.kind !== 'fan' || G < c.born) continue;
      const pal = CORALS[c.pal], cx = R(c.x * w), by = topAt(cx) - 1;
      const size = c.size * (0.4 + 0.6 * clamp((G - c.born + 2) / 12, 0, 1));
      const a0 = 0.55, da = (Math.PI - 2 * a0) / 6, lim = Math.ceil(size * 1.1);
      for (let dy = -lim; dy <= 0; dy++) {
        for (let dx = -lim; dx <= lim; dx++) {
          const d = Math.hypot(dx, dy), ang = Math.atan2(-dy, dx);
          if (d < 1 || ang < a0 - 0.06 || ang > Math.PI - a0 + 0.06) continue;
          if (d > size * (0.88 + 0.14 * Math.sin(ang * 5 + c.seed))) continue;
          if (!inb(cx + dx, by + dy) || solid[(by + dy) * w + cx + dx]) continue;
          const rib = R((ang - a0) / da);
          if (Math.abs(ang - (a0 + rib * da)) * d < 0.55) put(cx + dx, by + dy, pal[2]);
          else if (R(d) % 4 === 0) put(cx + dx, by + dy, pal[1]);
        }
      }
      put(cx, by, pal[3]);
      const run = [];
      for (let d = 2; d < size * 0.85; d++) run.push(cx, by - d);
      climb.push({ pts: run, rich: 0.3 });
    }

    // ---- shells and starfish on the sand ----
    for (const d of L.decor) {
      const art = d.kind === 'star' ? STAR : SHELL, x0 = R(d.x * w), base = topAt(x0 + 2);
      if (solid[base * w + clamp(x0 + 2, 0, w - 1)] !== M.SUB) continue; // only on open sand
      for (let r = 0; r < art.length; r++) {
        for (let k = 0; k < art[r].length; k++) {
          const y = base - art.length + r, i = y * w + x0 + k;
          if (art[r][k] !== '.' && inb(x0 + k, y) && !solid[i]) bg[i] = DECOR_INK[art[r][k]];
        }
      }
    }

    // ---- places moss and broad leaves can take hold ----
    // Tops of wood and rock first; on bare roots, which are all side, the sides too.
    const woodTops = [], woodSides = [], rockTops = [];
    for (let x = 6; x < w - 6; x++) {
      for (let y = WT + 10; y < h; y++) {
        const i = y * w + x, m = solid[i];
        if (m !== M.WOOD && m !== M.ROCK) continue;
        if (solid[i - w] === 0) (m === M.WOOD ? woodTops : rockTops).push(x, y);
        else if (m === M.WOOD && (solid[i - 1] === 0 || solid[i + 1] === 0) && y < S.gy[x] - 6) woodSides.push(x, y);
      }
    }
    const woodHolds = woodTops.length >= 40 ? woodTops : woodTops.concat(woodSides);
    const mossList = [];
    for (let i = 0; i < L.moss; i++) {
      const pickWood = rng() < 0.7;
      const src = woodHolds.length && (pickWood || !rockTops.length) ? woodHolds : rockTops;
      const k = src.length ? rng.int(0, src.length / 2 - 1) * 2 : (rng(), 0);
      const maxR = rng.range(3, 6.5), born = rng.int(0, 13), seed = rng.int(1, 9999);
      if (src.length) mossList.push({ x: src[k], y: src[k + 1], maxR, born, seed });
    }
    const anubias = [];
    for (let i = 0; i < L.anubias && woodHolds.length; i++) {
      const k = rng.int(0, woodHolds.length / 2 - 1) * 2;
      const a = { x: woodHolds[k], y: woodHolds[k + 1], born: rng.int(0, 10), leaves: [] };
      const n = rng.int(3, 5);
      for (let j = 0; j < n; j++) {
        a.leaves.push({ dir: j % 2 ? 1 : -1, stalk: rng.int(2, 5), rise: rng.int(2, 7), rx: rng.int(4, 6), ry: rng.range(1.8, 2.6) });
      }
      anubias.push(a);
    }

    // ---- broad leaves: shrimp can stand on these ----
    for (const a of anubias) {
      for (let j = 0; j < a.leaves.length; j++) {
        const lf = a.leaves[j], s = clamp((G - a.born - j * 2 + 1) / 5, 0, 1);
        if (s < 0.35) continue;
        const rx = Math.max(2, R(lf.rx * s)), ry = Math.max(1, lf.ry * s);
        const bx = a.x + lf.dir * R(lf.stalk * s), by = a.y - R(lf.rise * s);
        const steps = Math.max(Math.abs(bx - a.x), Math.abs(by - a.y), 1);
        for (let k = 0; k <= steps; k++) {
          put(R(a.x + ((bx - a.x) * k) / steps), R(a.y + ((by - a.y) * k) / steps), P.leaf[3]);
        }
        const cx = bx + lf.dir * (rx - 1);
        for (let dx = -rx; dx <= rx; dx++) {
          const u = dx / (rx + 0.5), hh = ry * Math.sqrt(Math.max(0, 1 - u * u));
          const top = R(by - hh), bot = R(by + hh * 0.7);
          for (let y = top; y <= bot; y++) {
            const c = y === top ? P.leaf[0] : y === bot ? P.leaf[3] : y === by ? (dx & 1 ? P.leaf[1] : P.leaf[2]) : P.leaf[2];
            putS(cx + dx, y, c, M.LEAF);
          }
        }
      }
    }

    // ---- moss: soft clumps that spread over wood and rock ----
    for (const m of mossList) {
      const r = m.maxR * clamp((G - m.born + 1) / 7, 0, 1);
      if (G < m.born || r < 1) continue;
      const span = Math.ceil(r * 1.6);
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r * 0.8); dy++) {
        for (let dx = -span; dx <= span; dx++) {
          const x = m.x + dx, y = m.y + dy;
          const d = Math.hypot(dx / 1.6, dy) / r;
          if (d > 1 || y <= WT + 6) continue;
          if (hash2(x, y, m.seed) > 0.92 - d * 0.55) continue;
          const hv = hash2(x, y, m.seed + 7);
          put(x, y, dy < -r * 0.3 || hv > 0.78 ? P.moss[0] : hv > 0.35 ? P.moss[1] : P.moss[2]);
        }
      }
    }

    // ---- carpet grass (seagrass in the ocean): creeps outward from where it was planted ----
    {
      const cp = P[L.carpetPal];
      for (let x = 3; x < w - 3; x++) {
        // young at the spreading edge, thicker where it has had time to fill in
        let age = -1;
        for (const c of L.carpet) {
          if (G >= c.born) age = Math.max(age, (G - c.born + 1) * c.rate - Math.abs(x - c.x * w));
        }
        const y = S.gy[x];
        if (age < 0 || solid[y * w + x] !== M.SUB || solid[(y - 1) * w + x]) continue;
        const hv = hash2(x, 0, def.seed + 91);
        const bh = 1 + Math.floor(hv * 2.5) + (age > 8 ? 1 : 0) + (age > 20 ? 1 : 0);
        put(x, y, cp[3]);
        for (let k = 1; k <= bh; k++) put(x, y - k, k === bh ? cp[0] : k & 1 ? cp[1] : cp[2]);
        if (hv > 0.55) putF(x, y - 1, cp[1]); // a blade in front of the shrimp's feet
      }
    }

    // ---- water surface and floating plants ----
    {
      const sc = col('#a8e2ea');
      for (let x = 0; x < w; x++) if (!solid[WT * w + x]) put(x, WT, sc);
      for (const f of L.floaters) {
        if (G < f.born) continue;
        const cx = R(f.x * w), grow = clamp((G - f.born + 1) / 6, 0, 1);
        for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dx) < 3) putF(cx + dx, WT - 1, dx === 0 ? P.leaf[1] : P.leaf[0]);
          putF(cx + dx, WT, Math.abs(dx) === 3 ? P.leaf[2] : P.leaf[1]);
        }
        for (let s = -1; s <= 1; s++) {
          const len = R((5 + hash2(cx, s, 3) * 9) * grow);
          let x = cx + s * 2;
          for (let k = 1; k <= len; k++) {
            if (hash2(x, k, cx) < 0.25) x += hash2(k, x, 8) < 0.5 ? -1 : 1;
            if (inb(x, WT + k) && !solid[(WT + k) * w + x]) put(x, WT + k, k > len * 0.6 ? P.root[1] : P.root[0]);
          }
        }
      }
    }

    extractSurfaces(S, climb);
    return S;
  }

  // A shrimp can stand on any solid pixel with open water above it. Runs of
  // such pixels that step up or down by at most two rows become one surface
  // it can walk along; to reach another surface it has to swim. The climbing
  // runs are surfaces too, taken head-up or head-down: plant stems wherever
  // nothing solid hides them, roots and coral wherever they stand clear of
  // the floor.
  function extractSurfaces(S, climb) {
    const w = S.w, h = S.h, solid = S.solid, minY = S.waterTop + 9;
    const done = [];
    let active = [];
    for (let x = 4; x < w - 4; x++) {
      const tops = [];
      for (let y = minY; y < h; y++) {
        const i = y * w + x;
        if (!solid[i] || solid[i - w]) continue;
        let clear = true;
        for (let k = 2; k <= 5; k++) if (solid[i - k * w]) { clear = false; break; }
        if (clear) tops.push(y);
      }
      const used = new Uint8Array(tops.length), next = [];
      for (const ch of active) {
        let best = -1, bd = 3;
        for (let j = 0; j < tops.length; j++) {
          const d = Math.abs(tops[j] - ch.ly);
          if (!used[j] && d < bd) { bd = d; best = j; }
        }
        if (best >= 0) {
          used[best] = 1;
          ch.xs.push(x);
          ch.ys.push(tops[best]);
          ch.ly = tops[best];
          next.push(ch);
        } else done.push(ch);
      }
      for (let j = 0; j < tops.length; j++) if (!used[j]) next.push({ xs: [x], ys: [tops[j]], ly: tops[j], rich: 1 });
      active = next;
    }
    for (const ch of active) done.push(ch);
    for (const run of climb) {
      const pts = run.pts;
      let cur = null;
      for (let k = 0; k < pts.length; k += 2) {
        const x = pts[k], y = pts[k + 1], i = y * w + x;
        const here = x >= 5 && x < w - 5 && y >= minY && y < h;
        if (here && (run.solid ? solid[i] === run.solid && y < S.gy[x] - 1 : !solid[i])) {
          if (!cur) done.push((cur = { xs: [], ys: [], vert: 1, rich: run.rich, side: run.side || 0 }));
          cur.xs.push(x);
          cur.ys.push(y);
        } else cur = null;
      }
    }
    const keep = done.filter((c) => c.xs.length >= 5);
    let n = 0;
    for (const c of keep) n += c.xs.length;
    S.n = n;
    S.cellX = new Int16Array(n);
    S.cellY = new Int16Array(n);
    S.cellSurf = new Uint16Array(n);
    S.cellGi = new Int32Array(n);
    S.cellHash = new Float32Array(n);
    S.cellVert = new Uint8Array(n); // 1 = on something upright, shrimp drawn head-up
    S.cellSide = new Int8Array(n); // on a rock face: -1 open water to the left, 1 to the right
    // How well biofilm grows here. A thin stem carries less than wood, rock
    // or sand, so the colony spreads over the scape and does not pile onto
    // the plants.
    S.cellRich = new Float32Array(n);
    S.richSum = 0;
    S.surfaces = [];
    let k = 0;
    keep.forEach((c, si) => {
      const a = k;
      for (let j = 0; j < c.xs.length; j++, k++) {
        S.cellX[k] = c.xs[j];
        S.cellY[k] = c.ys[j];
        S.cellSurf[k] = si;
        S.cellGi[k] = c.ys[j] * w + c.xs[j];
        S.cellHash[k] = hash2(c.xs[j], c.ys[j], 77);
        S.cellVert[k] = c.vert ? 1 : 0;
        S.cellSide[k] = c.side || 0;
        S.cellRich[k] = c.rich;
        S.richSum += c.rich;
      }
      S.surfaces.push({ a, b: k, vert: !!c.vert });
    });
  }

  SC.buildScape = buildScape;
})(typeof window !== 'undefined' ? window : globalThis);
