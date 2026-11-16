// Runs every tank (4 sizes x 5 themes) for its full growing-in time without
// drawing anything and checks the colony. Usage: node tools/simtest.js
require('../js/rng.js');
require('../js/data.js');
require('../js/themes.js');
require('../js/scape.js');
require('../js/sim.js');
const SC = globalThis.SC;

const problems = [], hangNote = [];
const t0 = Date.now();
console.log('tank                    places to stand      colony at the end');
console.log('                        fresh -> grown in    shrimp    film  belly');
for (const size of SC.SIZES) {
  for (const theme of SC.THEMES) {
    const def = SC.tankDef(size.id, theme.id), name = def.title;
    const c = new SC.Colony(def);
    c.stock([5, 5, 0, 0, 0, 0, 0, 0]);
    const fresh = c.scape.n, freshRich = c.scape.richSum;
    const total = SC.K.STAGE_T[4] * def.pace + 900;
    let over = 0, lowBelly = 0, hung = 0;
    for (let t = 1; t <= total; t++) {
      c.step(1);
      c.events.length = 0;
      if (c.shrimp.length > c.cap()) over++;
      if (t % 60 === 0) for (const s of c.shrimp) if (s.hang && s.st !== SC.ST.SWIM) hung++;
      if (t % 600 === 0) {
        let b = 0;
        for (const s of c.shrimp) b += s.belly;
        if (b / c.shrimp.length < 0.6) lowBelly++;
      }
    }
    let belly = 0;
    for (const s of c.shrimp) belly += s.belly;
    belly /= c.shrimp.length;
    console.log(
      `${name.padEnd(22)}  ${String(fresh).padStart(5)} -> ${String(c.scape.n).padEnd(5)}        ` +
        `${String(c.shrimp.length).padStart(3)}/${String(c.cap()).padEnd(3)}   ${c.filmAvg.toFixed(2)}  ${belly.toFixed(2)}`
    );
    if (over) problems.push(`${name}: over its limit for ${over} s`);
    // Floating plants: there to hang under, and the shrimp do go there.
    let under = 0;
    for (let i = 0; i < c.scape.n; i++) under += c.scape.cellHang[i];
    if (under < 10) problems.push(`${name}: only ${under} places under floating plants`);
    if (!hung) problems.push(`${name}: no shrimp ever hung under a floating plant`);
    hangNote.push(`${name}: ${under} places under floating plants, shrimp seen hanging ${hung} times`);
    if (lowBelly) problems.push(`${name}: colony went hungry ${lowBelly} times`);
    if (c.shrimp.length < c.cap() - 2) problems.push(`${name}: stopped at ${c.shrimp.length} of ${c.cap()}`);
    // Enough solid ground to hold the starters and, later, the full colony.
    if (freshRich < 60) problems.push(`${name}: only ${Math.round(freshRich)} places to stand when fresh`);
    if (c.scape.richSum < def.capMax * 2.5) problems.push(`${name}: only ${Math.round(c.scape.richSum)} places for ${def.capMax} shrimp`);
    // A save must load back to the same colony in the same tank.
    const back = SC.Colony.load(JSON.parse(JSON.stringify(c.save())));
    if (!back || back.def !== def || back.shrimp.length !== c.shrimp.length || back.G !== c.G) problems.push(`${name}: save did not load back`);
  }
}
// Saves written before themes existed must still open.
for (const old of ['cube', 'ten', 'long', 'jungle']) {
  const c = SC.Colony.load({ tank: old, t: 500, born: 3, film: 0.4, shrimp: [[0, 0, 500, 0.8, 0, 0, 10], [0, 1, 500, 0.8, 0, 0, 10]] });
  if (!c || c.shrimp.length !== 2) problems.push(`old save "${old}" did not load`);
}
console.log('\n' + hangNote.join('\n'));
console.log(`\n${Date.now() - t0} ms`);
console.log(problems.length ? 'FAIL\n  ' + problems.join('\n  ') : 'OK');
process.exit(problems.length ? 1 : 0);
