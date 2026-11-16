// Shrimp sprites. Each is typed out as rows of letters, facing right, then
// coloured for a variety and turned or flipped as needed.
//   B body      D shade       L light        H highlight on the back
//   S belly     K segment bands               M line along the back
//   N head      Y saddle spot (shows on a female ready to breed)
//   T tail fan  E eye  W eye glint  A antenna
//   G walking legs and claws      P swimmerets      O o eggs
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});

  // kind: f adult female, m adult male, j juvenile, b shrimplet.
  // Frames: w0 w1 walking, g0 g1 grazing (a claw goes down to the food and
  // up to the mouth), s0 s1 swimming (legs tucked, swimmerets beating).
  // Every frame of one kind is the same size.
  const F_TOP = ['......HHH..A..', '....MMBBYYNL..', '..BKBKBKNNEW.A'];
  const F_SWIM = ['..............', '......HHH.....', '....MMBBYYNLAA', '.TBKBKBKNNEW..', 'TTBKBKBKNNL.AA', 'T.B.SSSBB.....'];
  const M_SWIM = ['............', '.....HH.....', '...MMBNNNLAA', 'TBKBKBNNEW..', 'TTBKBBBNL.AA'];
  const J_SWIM = ['.........', '...HH....', '.BKBNNEWA', 'TBBKBNL.A'];
  const ART = {
    f: {
      w0: ['............A.'].concat(F_TOP, ['.BBKBKBKNNL.A.', 'TTB.SSSBB.....', 'T...P.PG.G.G..']),
      w1: ['.............A', '......HHH...A.', '....MMBBYYNL..', '..BKBKBKNNEW.A', '.BBKBKBKNNL.A.', 'TTB.SSSBB.....', 'T..P.P.G.G.G..'],
      g0: ['............A.'].concat(F_TOP, ['.BBKBKBKNNL...', 'TTB.SSSBB..G..', 'T...P.PG.G.G..']),
      g1: ['............A.'].concat(F_TOP, ['.BBKBKBKNNLG..', 'TTB.SSSBB.....', 'T...P.PG.G.G..']),
      s0: F_SWIM.concat(['....PP.P......']),
      s1: F_SWIM.concat(['.....P.PP.....']),
    },
    m: {
      w0: ['..........A.', '.....HH..A..', '...MMBNNNL..', '.BKBKBNNEW.A', 'TTBKBBBNL.A.', 'T..P.PG.G.G.'],
      w1: ['...........A', '.....HH...A.', '...MMBNNNL..', '.BKBKBNNEW.A', 'TTBKBBBNL.A.', 'T.P.P.G.G.G.'],
      g0: ['..........A.', '.....HH..A..', '...MMBNNNL..', '.BKBKBNNEW.A', 'TTBKBBBNL...', 'T..P.PG.G.GG'],
      g1: ['..........A.', '.....HH..A..', '...MMBNNNL..', '.BKBKBNNEW.A', 'TTBKBBBNLG..', 'T..P.PG.G.G.'],
      s0: M_SWIM.concat(['...PP.......']),
      s1: M_SWIM.concat(['....PP......']),
    },
    j: {
      w0: ['........A', '...HH..A.', '.BKBNNEW.', 'TBBKBNL..', 'T.P.G.G..'],
      w1: ['........A', '...HH..A.', '.BKBNNEW.', 'TBBKBNL..', 'T..PG.G..'],
      g0: ['........A', '...HH..A.', '.BKBNNEW.', 'TBBKBNL..', 'T.P.G.GG.'],
      g1: ['........A', '...HH..A.', '.BKBNNEW.', 'TBBKBNLG.', 'T.P.G.G..'],
      s0: J_SWIM.concat(['..PP.....']),
      s1: J_SWIM.concat(['...PP....']),
    },
    b: {
      w0: ['....A', 'TBBE.', '.G.G.'],
      w1: ['....A', 'TBBE.', 'G.G..'],
      g0: ['....A', 'TBBE.', '.G.G.'],
      g1: ['....A', 'TBBE.', '.G.GG'],
      s0: ['.....', 'TBBEA', '.P...'],
      s1: ['.....', 'TBBEA', '..P..'],
    },
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
  // A berried female carries her eggs under the tail, where the swimmerets were.
  function withEggs(m) {
    const put = (row, s) => row.slice(0, 4) + s + row.slice(7);
    const out = m.slice();
    out[5] = put(out[5], 'OoO');
    out[6] = put(out[6], 'oOo');
    return out;
  }
  // Blend two '#rrggbb' colours.
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }

  // pose: 0 right, 1 left, 2 head up legs right, 3 head up legs left,
  //       4 head down legs right, 5 head down legs left
  const cache = {};
  SC.shrimpSprite = function (v, kind, frame, pose, egg, saddle) {
    egg = egg && kind === 'f';
    saddle = saddle && kind === 'f';
    const key = v + kind + frame + pose + (egg ? 'e' : '') + (saddle ? 's' : '');
    let c = cache[key];
    if (c) return c;
    let m = ART[kind][frame];
    if (egg) m = withEggs(m);
    if (pose === 1) m = flipH(m);
    else if (pose >= 2) {
      m = turnUp(m);
      if (pose === 3 || pose === 5) m = flipH(m);
      if (pose >= 4) m = flipV(m);
    }
    const V = SC.VARIETIES[v], baby = kind === 'b', head = V.N || V.B;
    // shrimplets are pale and nearly see-through until their colour comes in
    const ink = {
      B: baby ? V.L : V.B, D: V.D, L: V.L, H: mix(V.L, '#ffffff', 0.5), S: mix(V.D, '#000000', 0.35),
      K: V.K || V.D, M: V.M || V.L, N: head, Y: saddle ? '#f6e27a' : head, T: V.L,
      E: '#15121b', W: '#ffffff', A: V.L, G: V.D, P: V.D, O: '#ffe36e', o: '#d9b93c',
    };
    const glassy = v === SC.WILD ? 0.78 : baby ? 0.88 : 1; // wild-type shrimp are see-through
    c = document.createElement('canvas');
    c.width = m[0].length;
    c.height = m.length;
    const g = c.getContext('2d');
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        const ch = m[y][x];
        if (ch === '.') continue;
        g.globalAlpha = ch === 'A' ? 0.75 : ch === 'P' ? 0.85 : 'EWOoM'.indexOf(ch) >= 0 ? 1 : glassy;
        g.fillStyle = ink[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return (cache[key] = c);
  };
})(window);
