// The five looks a tank can have. A theme is a water colour and a recipe that
// lays out rocks, wood, plants and the rest for whatever size the tank is.
// scape.js does the drawing; this file only decides what goes where.
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  const R = Math.round;

  // Driftwood shapes. Each branch is a curve [x0,y0, x1,y1, x2,y2, startRadius,
  // endRadius], measured from where the trunk meets the ground (y up is negative).
  const WOOD = {
    big: [[0, 8, 8, -24, 48, -40, 5, 2.5], [4, -10, -14, -28, -36, -34, 3, 1.3], [22, -28, 38, -20, 62, -23, 2.5, 1.2], [34, -36, 46, -54, 70, -56, 2, 1]],
    big2: [[0, 8, -6, -22, -38, -36, 5, 2.5], [-4, -12, 14, -28, 40, -30, 3, 1.3], [-20, -30, -30, -46, -54, -48, 2, 1], [-16, -32, -2, -44, 16, -50, 2, 1]],
    mid: [[0, 8, 10, -20, 50, -36, 4.5, 2.4], [20, -18, 36, -14, 58, -19, 2.4, 1.2], [38, -32, 54, -46, 76, -44, 2, 1], [8, -10, -6, -24, -22, -25, 2.4, 1.2]],
    small: [[0, 8, 2, -24, 34, -34, 3, 1.3], [4, -16, 16, -19, 26, -14, 1.8, 1]],
    log: [[-30, -1, 0, -8, 34, -4, 4.5, 3.6], [8, -8, 16, -20, 28, -25, 2, 1], [-14, -5, -22, -15, -32, -17, 1.8, 1]], // a fallen log
  };
  function tree(shape, x, gy, s, flip) {
    const f = flip ? -1 : 1;
    return WOOD[shape].map((b) => [
      x + f * b[0] * s, gy + b[1] * s, x + f * b[2] * s, gy + b[3] * s, x + f * b[4] * s, gy + b[5] * s,
      Math.max(1.2, b[6] * s), Math.max(1, b[7] * s),
    ]);
  }

  function blank(sub, subDepth, w) {
    return {
      sub, subDepth, rockPal: 'rock', woodPal: 'wood', carpetPal: 'leaf', flow: false,
      hills: [], rocks: [], wood: [], roots: [], stems: [], vall: [], carpet: [], moss: 0, anubias: 0,
      balls: [], floaters: [], duckweed: false, corals: [], litter: [], decor: [],
      filter: (w - 12) / w, // the sponge filter sits in the right corner
    };
  }
  // born: the growth step (0..20) at which a thing first shows.
  // Floating plants, spread along the surface. kind 'weed' is drifting seaweed.
  function floaters(n, rng, first, last, kind) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ x: 0.08 + (0.76 * (i + 0.2 + rng() * 0.6)) / n, born: R(first + ((last - first) * ((i * 3) % n)) / Math.max(1, n - 1)), kind });
    }
    return out;
  }

  // Dark soil, driftwood, and plants on everything.
  function jungle(w, h, rng) {
    const k = w / 150, sub = h > 100 ? 16 : 15, gy = h - sub, L = blank('soil', sub, w);
    L.hills = [{ x: 0.22, r: 0.2, h: 5 }, { x: 0.73, r: 0.2, h: 5 }];
    if (w < 120) {
      L.wood = tree('small', 0.2 * w, gy, 1);
      L.rocks = [{ x: 0.62, rx: 14, ry: 12 }, { x: 0.36, rx: 7, ry: 5 }];
    } else if (w < 200) {
      L.wood = tree('mid', 0.32 * w, gy, 1);
      L.rocks = [{ x: 0.74, rx: 11, ry: 8 }, { x: 0.18, rx: 7, ry: 5 }];
    } else {
      const s = Math.min(1, (gy - 22) / 56);
      L.wood = tree('big', 0.22 * w, gy, s).concat(tree('big2', 0.735 * w, gy, s));
      L.rocks = [{ x: 0.5, rx: 12, ry: 9 }, { x: 0.38, rx: 6, ry: 4 }, { x: 0.86, rx: 8, ry: 6 }];
    }
    L.stems = [
      { x0: 0.03, x1: 0.2, n: R(3 + 2 * k), h: [0.42 * h, 0.72 * h], born: [0, 6], kind: 'green' },
      { x0: 0.42, x1: 0.58, n: R(1 + 2.6 * k), h: [0.34 * h, 0.6 * h], born: [1, 9], kind: 'red' },
    ];
    if (w >= 150) {
      L.stems.push({ x0: 0.78, x1: 0.9, n: R(2 + 1.6 * k), h: [0.4 * h, 0.68 * h], born: [2, 10], kind: 'green' });
      L.vall.push({ x0: 0.16, x1: 0.3, n: R(1 + 2 * k), born: [2, 10], lean: 1 });
    }
    if (w >= 200) L.vall.push({ x0: 0.62, x1: 0.72, n: R(1 + 1.6 * k), born: [4, 12], lean: -1 });
    L.carpet = [{ x: 0.36, born: 5, rate: 2.5 }, { x: 0.88, born: 9, rate: 2 }];
    L.moss = R(4 + 4 * k);
    L.anubias = R(1 + 2.6 * k);
    L.balls = [{ x: 0.45, r: 4, born: 4 }];
    L.floaters = floaters(R(2 + 2.2 * k), rng, 0, 16);
    return L;
  }

  // Smooth stones on gravel, a fallen log, and ribbon grass pulled one way by the current.
  function river(w, h, rng) {
    const k = w / 150, sub = 14, gy = h - sub, L = blank('pebble', sub, w);
    L.rockPal = 'river';
    L.woodPal = 'log';
    L.flow = true;
    L.hills = [{ x: 0.08, r: 0.25, h: 5 }, { x: 0.6, r: 0.2, h: 2 }];
    L.rocks = [
      { x: 0.27, rx: R(9 + 4 * k), ry: R(6 + 2.5 * k), round: true },
      { x: 0.72, rx: R(7 + 3 * k), ry: R(5 + 2 * k), round: true },
    ];
    const n = R(3 + 4 * k);
    for (let i = 0; i < n; i++) L.rocks.push({ x: 0.05 + (0.82 * (i + rng())) / n, rx: rng.int(3, 5), ry: rng.int(2, 3), round: true });
    L.wood = tree('log', 0.5 * w, gy, Math.min(1.25, w / 170));
    L.vall = [{ x0: 0.04, x1: 0.84, n: R(3 + 5 * k), born: [0, 11], lean: 1 }];
    L.stems = [{ x0: 0.02, x1: 0.12, n: R(2 + k), h: [0.3 * h, 0.5 * h], born: [2, 9], kind: 'green' }];
    L.moss = R(3 + 3 * k);
    L.anubias = R(1 + 1.4 * k);
    L.floaters = floaters(R(1 + k), rng, 2, 14);
    return L;
  }

  // White sand, live rock, corals, sea fans and kelp.
  function ocean(w, h, rng) {
    const k = w / 150, L = blank('white', 14, w), big = Math.min(1.25, h / 96);
    L.rockPal = 'reef';
    L.carpetPal = 'sea';
    L.hills = [{ x: 0.28, r: 0.2, h: 3 }, { x: 0.72, r: 0.22, h: 4 }];
    L.rocks = [
      { x: 0.28, rx: R(9 + 5 * k), ry: R(7 + 3 * k) },
      { x: 0.72, rx: R(8 + 4 * k), ry: R(6 + 2.5 * k) },
      { x: 0.5, rx: R(4 + 2 * k), ry: 4 },
    ];
    const nb = R(1.5 + 2.5 * k), nd = R(1 + 1.5 * k), nf = R(0.6 + 1.3 * k);
    for (let i = 0; i < nb; i++) {
      L.corals.push({ kind: 'branch', x: 0.08 + (0.74 * (i + 0.15 + rng() * 0.7)) / nb, pal: i % 4, size: R(rng.range(13, 20) * big), born: rng.int(0, 8), seed: rng.int(1, 99999) });
    }
    for (let i = 0; i < nd; i++) {
      L.corals.push({ kind: 'dome', x: 0.12 + (0.7 * (i + 0.2 + rng() * 0.6)) / nd, pal: (i + 3) % 4, size: rng.int(4, 7), born: rng.int(0, 6), seed: rng.int(1, 99999) });
    }
    for (let i = 0; i < nf; i++) {
      L.corals.push({ kind: 'fan', x: 0.1 + (0.72 * (i + 0.2 + rng() * 0.6)) / nf, pal: (i + 2) % 4, size: R(rng.range(13, 20) * big), born: rng.int(1, 9), seed: rng.int(1, 99999) });
    }
    L.vall = [
      { x0: 0.02, x1: 0.13, n: R(1 + 1.5 * k), born: [0, 8], lean: 0, kind: 'kelp' },
      { x0: 0.56, x1: 0.64, n: R(0.5 + k), born: [3, 11], lean: 0, kind: 'kelp' },
    ];
    L.carpet = [{ x: 0.5, born: 3, rate: 1.2 + k }]; // seagrass
    const nx = R(1 + 2 * k);
    for (let i = 0; i < nx; i++) L.decor.push({ kind: i % 3 === 2 ? 'star' : 'shell', x: 0.06 + 0.78 * rng() });
    L.floaters = floaters(R(1 + 1.2 * k), rng, 1, 12, 'weed');
    return L;
  }

  // Tall grey stones on sand, with a lawn that slowly covers the floor.
  function mountain(w, h, rng) {
    const k = w / 150, L = blank('sand', 13, w), rx = R(8 + 5 * k), ry = R(0.3 * h);
    L.hills = [{ x: 0.36, r: 0.2, h: 5 }, { x: 0.75, r: 0.15, h: 3 }];
    L.rocks = [
      { x: 0.36, rx, ry, peak: true },
      { x: 0.63, rx: R(rx * 0.7), ry: R(ry * 0.66), peak: true },
      { x: 0.2, rx: R(rx * 0.5), ry: R(ry * 0.4), peak: true },
    ];
    if (w >= 150) L.rocks.push({ x: 0.76, rx: R(rx * 0.4), ry: R(ry * 0.3), peak: true }, { x: 0.49, rx: R(rx * 0.34), ry: R(ry * 0.2) });
    if (w >= 250) L.rocks.push({ x: 0.08, rx: R(rx * 0.45), ry: R(ry * 0.5), peak: true }, { x: 0.88, rx: R(rx * 0.3), ry: R(ry * 0.2) });
    L.stems = [
      { x0: 0.8, x1: 0.92, n: R(2 + 3 * k), h: [0.3 * h, 0.55 * h], born: [2, 10], kind: 'green' },
      { x0: 0.02, x1: 0.1, n: R(1 + 2 * k), h: [0.24 * h, 0.42 * h], born: [4, 12], kind: 'red' },
    ];
    L.carpet = [{ x: 0.12, born: 1, rate: 2 + k }, { x: 0.52, born: 4, rate: 2.2 + k }, { x: 0.84, born: 7, rate: 2 + k }];
    L.moss = R(2 + 3 * k);
    L.balls = [{ x: 0.08, r: 4, born: 2 }];
    L.floaters = floaters(R(1 + 1.2 * k), rng, 3, 15);
    return L;
  }

  // Tea-coloured water, roots coming down from above, fallen leaves, and a roof of floating plants.
  function swamp(w, h, rng) {
    const k = w / 150, L = blank('mud', 15, w);
    L.rockPal = 'dark';
    L.woodPal = 'darkwood';
    L.hills = [{ x: 0.3, r: 0.25, h: 3 }, { x: 0.8, r: 0.2, h: 4 }];
    const xs = w < 120 ? [0.36] : w < 200 ? [0.27, 0.68] : [0.2, 0.5, 0.78];
    L.roots = xs.map((x) => ({ x, n: rng.int(4, 6), spread: R(13 + 7 * rng() + (w >= 200 ? 4 : 0)) }));
    L.rocks = [{ x: w < 120 ? 0.68 : 0.47, rx: R(6 + 2 * k), ry: R(4 + 1.5 * k) }];
    const n = R(3 + 6 * k);
    for (let i = 0; i < n; i++) L.litter.push({ x: 0.05 + (0.8 * (i + rng())) / n, rx: rng.int(4, 7), born: rng.int(0, 14) });
    L.stems = [
      { x0: 0.03, x1: 0.14, n: R(2 + k), h: [0.24 * h, 0.44 * h], born: [1, 8], kind: 'dark' },
      { x0: 0.78, x1: 0.87, n: R(1 + k), h: [0.2 * h, 0.36 * h], born: [3, 10], kind: 'dark' },
    ];
    L.moss = R(3 + 3 * k);
    L.anubias = R(1 + 2 * k);
    L.floaters = floaters(R(2 + 4 * k), rng, 0, 15);
    L.duckweed = true;
    return L;
  }

  // water: five bands, surface to floor.
  SC.THEMES = [
    { id: 'jungle', name: 'JUNGLE', water: ['#74cdb9', '#4aab9f', '#33898a', '#286a75', '#1f4f5f'], layout: jungle },
    { id: 'river', name: 'RIVER', water: ['#93ded6', '#62c1c4', '#409cae', '#2f7994', '#255c78'], layout: river },
    { id: 'ocean', name: 'OCEAN', water: ['#62b9ee', '#3c90dc', '#2b6dc2', '#2251a2', '#1b3c7e'], layout: ocean },
    { id: 'mountain', name: 'MOUNTAIN', water: ['#7bd6dc', '#52b7cb', '#3893b4', '#2b739a', '#22587e'], layout: mountain },
    { id: 'swamp', name: 'SWAMP', water: ['#c9a660', '#a5813f', '#806234', '#614a2c', '#473723'], layout: swamp },
  ];

  // One tank: a size wearing a theme. Built once and kept.
  const defs = {};
  SC.tankDef = function (sizeId, themeId) {
    const key = sizeId + '/' + themeId;
    if (defs[key]) return defs[key];
    const si = SC.SIZES.findIndex((s) => s.id === sizeId), ti = SC.THEMES.findIndex((t) => t.id === themeId);
    if (si < 0 || ti < 0) return null;
    const size = SC.SIZES[si], theme = SC.THEMES[ti], seed = 1000 * (si + 1) + 101 * (ti + 1);
    return (defs[key] = Object.assign({}, size, {
      size, theme, seed, water: theme.water, title: theme.name + ' ' + size.name,
      layout: theme.layout(size.w, size.h, SC.RNG(seed * 7 + 3)),
    }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
