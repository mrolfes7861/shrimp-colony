// Screens, drawing, input and saving. The whole game is one 320x180 canvas
// scaled up by a whole number so every pixel stays square.
(function () {
  'use strict';
  const SC = window.SC, K = SC.K, V = SC.VARIETIES, SIZES = SC.SIZES, THEMES = SC.THEMES, ST = SC.ST, Sound = SC.Sound;
  // Adding ?slot=name to the address keeps a separate save, so a test run
  // never touches the real tank.
  const slot = new URLSearchParams(location.search).get('slot');
  const W = 320, H = 180, SAVE_KEY = 'shrimp-colony-v1' + (slot ? '-' + slot : '');
  const TANK_FLOOR = 148; // screen row the inside of every tank sits on
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const C = {
    ink: '#f4f0e6', dim: '#a39dc0', gold: '#ffd166', shadow: '#15121f',
    panel: '#262039', panelHi: '#3d3460', line: '#5b5186', off: '#474063',
    film1: '#8c8f3c', film2: '#b3b552',
  };

  // ---------- fit the window ----------
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(1, Math.floor(Math.min((innerWidth * dpr) / W, (innerHeight * dpr) / H)));
    canvas.style.width = (W * s) / dpr + 'px';
    canvas.style.height = (H * s) / dpr + 'px';
  }
  addEventListener('resize', fit);
  fit();

  // ---------- input ----------
  const mouse = { x: -1, y: -1, down: false, clicked: false };
  function track(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * W;
    mouse.y = ((e.clientY - r.top) / r.height) * H;
  }
  canvas.addEventListener('pointermove', track);
  // Clicks wait in a line and are handled one per frame, so two quick taps
  // can never merge into one or land on a button that was not there yet.
  const clicks = [];
  canvas.addEventListener('pointerdown', (e) => { track(e); mouse.down = true; Sound.unlock(); });
  addEventListener('pointerup', () => { if (mouse.down) clicks.push([mouse.x, mouse.y]); mouse.down = false; });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse.x = -1; });

  // ---------- drawing helpers ----------
  let hot = false; // is the pointer over something clickable this frame
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function box(x, y, w, h, c) {
    rect(x, y, w, 1, c);
    rect(x, y + h - 1, w, 1, c);
    rect(x, y, 1, h, c);
    rect(x + w - 1, y, 1, h, c);
  }
  // align: 0 left, 1 centre, 2 right
  function text(str, x, y, color, align, scale) {
    scale = scale || 1;
    str = String(str);
    const wd = SC.textWidth(str, scale);
    if (align === 1) x -= wd >> 1;
    else if (align === 2) x -= wd;
    SC.drawText(ctx, str, x + scale, y + scale, C.shadow, scale);
    SC.drawText(ctx, str, x, y, color || C.ink, scale);
    return wd;
  }
  function bar(x, y, w, h, frac, color) {
    rect(x, y, w, h, C.shadow);
    rect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, frac))), h - 2, color);
  }
  function over(x, y, w, h) { return mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h; }
  // The frame every button and card shares. Returns true when it is clicked.
  function plate(x, y, w, h, off, lit) {
    const o = !off && over(x, y, w, h);
    if (o) hot = true;
    rect(x, y, w, h, off ? '#1f1b2f' : lit || (o && !mouse.down) ? C.panelHi : C.panel);
    box(x, y, w, h, off ? C.off : o || lit ? C.gold : C.line);
    return o && mouse.clicked;
  }
  function button(x, y, w, h, label, off, sound) {
    const hit = plate(x, y, w, h, off);
    text(label, x + (w >> 1), y + ((h - 7) >> 1), off ? C.off : C.ink, 1);
    if (hit) Sound.play(sound || 'click');
    return hit;
  }
  const SPEAKER = {
    on: ['...#.....', '..##...#.', '####.#.#.', '####.#.#.', '####.#.#.', '..##...#.', '...#.....'],
    off: ['...#.....', '..##.....', '####.#.#.', '####..#..', '####.#.#.', '..##.....', '...#.....'],
  };
  const NOTE = ['...#####.', '...#...#.', '...#...#.', '...#...#.', '.###.###.', '.###.###.', '.........'];
  function icon(x, y, art, color) {
    ctx.fillStyle = color;
    for (let r = 0; r < 7; r++) for (let k = 0; k < 9; k++) if (art[r][k] === '#') ctx.fillRect(x + 3 + k, y + 2 + r, 1, 1);
  }
  // Two small switches side by side: all sound, and music on its own.
  function soundButtons(x, y) {
    if (plate(x, y, 15, 11)) Sound.toggle();
    icon(x, y, SPEAKER[Sound.isOn() ? 'on' : 'off'], Sound.isOn() ? C.ink : C.dim);
    // with all sound off the music switch has nothing to do
    const quiet = !Sound.isOn(), playing = !quiet && Sound.isMusicOn();
    if (plate(x + 17, y, 15, 11, quiet)) Sound.toggleMusic();
    icon(x + 17, y, NOTE, playing ? C.ink : quiet ? C.off : C.dim);
    if (!playing) {
      // struck through
      ctx.fillStyle = quiet ? C.off : C.dim;
      for (let k = 0; k < 9; k++) ctx.fillRect(x + 20 + k, y + 9 - k, 1, 1);
    }
  }
  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function bufCanvas(buf, w, h) {
    const c = newCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
    new Uint32Array(img.data.buffer).set(buf);
    g.putImageData(img, 0, 0);
    return c;
  }
  function span(sec) {
    const m = Math.round(sec / 60), h = Math.floor(m / 60);
    return h ? h + 'H ' + (m % 60) + 'M' : m + 'M';
  }

  // ---------- the room ----------
  function wallpaper(g) {
    g.fillStyle = '#2a2440';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#312a4b';
    for (let y = 6, r = 0; y < 122; y += 10, r++) {
      for (let x = (r & 1) * 8 + 4; x < W; x += 16) {
        g.fillRect(x, y, 1, 3);
        g.fillRect(x - 1, y + 1, 3, 1);
      }
    }
    g.fillStyle = '#211c33';
    g.fillRect(0, 126, W, H - 126);
    g.fillStyle = '#463d6b';
    g.fillRect(0, 125, W, 1);
    g.fillStyle = '#19152a';
    g.fillRect(0, 126, W, 1);
    for (let x = 20; x < W; x += 40) g.fillRect(x, 131, 1, H - 131);
  }
  const menuBg = newCanvas(W, H);
  wallpaper(menuBg.getContext('2d'));

  function drawRoom(d, tx, ty) {
    const c = newCanvas(W, H), g = c.getContext('2d');
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    wallpaper(g);
    const side = tx - 10; // free wall either side of the tank
    if (side >= 60) {
      // a framed shrimp on the left
      const px = (side >> 1) - 14, py = 52;
      P(px, py, 30, 24, '#7c5b42');
      P(px + 1, py + 1, 28, 22, '#96704f');
      P(px + 3, py + 3, 24, 18, '#1d2b45');
      P(px + 3, py + 17, 24, 4, '#2c4a5e');
      g.drawImage(SC.shrimpSprite(0, 'f', 'w0', 0, false), px + 9, py + 11);
      // a shelf with books and a plant on the right
      const sx = tx + d.w + 10 + (side >> 1) - 19, sy = 84;
      P(sx, sy, 38, 2, '#96704f');
      P(sx, sy + 2, 38, 1, '#19152a');
      P(sx + 3, sy + 3, 1, 3, '#5c4130');
      P(sx + 34, sy + 3, 1, 3, '#5c4130');
      const books = [['#b3443e', 11], ['#3565d6', 13], ['#e0b040', 10], ['#43a853', 12], ['#8a5bb5', 11]];
      books.forEach((b, i) => {
        P(sx + 3 + i * 4, sy - b[1], 3, b[1], b[0]);
        P(sx + 3 + i * 4, sy - b[1] + 2, 3, 1, '#f4f0e6');
      });
      P(sx + 27, sy - 5, 7, 5, '#c96f4a');
      P(sx + 26, sy - 6, 9, 1, '#e08a62');
      P(sx + 30, sy - 12, 1, 6, '#3e8e3e');
      P(sx + 28, sy - 11, 2, 2, '#66b649');
      P(sx + 31, sy - 13, 2, 2, '#66b649');
      P(sx + 29, sy - 15, 2, 3, '#a4de62');
    }
    // the cabinet
    const cx = tx - 9, cw = d.w + 18, cy = TANK_FLOOR + 2;
    P(cx, cy, cw, H - cy, '#5c4130');
    P(cx - 1, cy, cw + 2, 3, '#7c5b42');
    P(cx - 1, cy, cw + 2, 1, '#96704f');
    P(cx, cy + 3, cw, 1, '#402c21');
    const doors = cw > 200 ? 4 : cw > 130 ? 3 : 2;
    for (let i = 0; i < doors; i++) {
      const dx = cx + 3 + Math.round((i * (cw - 6)) / doors), dw = Math.round((cw - 6) / doors) - 2;
      P(dx, cy + 6, dw, H - cy - 6, '#674935');
      P(dx, cy + 6, dw, 1, '#7c5b42');
      P(dx, cy + 6, 1, H - cy - 6, '#402c21');
      P(dx + (i % 2 ? 2 : dw - 4), cy + 10, 2, 2, '#d9b877');
    }
    // the light
    const ly = ty - 11;
    P(tx + 6, ly, d.w - 12, 3, '#191624');
    P(tx + 6, ly, d.w - 12, 1, '#3a3552');
    P(tx + 8, ly + 3, d.w - 16, 1, '#fff3c4');
    P(tx + 9, ly + 3, 1, 8, '#191624');
    P(tx + d.w - 10, ly + 3, 1, 8, '#191624');
    // the glass
    P(tx - 2, ty - 1, 1, d.h + 2, '#c6eaf0');
    P(tx - 1, ty - 1, 1, d.h + 2, '#72b6c8');
    P(tx + d.w + 1, ty - 1, 1, d.h + 2, '#c6eaf0');
    P(tx + d.w, ty - 1, 1, d.h + 2, '#72b6c8');
    P(tx - 2, TANK_FLOOR, d.w + 4, 2, d.rim ? '#12101a' : '#8fc6d4');
    if (d.rim) P(tx - 3, ty - 3, d.w + 6, 3, '#12101a');
    else P(tx - 2, ty - 1, d.w + 4, 1, '#c6eaf0');
    return c;
  }

  function makeGlass(d) {
    const c = newCanvas(d.w, d.h), g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 0; y < d.h; y++) {
      const x0 = Math.round(d.w * 0.2 - y * 0.45);
      g.fillRect(x0, y, 7, 1);
      g.fillRect(x0 + 11, y, 2, 1);
    }
    g.fillStyle = 'rgba(8,10,28,0.2)';
    g.fillRect(0, 0, 1, d.h);
    g.fillRect(d.w - 1, 0, 1, d.h);
    return c;
  }

  // ---------- game state ----------
  let screen = 'tanks';
  let pickSize = null, pickDef = null;
  let picks = new Array(SC.WILD).fill(0);
  let colony = null;
  let tx = 0, ty = 0, room = null, glass = null, bgC = null, fgC = null, ver = -1;
  let bubbles = [], bubbleT = 0, popups = [], toast = null, confirmNew = false;
  let away = 0, awayTotal = 0, awayFrom = 0, lastStage = 0, saveT = 0;

  function enterPlay() {
    const d = colony.def;
    tx = (W - d.w) >> 1;
    ty = TANK_FLOOR - d.h;
    room = drawRoom(d, tx, ty);
    glass = makeGlass(d);
    ver = -1;
    bubbles = [];
    popups = [];
    toast = null;
    confirmNew = false;
    away = 0;
    lastStage = colony.progress().stage;
    screen = 'play';
    Sound.setTheme(d.theme.id);
  }

  function save() {
    if (!colony) return;
    try {
      // "seen" is pushed back by any time still waiting to be caught up on
      localStorage.setItem(SAVE_KEY, JSON.stringify({ seen: Date.now() - away * 1000, colony: colony.save() }));
    } catch (e) { /* storage full or blocked: the game still runs */ }
  }

  function queueAway(sec) {
    sec = Math.min(sec, K.AWAY_CAP);
    if (away <= 0) { awayTotal = 0; awayFrom = colony.shrimp.length; }
    away += sec;
    awayTotal += sec;
  }

  function boot() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      colony = SC.Colony.load(data.colony);
      if (!colony) return;
      enterPlay();
      const gone = (Date.now() - data.seen) / 1000;
      if (gone > 1) queueAway(gone);
    } catch (e) {
      colony = null;
      screen = 'tanks';
    }
  }

  // ---------- screen: pick a tank size ----------
  function drawTanks() {
    ctx.drawImage(menuBg, 0, 0);
    text('SHRIMP COLONY', 160, 7, C.gold, 1, 2);
    text('PICK A TANK', 160, 27, C.ink, 1);
    soundButtons(W - 36, 4);
    SIZES.forEach((d, i) => {
      const x = 7 + i * 78, y = 42, w = 72, h = 112;
      const hit = plate(x, y, w, h);
      // the four tanks drawn to the same scale, standing on a shelf
      rect(x + 4, y + 4, 64, 46, '#1b1730');
      rect(x + 4, y + 44, 64, 2, '#7c5b42');
      rect(x + 4, y + 46, 64, 4, '#402c21');
      const iw = Math.round(d.w / 4.6), ih = Math.round(d.h / 4.6), ix = x + 36 - (iw >> 1), iy = y + 44 - ih;
      rect(ix, iy, iw, ih, '#3893b4');
      rect(ix, iy, iw, Math.round(ih * 0.4), '#52b7cb');
      rect(ix, iy, iw, 2, '#a8e2ea');
      rect(ix, iy + ih - 4, iw, 4, '#d9c392');
      rect(ix, iy + ih - 4, iw, 1, '#efdfb4');
      box(ix - 1, iy - 1, iw + 2, ih + 2, '#c6eaf0');
      text(d.name, x + 36, y + 59, C.ink, 1);
      text(d.gal + ' GAL', x + 36, y + 72, C.dim, 1);
      text('HOLDS ' + d.capMax, x + 36, y + 83, C.dim, 1);
      text('FULL IN ' + Math.round((K.STAGE_T[4] * d.pace) / 3600) + 'H', x + 36, y + 94, C.dim, 1);
      if (hit) {
        pickSize = d;
        screen = 'themes';
        Sound.play('click');
      }
    });
  }

  // ---------- screen: pick a theme ----------
  // A picture of each theme at this tank's size, part grown in. Made on first look.
  const previews = {};
  function preview(def) {
    const key = def.size.id + def.theme.id;
    if (!previews[key]) {
      const s = SC.buildScape(def, 15), c = bufCanvas(s.bg, def.w, def.h);
      c.getContext('2d').drawImage(bufCanvas(s.fg, def.w, def.h), 0, 0);
      previews[key] = c;
    }
    return previews[key];
  }
  function drawThemes() {
    ctx.drawImage(menuBg, 0, 0);
    text('PICK A THEME', 160, 7, C.gold, 1, 2);
    text(pickSize.name, 160, 27, C.dim, 1);
    soundButtons(W - 36, 4);
    THEMES.forEach((t, i) => {
      const def = SC.tankDef(pickSize.id, t.id), x = 4 + i * 63, y = 40, w = 60, h = 104;
      const hit = plate(x, y, w, h);
      ctx.drawImage(preview(def), Math.round((def.w - 54) * 0.38), def.h - 80, 54, 80, x + 3, y + 3, 54, 80);
      box(x + 2, y + 2, 56, 82, C.shadow);
      text(t.name, x + 30, y + 90, C.ink, 1);
      if (hit) {
        pickDef = def;
        screen = 'picks';
        Sound.play('click');
      }
    });
    if (button(7, 158, 46, 15, 'BACK')) screen = 'tanks';
  }

  // ---------- screen: pick the shrimp ----------
  function drawPicks(time) {
    ctx.drawImage(menuBg, 0, 0);
    text('PICK YOUR SHRIMP', 160, 7, C.gold, 1, 2);
    soundButtons(W - 36, 4);
    let total = 0;
    for (const n of picks) total += n;
    for (let i = 0; i < SC.WILD; i++) {
      const x = 7 + (i % 4) * 78, y = 28 + (i >> 2) * 62, w = 72, h = 58;
      rect(x, y, w, h, picks[i] ? C.panelHi : C.panel);
      box(x, y, w, h, picks[i] ? C.gold : C.line);
      const spr = SC.shrimpSprite(i, 'f', 'w' + (picks[i] ? Math.floor(time * 6) & 1 : 0), 0, false);
      rect(x + 16, y + 5, 40, 14, '#2f7eab');
      ctx.drawImage(spr, x + 36 - spr.width, y + 7, spr.width * 2, spr.height * 2);
      text(V[i].name, x + 36, y + 24, C.ink, 1);
      if (button(x + 7, y + 37, 15, 15, '-', !picks[i], 'minus')) picks[i]--;
      text(picks[i], x + 36, y + 41, picks[i] ? C.gold : C.dim, 1);
      if (button(x + 50, y + 37, 15, 15, '+', total >= K.MAX_START, 'plus')) picks[i]++;
    }
    text(total + ' / ' + K.MAX_START, 160, 162, total >= 2 ? C.ink : C.dim, 1);
    if (button(7, 158, 46, 15, 'BACK')) screen = 'themes';
    if (button(267, 158, 46, 15, 'START', total < 2, 'start')) {
      colony = new SC.Colony(pickDef);
      colony.stock(picks);
      enterPlay();
      save();
    }
  }

  // ---------- screen: the tank ----------
  function drawShrimp(s, time) {
    const sc = colony.scape;
    const kind = s.age < K.BABY_T ? 'b' : s.age < K.JUV_T ? 'j' : s.sex === 0 ? 'f' : 'm';
    const swim = s.st === ST.SWIM;
    const beat = Math.floor(time * (swim ? 10 : s.st === ST.WALK ? 8 : 3) + s.ph) & 1;
    const frame = swim ? 's' + beat : s.st === ST.IDLE ? 'w0' : 'w' + beat;
    const egg = kind === 'f' && s.berried > 0;
    const cell = Math.round(s.c);
    if (!swim && sc.cellVert[cell]) {
      // clinging to a stem, root, coral or rock face: head up or down, legs
      // toward it. On a rock face the body has to be on the open-water side.
      const left = sc.cellSide[cell] ? sc.cellSide[cell] > 0 : s.ph > 5;
      const spr = SC.shrimpSprite(s.v, kind, frame, (s.dir > 0 ? 2 : 4) + (left ? 1 : 0), egg);
      ctx.drawImage(spr, tx + s.x - (left ? 0 : spr.width - 1), ty + Math.round(s.y) - (spr.height >> 1));
      return;
    }
    const spr = SC.shrimpSprite(s.v, kind, frame, s.dir > 0 ? 0 : 1, egg);
    let x = tx + Math.round(s.x) - (spr.width >> 1);
    // a grazing shrimp bobs forward as it picks
    if (s.st === ST.GRAZE && Math.floor(time * 4 + s.ph) & 1) x += s.dir;
    ctx.drawImage(spr, x, ty + Math.round(s.y) - spr.height);
  }

  function drawFilm() {
    const sc = colony.scape, film = colony.film, n = sc.n;
    const X = sc.cellX, Y = sc.cellY, Gi = sc.cellGi, Hh = sc.cellHash, Vt = sc.cellVert;
    ctx.fillStyle = C.film1;
    for (let i = 0; i < n; i++) {
      if (film[Gi[i]] > 0.16 + Hh[i] * 0.25) ctx.fillRect(tx + X[i], ty + Y[i], 1, 1);
    }
    ctx.fillStyle = C.film2;
    for (let i = 0; i < n; i++) {
      const f = film[Gi[i]], hv = Hh[i];
      if (f <= 0.5 + hv * 0.35) continue;
      if (Vt[i]) ctx.fillRect(tx + X[i] + (hv < 0.5 ? -1 : 1), ty + Y[i], 1, 1);
      else {
        ctx.fillRect(tx + X[i], ty + Y[i] - 1, 1, 1);
        if (f > 0.85 && hv < 0.45) ctx.fillRect(tx + X[i], ty + Y[i] - 2, 1, 1);
      }
    }
  }

  function drawPlay(time, dt) {
    const d = colony.def, sc = colony.scape;
    if (ver !== colony.version) {
      ver = colony.version;
      bgC = bufCanvas(sc.bg, d.w, d.h);
      fgC = bufCanvas(sc.fg, d.w, d.h);
    }
    ctx.drawImage(room, 0, 0);
    ctx.drawImage(bgC, tx, ty);
    drawFilm();

    // a river has a current: specks carried across the tank
    if (d.layout.flow) {
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      for (let i = 0; i < 16; i++) {
        const x = Math.floor((time * (12 + ((i * 7) % 11)) + i * 53) % (d.w + 8)) - 4;
        const y = sc.waterTop + 8 + ((i * 37) % (d.h - 34)) + Math.round(Math.sin(time * 1.3 + i) * 1.5);
        if (x >= 0 && x < d.w - 1 && !sc.solid[y * d.w + x]) ctx.fillRect(tx + x, ty + y, 2, 1);
      }
    }

    // bubbles from the sponge filter
    bubbleT -= dt;
    if (bubbleT <= 0) {
      bubbleT = 0.07 + Math.random() * 0.14;
      bubbles.push({ x: sc.bubble.x + Math.random() * 2 - 1, y: sc.bubble.y, v: 24 + Math.random() * 16, ph: Math.random() * 6, big: Math.random() < 0.3 });
    }
    ctx.fillStyle = '#e4f8f8';
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.v * dt;
      b.x += Math.sin(time * 7 + b.ph) * dt * 5;
      if (b.y <= sc.waterTop + 1) {
        bubbles.splice(i, 1);
        Sound.bubble();
        continue;
      }
      ctx.fillRect(tx + Math.round(b.x), ty + Math.round(b.y), 1, b.big ? 2 : 1);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(tx, ty, d.w, d.h);
    ctx.clip();
    const list = colony.shrimp;
    for (let i = 0; i < list.length; i++) drawShrimp(list[i], time);
    ctx.restore();

    // light catching the water surface
    ctx.fillStyle = '#e4f8f8';
    const drift = Math.floor(time * 5) * 3;
    for (let x = 0; x < d.w; x++) {
      if ((x * 7 + drift) % 23 < 6 && !sc.solid[sc.waterTop * d.w + x]) ctx.fillRect(tx + x, ty + sc.waterTop, 1, 1);
    }
    ctx.drawImage(fgC, tx, ty);
    ctx.drawImage(glass, tx, ty);

    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.t -= dt;
      p.y -= dt * 9;
      if (p.t <= 0) { popups.splice(i, 1); continue; }
      text(p.str, tx + Math.round(p.x), ty + Math.round(p.y), p.color, 1);
    }

    // ---- readouts ----
    const pr = colony.progress();
    text(d.title, 4, 3, C.ink);
    const sw = text(K.STAGES[pr.stage], 4, 13, C.gold);
    if (pr.stage < 4) bar(4 + sw + 4, 14, 34, 5, pr.frac, C.gold);
    text('SHRIMP ' + list.length + '/' + colony.cap(), W - 4, 3, C.ink, 2);
    bar(W - 38, 14, 34, 5, colony.filmAvg, C.film2);
    text('BIOFILM', W - 42, 13, C.dim, 2);
    soundButtons(144, 2);

    rect(0, 167, W, 13, C.shadow);
    rect(0, 167, W, 1, C.panelHi);
    const counts = new Array(V.length).fill(0);
    for (let i = 0; i < list.length; i++) counts[list[i].v]++;
    let x = 4;
    for (let v = 0; v < V.length; v++) {
      if (!counts[v]) continue;
      const str = String(counts[v]);
      rect(x, 170, 11, 7, '#2f7eab'); // a chip of water, so dark shrimp show up too
      ctx.drawImage(SC.shrimpSprite(v, 'j', 'w0', 0, false), x + 2, 172);
      SC.drawText(ctx, str, x + 14, 170, C.ink);
      x += 14 + SC.textWidth(str) + 7;
    }
    if (confirmNew) {
      text('START OVER?', W - 62, 170, C.gold, 2);
      if (button(W - 58, 168, 27, 11, 'YES')) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
        colony = null;
        picks.fill(0);
        screen = 'tanks';
        Sound.setTheme(null);
        return;
      }
      if (button(W - 29, 168, 27, 11, 'NO')) confirmNew = false;
    } else if (button(W - 56, 168, 54, 11, 'NEW TANK')) confirmNew = true;

    if (away > 30) {
      rect(110, 80, 100, 22, C.shadow);
      box(110, 80, 100, 22, C.line);
      text('CATCHING UP', 160, 84, C.ink, 1);
      bar(118, 94, 84, 5, 1 - away / awayTotal, C.gold);
    } else if (toast) {
      toast.t -= dt;
      const wd = SC.textWidth(toast.str) + 12;
      rect(160 - (wd >> 1), 24, wd, 13, C.shadow);
      box(160 - (wd >> 1), 24, wd, 13, C.gold);
      text(toast.str, 160, 27, C.gold, 1);
      if (toast.t <= 0) toast = null;
    }
  }

  // ---------- main loop ----------
  let lastWall = Date.now();
  function frame() {
    requestAnimationFrame(frame);
    const wall = Date.now();
    let dt = (wall - lastWall) / 1000;
    lastWall = wall;
    if (dt < 0) dt = 0;
    const time = performance.now() / 1000;
    hot = false;
    if (clicks.length) {
      const c = clicks.shift();
      mouse.x = c[0];
      mouse.y = c[1];
      mouse.clicked = true;
    }

    if (screen === 'play') {
      // A long gap (tab hidden, laptop asleep) is time away, like closing the game.
      if (dt > 0.25) { queueAway(dt); dt = 0; }
      if (away > 0) {
        const t0 = performance.now(), big = awayTotal > 900 ? 2 : 1;
        while (away > 0 && performance.now() - t0 < 20) {
          const st = Math.min(big, away);
          colony.step(st);
          away -= st;
        }
        colony.events.length = 0;
        if (away <= 0) {
          away = 0;
          const gain = colony.shrimp.length - awayFrom;
          if (awayTotal >= 60) {
            toast = { str: 'AWAY ' + span(awayTotal) + (gain > 0 ? '  +' + gain + ' SHRIMP' : ''), t: 8 };
            Sound.play('away');
          }
          lastStage = colony.progress().stage;
          save();
        }
      } else {
        colony.step(dt);
        for (const e of colony.events) {
          if (e.type === 'born') {
            popups.push({ x: e.x, y: e.y - 12, str: '+' + e.n, color: C.gold, t: 1.8 });
            Sound.play('hatch', e.n);
          } else {
            popups.push({ x: e.x, y: e.y - 14, str: '~', color: '#ff7d9c', t: 1.4 });
            Sound.play('heart');
          }
        }
        colony.events.length = 0;
        const stage = colony.progress().stage;
        if (stage !== lastStage) {
          lastStage = stage;
          toast = { str: 'NOW ' + K.STAGES[stage], t: 6 };
          Sound.play('stage');
        }
        Sound.tick(dt);
      }
      saveT += dt;
      if (saveT > 5) { saveT = 0; save(); }
      drawPlay(time, dt);
    } else if (screen === 'tanks') drawTanks();
    else if (screen === 'themes') drawThemes();
    else drawPicks(time);

    canvas.style.cursor = hot ? 'pointer' : 'default';
    mouse.clicked = false;
  }

  addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('pagehide', save);

  // For testing from the browser console: SCDEBUG.skip(3600) jumps an hour ahead.
  window.SCDEBUG = { skip: (sec) => colony && queueAway(sec), colony: () => colony };

  boot();
  requestAnimationFrame(frame);
})();
