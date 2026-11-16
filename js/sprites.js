// Shrimp sprites. Each is typed out as rows of letters, facing right, then
// coloured for a variety and turned or flipped as needed.
//   B body  D shade  L highlight  T tail fan  E eye  A antenna
//   G walking legs  P swimmerets  O eggs
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});

  // kind: f adult female, m adult male, j juvenile, b shrimplet
  const BODY = {
    f: ['....LLL....', '..DBBBBBL.A', '.BDBDBBBELA', 'TBB.BBBB.A.'],
    m: ['...LL.....', '.DBBBBBL.A', 'TBDBBBBELA'],
    j: ['..LL...', 'TBBBBEA'],
    b: ['TBBE'],
  };
  // The bottom row: two frames each for walking (w), swimming (s), and the
  // same again for a female carrying eggs (e, x).
  const LEGS = {
    f: {
      w: ['TT.P.PG.G..', 'TT..PG.G.G.'], s: ['TT.PP......', 'TT..PP.....'],
      e: ['TT.OOOG.G..', 'TT.OOO.G.G.'], x: ['TT.OOOP....', 'TT.OOO.P...'],
    },
    m: { w: ['T.P.G.G.G.', 'T..PG.G.G.'], s: ['T.PP......', 'T..PP.....'] },
    j: { w: ['T.G.G..', 'T..G.G.'], s: ['T.PP...', 'T..PP..'] },
    b: { w: ['.G..', '..G.'], s: ['.G..', '..G.'] },
  };

  const flipH = (m) => m.map((r) => r.split('').reverse().join(''));
  const flipV = (m) => m.slice().reverse();
  // Quarter turn so the head points up and the legs face right.
  function turnUp(m) {
    const h = m.length, w = m[0].length, out = [];
    for (let r = 0; r < w; r++) {
      let row = '';
      for (let c = 0; c < h; c++) row += m[c][w - 1 - r];
      out.push(row);
    }
    return out;
  }

  // pose: 0 right, 1 left, 2 head up legs right, 3 head up legs left,
  //       4 head down legs right, 5 head down legs left
  const cache = {};
  SC.shrimpSprite = function (v, kind, frame, pose, egg) {
    const key = v + kind + frame + pose + (egg ? 'e' : '');
    let c = cache[key];
    if (c) return c;
    const swim = frame[0] === 's', n = +frame[1];
    const legs = LEGS[kind][kind === 'f' && egg ? (swim ? 'x' : 'e') : swim ? 's' : 'w'][n];
    let m = BODY[kind].concat([legs]);
    if (pose === 1) m = flipH(m);
    else if (pose >= 2) {
      m = turnUp(m);
      if (pose === 3 || pose === 5) m = flipH(m);
      if (pose >= 4) m = flipV(m);
    }
    const V = SC.VARIETIES[v], baby = kind === 'b';
    const ink = {
      B: baby ? V.L : V.B, D: baby ? V.B : V.D, L: V.L, T: V.L,
      E: '#15121b', A: V.L, G: V.D, P: V.D, O: '#ffe36e',
    };
    c = document.createElement('canvas');
    c.width = m[0].length;
    c.height = m.length;
    const g = c.getContext('2d');
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        const ch = m[y][x];
        if (ch === '.') continue;
        // wild-type shrimp are see-through; antennae are always fine and faint
        g.globalAlpha = ch === 'A' ? 0.7 : v === SC.WILD && ch !== 'E' && ch !== 'O' ? 0.8 : 1;
        g.fillStyle = ink[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return (cache[key] = c);
  };
})(window);
