// Seeded random numbers and a position hash. No DOM, so Node can load it too.
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});

  // mulberry32: small, fast, good enough for laying out a tank.
  SC.RNG = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    return f;
  };

  // Same answer for the same pixel every time: used for speckle and dither,
  // so the tank does not shimmer when it is redrawn.
  SC.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
})(typeof window !== 'undefined' ? window : globalThis);
