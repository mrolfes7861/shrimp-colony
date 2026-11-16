// All sound is made here from oscillators and filtered noise: there are no
// audio files. Browsers only allow sound after a click, so nothing plays
// until the player first presses something.
(function () {
  'use strict';
  const SC = window.SC;
  const KEY = 'shrimp-colony-sound', VOLUME = 0.8;
  const rnd = Math.random;
  let on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* storage blocked: sound stays on */ }
  let ctx = null, master = null, amb = null, theme = null, lastBubble = 0;

  // Two seconds of hiss, made once per audio context and looped.
  const hiss = new WeakMap();
  function noise(c) {
    let b = hiss.get(c);
    if (!b) {
      b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
      hiss.set(c, b);
    }
    return b;
  }

  // One note: f0 gliding to f1 (if given), with a quick attack and a fade.
  function tone(c, out, t, o) {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + o.dur + 0.03);
  }
  const notes = (c, out, t, list, gap, o) => list.forEach((f, i) => tone(c, out, t + i * gap, Object.assign({ f0: f }, o)));

  // Each takes (audio context, where to send it, start time, optional number).
  const VOICE = {
    click: (c, out, t) => tone(c, out, t, { type: 'triangle', f0: 880, f1: 660, dur: 0.06, gain: 0.2 }),
    plus: (c, out, t) => tone(c, out, t, { type: 'triangle', f0: 660, f1: 990, dur: 0.08, gain: 0.2 }),
    minus: (c, out, t) => tone(c, out, t, { type: 'triangle', f0: 660, f1: 440, dur: 0.08, gain: 0.2 }),
    start: (c, out, t) => notes(c, out, t, [523.25, 659.25, 783.99, 1046.5], 0.09, { type: 'triangle', dur: 0.32, gain: 0.2 }),
    // a female starts carrying eggs
    heart: (c, out, t) => notes(c, out, t, [659.25, 987.77], 0.13, { dur: 0.55, gain: 0.16 }),
    // eggs hatch: one pop per baby, then a small ping
    hatch: (c, out, t, n) => {
      n = Math.min(n || 3, 6);
      for (let i = 0; i < n; i++) tone(c, out, t + i * 0.07, { f0: 520 + i * 40, f1: 1300 + i * 60, dur: 0.07, gain: 0.15 });
      tone(c, out, t + n * 0.07 + 0.03, { type: 'triangle', f0: 1568, dur: 0.4, gain: 0.12 });
    },
    // the tank reaches its next stage
    stage: (c, out, t) => {
      notes(c, out, t, [783.99, 1046.5, 1318.5, 1568], 0.14, { dur: 1.2, gain: 0.15 });
      notes(c, out, t, [1568, 2093, 2637, 3136], 0.14, { dur: 0.6, gain: 0.03 });
    },
    // back after time away
    away: (c, out, t) => notes(c, out, t, [659.25, 783.99, 1046.5], 0.16, { dur: 0.9, gain: 0.13 }),
    bubble: (c, out, t) => {
      const f = 500 + rnd() * 500;
      tone(c, out, t, { f0: f, f1: f * 1.7, dur: 0.05, gain: 0.035 });
    },
    // a small bird: a few quick sliding notes
    chirp: (c, out, t) => {
      const n = 2 + Math.floor(rnd() * 3), f = 2400 + rnd() * 1200, up = rnd() < 0.6;
      for (let i = 0; i < n; i++) tone(c, out, t + i * 0.1, { f0: f, f1: f * (up ? 1.3 : 0.8), dur: 0.08, gain: 0.04 });
    },
    cricket: (c, out, t) => {
      for (let i = 0; i < 10; i++) tone(c, out, t + i * 0.034, { f0: 4300, dur: 0.022, gain: 0.018, attack: 0.003 });
    },
    // a frog: two short buzzing croaks
    frog: (c, out, t) => {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      lp.connect(out);
      [[0, 170, 5], [0.24, 210, 7]].forEach((k) => {
        for (let i = 0; i < k[2]; i++) tone(c, lp, t + k[0] + i * 0.03, { type: 'sawtooth', f0: k[1], f1: k[1] * 0.85, dur: 0.035, gain: 0.09, attack: 0.004 });
      });
    },
  };

  // The steady background: pump hum in every tank, plus the theme's own layer.
  function ambience(c, out, id) {
    const running = [];
    const layer = (type, freq, q, gain, lfoHz, lfoDepth) => {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = noise(c);
      src.loop = true;
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(out);
      if (lfoHz) {
        // a slow swell in loudness
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = lfoHz;
        depth.gain.value = lfoDepth;
        lfo.connect(depth);
        depth.connect(g.gain);
        lfo.start();
        running.push(lfo);
      }
      src.start();
      running.push(src);
    };
    layer('lowpass', 380, 0.5, 0.2); // pump and water hum
    if (id === 'river') {
      layer('bandpass', 1300, 0.7, 0.11, 0.6, 0.04); // running water
      layer('highpass', 3500, 0.5, 0.018);
    } else if (id === 'ocean') layer('lowpass', 520, 0.4, 0.16, 0.11, 0.13); // slow surf
    else if (id === 'mountain') layer('bandpass', 620, 1.1, 0.16, 0.08, 0.12); // wind
    else if (id === 'jungle') layer('bandpass', 5200, 3, 0.03, 0.2, 0.018); // insects, far off
    else if (id === 'swamp') layer('bandpass', 3000, 2, 0.03, 0.13, 0.018);
    return { stop() { running.forEach((n) => { try { n.stop(); } catch (e) { /* already stopped */ } }); } };
  }

  // How often each theme's creatures call: [voice, seconds between, on average].
  const CALLS = { jungle: [['chirp', 9], ['cricket', 15]], swamp: [['frog', 13], ['cricket', 8]] };

  // ---------- music ----------
  // Never the same twice: a slow loop of four chords held by soft pads, a
  // bass note under each, and a melody picked note by note from a five-note
  // scale that cannot clash with the chords. Each theme has its own key,
  // speed and instrument.
  const MAJOR = [0, 2, 4, 7, 9], MINOR = [0, 3, 5, 7, 10];
  // root: the key note as a MIDI number (48 is the C below middle C).
  // chords: semitones above the root. busy: how often the melody plays.
  const SONGS = {
    menu: { bpm: 72, root: 48, scale: MAJOR, chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], voice: 'pluck', busy: 0.4 },
    jungle: { bpm: 80, root: 53, scale: MAJOR, chords: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]], voice: 'marimba', busy: 0.5 },
    river: { bpm: 84, root: 55, scale: MAJOR, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], voice: 'pluck', busy: 0.34, harp: true },
    ocean: { bpm: 60, root: 50, scale: MAJOR, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [9, 12, 16, 19], [5, 9, 12, 16]], voice: 'bell', busy: 0.26 },
    mountain: { bpm: 66, root: 57, scale: MINOR, chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], voice: 'flute', busy: 0.3 },
    swamp: { bpm: 68, root: 52, scale: MINOR, chords: [[0, 3, 7], [5, 9, 12], [3, 7, 10], [10, 14, 17]], voice: 'kalimba', busy: 0.34 },
  };
  const MUSIC_VOLUME = 0.9;
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  // The melody instruments: (context, output, time, pitch, loudness, length).
  const INSTRUMENT = {
    pluck: (c, out, t, f, g) => {
      tone(c, out, t, { type: 'triangle', f0: f, dur: 1.0, gain: g });
      tone(c, out, t, { f0: f * 2, dur: 0.4, gain: g * 0.22 });
    },
    marimba: (c, out, t, f, g) => {
      tone(c, out, t, { f0: f, dur: 0.5, gain: g * 1.15 });
      tone(c, out, t, { f0: f * 4, dur: 0.09, gain: g * 0.2, attack: 0.002 });
    },
    kalimba: (c, out, t, f, g) => {
      tone(c, out, t, { type: 'triangle', f0: f, dur: 0.75, gain: g });
      tone(c, out, t, { f0: f * 3, dur: 0.14, gain: g * 0.14, attack: 0.002 });
    },
    bell: (c, out, t, f, g) => {
      tone(c, out, t, { f0: f, dur: 2.4, gain: g });
      tone(c, out, t, { f0: f * 2, dur: 1.2, gain: g * 0.28 });
      tone(c, out, t, { f0: f * 3.01, dur: 0.6, gain: g * 0.07 });
    },
    // a held, breathy note with a slow waver
    flute: (c, out, t, f, g, len) => {
      const o = c.createOscillator(), o2 = c.createOscillator(), a = c.createGain(), a2 = c.createGain();
      const waver = c.createOscillator(), depth = c.createGain();
      o.frequency.value = f;
      o2.frequency.value = f * 2;
      a2.gain.value = 0.14;
      waver.frequency.value = 4.8;
      depth.gain.value = 7; // cents
      waver.connect(depth);
      depth.connect(o.detune);
      depth.connect(o2.detune);
      a.gain.setValueAtTime(0.0001, t);
      g *= 0.8; // a held note carries further than a plucked one
      a.gain.linearRampToValueAtTime(g, t + 0.09);
      a.gain.setValueAtTime(g, t + len);
      a.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.6);
      o.connect(a);
      o2.connect(a2);
      a2.connect(a);
      a.connect(out);
      for (const n of [o, o2, waver]) { n.start(t); n.stop(t + len + 0.65); }
    },
  };

  // Where one song's notes go: pads straight through, melody also through a soft echo.
  function musicBus(c, dest, bpm) {
    const out = c.createGain(), pads = c.createGain(), notes = c.createGain();
    const delay = c.createDelay(1.5), dull = c.createBiquadFilter(), wet = c.createGain(), again = c.createGain();
    out.gain.value = MUSIC_VOLUME;
    out.connect(dest);
    pads.connect(out);
    notes.connect(out);
    delay.delayTime.value = 45 / bpm; // three quarters of a beat
    dull.type = 'lowpass';
    dull.frequency.value = 1800;
    wet.gain.value = 0.3;
    again.gain.value = 0.3;
    notes.connect(delay);
    delay.connect(dull);
    dull.connect(wet);
    wet.connect(out);
    dull.connect(again);
    again.connect(delay);
    return { out, pads, notes };
  }

  function newSong(key, startAt) {
    const s = SONGS[key], pool = [];
    // every scale note from just below middle C to two octaves above it
    for (let m = 59; m <= 84; m++) if (s.scale.includes((((m - s.root) % 12) + 12) % 12)) pool.push(m);
    return { key, s, pool, t: startAt, step: 0, last: null, run: 0, count: 0 };
  }

  // Schedule everything the song plays up to the given time. A step is half
  // a beat; a chord lasts sixteen steps.
  function advance(c, bus, st, until) {
    const s = st.s, step = 30 / s.bpm;
    while (st.t < until) {
      const i = st.step % 16, t = st.t;
      const chord = s.chords[Math.floor(st.step / 16) % s.chords.length];
      const inChord = chord.map((n) => (s.root + n) % 12);
      if (i === 0) {
        // pads: the chord folded close around the key note, fading in and out
        const base = s.root <= 52 ? s.root + 12 : s.root, len = step * 16;
        for (const n of chord) {
          for (const cents of [-5, 5]) {
            const o = c.createOscillator(), g = c.createGain();
            o.frequency.value = hz(base + ((n + 5) % 12) - 5);
            o.detune.value = cents;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.02, t + 1.6);
            g.gain.setValueAtTime(0.02, t + len);
            g.gain.linearRampToValueAtTime(0.0001, t + len + 2.4);
            o.connect(g);
            g.connect(bus.pads);
            o.start(t);
            o.stop(t + len + 2.5);
          }
        }
        const low = hz(36 + inChord[0]);
        tone(c, bus.pads, t, { type: 'triangle', f0: low, dur: step * 14, gain: 0.07, attack: 0.04 });
        tone(c, bus.pads, t, { f0: low * 2, dur: step * 10, gain: 0.03, attack: 0.04 });
      }
      if (s.harp) {
        // a steady rise and fall through the chord, underneath the melody
        const up = inChord.map((p) => 48 + p).sort((a, b) => a - b);
        INSTRUMENT.pluck(c, bus.notes, t, hz(up[[0, 1, 2, 1][i % 4] % up.length]), 0.028);
      }
      // melody: more likely on the beat, thinner every fourth bar, and never
      // more than five notes without a breath
      const strong = i % 4 === 0, thin = Math.floor(st.step / 8) % 4 === 3;
      const chance = st.run >= 5 ? 0 : s.busy * (strong ? 1.5 : i % 2 === 0 ? 1 : 0.55) * (thin ? 0.45 : 1);
      if (rnd() < chance) {
        // favour notes of the chord, small steps from the last note, and the middle of the range
        const w = [];
        let total = 0;
        for (const m of st.pool) {
          const fits = inChord.includes(m % 12);
          let wt = (fits ? 3 : strong ? 0.3 : 1) * Math.exp(-Math.pow((m - 71) / 9, 2));
          // a note one semitone above a chord note grates against it: all but rule it out
          if (!fits && inChord.some((p) => (((m - p) % 12) + 12) % 12 === 1)) wt *= 0.05;
          if (st.last != null) wt *= Math.exp(-Math.abs(m - st.last) / 3.5) * (m === st.last ? 0.25 : 1);
          w.push(wt);
          total += wt;
        }
        let r = rnd() * total, k = 0;
        while (k < w.length - 1 && (r -= w[k]) > 0) k++;
        st.last = st.pool[k];
        const loud = 0.085 * (strong ? 1 : 0.8) * (0.9 + rnd() * 0.2);
        INSTRUMENT[s.voice](c, bus.notes, Math.max(0, t + (rnd() - 0.5) * 0.012), hz(st.last), loud, step * (1.5 + rnd() * 1.5));
        st.run++;
        st.count++;
      } else st.run = 0;
      st.step++;
      st.t += step;
    }
  }

  const MUSIC_KEY = 'shrimp-colony-music';
  let musicOn = true, songKey = 'menu', song = null, bus = null, pumping = null;
  try { musicOn = localStorage.getItem(MUSIC_KEY) !== '0'; } catch (e) { /* storage blocked: music stays on */ }

  function fadeOut() {
    if (bus) {
      const old = bus;
      old.out.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      setTimeout(() => old.out.disconnect(), 4000);
    }
    bus = null;
    song = null;
  }
  // Start the song for the screen that is showing, fading out whatever was playing.
  function startMusic() {
    if (!ctx || !on || !musicOn) return;
    fadeOut();
    bus = musicBus(ctx, master, SONGS[songKey].bpm);
    song = newSong(songKey, ctx.currentTime + 0.3);
    // Notes are queued a little ahead of time, a few times a second.
    if (!pumping) {
      pumping = setInterval(() => {
        if (!song || ctx.state !== 'running') return;
        if (song.t < ctx.currentTime) song.t = ctx.currentTime + 0.05; // fell behind: skip ahead, do not bunch up
        advance(ctx, bus, song, ctx.currentTime + 0.4);
      }, 120);
    }
  }

  function wake() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(ctx.destination);
    }
    if (on && !document.hidden) {
      if (ctx.state !== 'running') ctx.resume();
      if (theme && !amb) amb = ambience(ctx, master, theme);
      if (musicOn && !song) startMusic();
    }
  }
  function hush() {
    if (amb) amb.stop();
    amb = null;
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  SC.Sound = {
    isOn: () => on,
    // 'running' once the browser is really playing; 'none' before the first click
    state: () => (ctx ? ctx.state : 'none'),
    // call from a real click or tap: this is what lets the browser play sound
    unlock: wake,
    toggle() {
      on = !on;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* not saved, still works */ }
      if (on) { wake(); this.play('click'); } else hush();
    },
    play(name, n) {
      if (!on || !ctx || ctx.state !== 'running') return;
      VOICE[name](ctx, master, ctx.currentTime + 0.01, n);
    },
    // Music has its own switch; it also stops whenever all sound is off.
    isMusicOn: () => musicOn,
    toggleMusic() {
      musicOn = !musicOn;
      try { localStorage.setItem(MUSIC_KEY, musicOn ? '1' : '0'); } catch (e) { /* not saved, still works */ }
      if (musicOn) { wake(); this.play('click'); } else if (ctx) fadeOut();
    },
    // what is playing, for testing
    musicState: () => ({ on: musicOn, song: song ? song.key : null, steps: song ? song.step : 0, notes: song ? song.count : 0 }),
    // which tank is on screen (null on the menus)
    setTheme(id) {
      theme = id;
      songKey = id || 'menu';
      if (amb) amb.stop();
      amb = null;
      if (song && song.key !== songKey) startMusic();
      if (ctx) wake();
    },
    // a bubble reached the surface; most are silent or it would be a rattle
    bubble() {
      if (!ctx || ctx.currentTime - lastBubble < 0.22 || rnd() < 0.55) return;
      lastBubble = ctx.currentTime;
      this.play('bubble');
    },
    // once a frame while a tank is showing
    tick(dt) {
      const calls = CALLS[theme];
      if (!calls || !on) return;
      for (const k of calls) if (rnd() < dt / k[1]) this.play(k[0]);
    },
    // For testing without ears: renders every sound silently and reports how
    // loud each one is (peak and average, where 1 is as loud as it goes).
    async selfTest() {
      const sr = 44100, out = [];
      const measure = async (name, secs, build) => {
        const oc = new OfflineAudioContext(1, sr * secs, sr);
        build(oc);
        const d = (await oc.startRendering()).getChannelData(0);
        let peak = 0, sum = 0;
        for (let i = 0; i < d.length; i++) {
          const a = Math.abs(d[i]);
          if (a > peak) peak = a;
          sum += a * a;
        }
        out.push({ name, peak: +peak.toFixed(3), avg: +Math.sqrt(sum / d.length).toFixed(4) });
        return out[out.length - 1];
      };
      for (const name in VOICE) await measure(name, 2, (oc) => VOICE[name](oc, oc.destination, 0.05, 4));
      for (const id of [null, 'jungle', 'river', 'ocean', 'mountain', 'swamp']) await measure('ambience ' + (id || 'plain'), 10, (oc) => ambience(oc, oc.destination, id));
      // a minute of each song, with how many melody notes it played
      for (const key in SONGS) {
        let st = null;
        const row = await measure('music ' + key, 60, (oc) => {
          st = newSong(key, 0.1);
          advance(oc, musicBus(oc, oc.destination, SONGS[key].bpm), st, 58);
        });
        row.notes = st.count;
        row.low = hz(Math.min.apply(null, st.pool)).toFixed(0) + ' Hz';
        row.high = hz(Math.max.apply(null, st.pool)).toFixed(0) + ' Hz';
      }
      return out;
    },
  };

  addEventListener('visibilitychange', () => {
    if (document.hidden) hush();
    else if (ctx) wake();
  });
})();
