// Aircraft. body.style 'air' routes these through the aircraft mesh and flight model.
// perf: mass kg, kw engine power, vmax m/s, vstall m/s with flaps down, S wing area m2 (rotor area for helicopters), vr rotation speed m/s.
const base = (L, W, H, o = {}) => ({ L, W, H, wb: L * 0.6, ohF: L * 0.2, trk: W * 0.6, wr: 0.3, ww: 0.2, clr: 0, hoodY: H * 0.5, deckY: H * 0.4, beltY: H * 0.45, roofY: H, style: 'air', ...o });
const P = (o) => ({ gears: [1], final: 1, drive: 'RWD', grip: 1, brake: 1, nm: 0, redline: 2700, cd: 0.3, ...o });

export const AIRCRAFT = [
  { id: 'skylark', brand: 'Aerwing', name: 'Skylark 172', cls: 'Aircraft', price: 135000, level: 12, air: 'prop', span: 11, body: base(8.3, 2.6, 2.7), perf: P({ mass: 1090, kw: 120, vmax: 62, vstall: 27, vr: 31, S: 16.2, T0: 3900, redline: 2700 }), sound: { cyl: 4, pitch: 1.5, rough: 0.2 }, colors: ['#f2f2f0', '#e8e1cf', '#d9e6f2', '#f0c24a'] },
  { id: 'swift', brand: 'Aerwing', name: 'Swift H4', cls: 'Aircraft', price: 310000, level: 20, air: 'heli', span: 10.4, body: base(9.4, 2.2, 3.3), perf: P({ mass: 1450, kw: 340, vmax: 70, vstall: 0, vr: 0, S: 85, T0: 0, redline: 3200 }), sound: { cyl: 6, pitch: 0.7, rough: 0.5 }, colors: ['#c9ccd1', '#2b3a55', '#a32a2a', '#f2f2f0'] },
  { id: 'stratus', brand: 'Aerwing', name: 'Stratus Jet', cls: 'Aircraft', price: 980000, level: 34, air: 'jet', span: 12.5, body: base(13.5, 3.2, 4.2), perf: P({ mass: 4800, kw: 1400, vmax: 175, vstall: 48, vr: 58, S: 24, T0: 17000, redline: 9000 }), sound: { cyl: 8, pitch: 2.4, rough: 0.1 }, colors: ['#eef1f5', '#2a2f38', '#c8d0d8'] },
];
