// Shrimp colours, the four tank sizes, and the numbers the colony runs on.
// What a tank looks like is its theme: see themes.js.
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});

  // B body, D shade, L highlight. The last one, WILD, cannot be picked:
  // it turns up when two colours breed together.
  SC.VARIETIES = [
    { id: 'cherry', name: 'CHERRY', B: '#d83a40', D: '#8f1f30', L: '#ff7d68' },
    { id: 'sunkist', name: 'SUNKIST', B: '#f08a2a', D: '#b3541c', L: '#ffc063' },
    { id: 'yellow', name: 'YELLOW', B: '#f0d23c', D: '#b08c1e', L: '#fff29c' },
    { id: 'jade', name: 'JADE', B: '#43a853', D: '#1f6b3c', L: '#93dc6c' },
    { id: 'blue', name: 'BLUE DREAM', B: '#3565d6', D: '#1c3690', L: '#77adff' },
    { id: 'snow', name: 'SNOWBALL', B: '#e8edf2', D: '#a5b4c4', L: '#ffffff' },
    { id: 'black', name: 'BLACK ROSE', B: '#33313d', D: '#17161d', L: '#676478' },
    { id: 'choc', name: 'CHOCOLATE', B: '#74432e', D: '#45251b', L: '#a56c49' },
    { id: 'wild', name: 'WILD', B: '#a39a74', D: '#6f6749', L: '#d0c8a0' },
  ];
  SC.WILD = 8;

  // All times are real seconds at normal speed.
  SC.K = {
    BABY_T: 150, // a shrimplet until this age
    JUV_T: 420, // a juvenile until this age, then an adult
    GEST: 150, // how long a berried female carries her eggs
    DRAIN: 1 / 240, // belly an adult burns per second
    FOOD: 0.25, // belly gained per unit of biofilm eaten
    EAT: 0.04, // biofilm an adult eats per second while grazing
    // A tank's age is cut into five stages; each stage has five growth steps.
    STAGE_T: [0, 240, 1200, 4500, 14400],
    STAGES: ['FRESH', 'SETTLING', 'ESTABLISHED', 'MATURE', 'THRIVING'],
    MAX_START: 10,
    AWAY_CAP: 12 * 3600, // time away that still counts
  };

  // w, h: inside of the glass, in pixels. capStart..capMax: how many shrimp
  // the tank holds, fresh to fully grown in. pace stretches the stage times.
  SC.SIZES = [
    { id: 'cube', name: 'NANO CUBE', gal: 5, w: 100, h: 92, capStart: 12, capMax: 30, pace: 0.5, rim: false },
    { id: 'ten', name: 'CLASSIC 10', gal: 10, w: 150, h: 96, capStart: 14, capMax: 60, pace: 1, rim: true },
    { id: 'long', name: 'LONG 20', gal: 20, w: 230, h: 84, capStart: 18, capMax: 90, pace: 1.5, rim: false },
    { id: 'grand', name: 'GRAND 40', gal: 40, w: 280, h: 112, capStart: 24, capMax: 150, pace: 2.25, rim: true },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
