// Riverton County — vertical slice layout. Units: meters. x = east, z = south.
import { TOWN_STREETS, TOWN_DISTRICTS, REGION_DISTRICTS } from './routes.js';

export const ROAD_CLASSES = {
  arterial:   { lanes: 2, laneW: 3.3, median: 0.4, parking: 2.4, gutter: 0.3, speed: 50, centerline: 'double-yellow', edge: 'parking', lamp: 'cobra' },
  avenue:     { lanes: 2, laneW: 3.4, median: 0.4, parking: 0, gutter: 0.6, speed: 60, centerline: 'double-yellow', edge: 'white', lamp: 'cobra' },
  local:      { lanes: 1, laneW: 3.3, median: 0.2, parking: 2.2, gutter: 0.3, speed: 40, centerline: 'yellow-dashed', edge: 'none', lamp: 'post' },
  oldtown:    { lanes: 1, laneW: 3.1, median: 0.15, parking: 2.1, gutter: 0.25, speed: 30, centerline: 'yellow-dashed', edge: 'none', lamp: 'heritage' },
  industrial: { lanes: 1, laneW: 3.9, median: 0.2, parking: 0, gutter: 1.4, speed: 50, centerline: 'yellow-dashed', edge: 'white', lamp: 'cobra' },
  freeway:    { lanes: 2, laneW: 3.7, median: 3.2, parking: 0, gutter: 3.0, speed: 110, centerline: 'barrier', edge: 'white', lamp: 'highmast', freeway: true },
  ramp:       { lanes: 1, laneW: 4.0, oneway: true, shoulderL: 1.0, shoulderR: 2.0, speed: 70, edge: 'white', lamp: 'cobra' },
  rural:      { lanes: 1, laneW: 3.4, median: 0.2, parking: 0, gutter: 1.2, speed: 80, centerline: 'yellow-dashed', edge: 'white', lamp: 'none' },
};

export function halfWidth(c) {
  if (c.oneway) return (c.shoulderL + c.lanes * c.laneW + c.shoulderR) / 2;
  return c.median / 2 + c.lanes * c.laneW + c.parking + c.gutter;
}

const D = [-275, -165, -55, 55, 165, 275];

// straight streets: axis 'x' runs along x at z=c; axis 'z' runs along z at x=c. segs: [from, to, class]
export const STREETS = [
  // east-west
  { axis: 'x', c: -275, name: 'North Avenue', segs: [[-960, -275, 'industrial'], [-275, 275, 'arterial'], [275, 875, 'local']] },
  { axis: 'x', c: -165, name: 'Lincoln Street', segs: [[-875, -275, 'industrial'], [-275, 275, 'arterial'], [275, 875, 'local']] },
  { axis: 'x', c: -55, name: 'Riverton Avenue', segs: [[-875, -275, 'avenue'], [-275, 275, 'arterial'], [275, 1000, 'avenue']] },
  { axis: 'x', c: 55, name: 'Harbor Boulevard', segs: [[-875, -275, 'avenue'], [-275, 275, 'arterial'], [275, 1000, 'avenue']] },
  { axis: 'x', c: 165, name: 'Madison Street', segs: [[-875, -275, 'industrial'], [-275, 275, 'arterial'], [275, 875, 'local']] },
  { axis: 'x', c: 275, name: 'Union Street', segs: [[-875, -275, 'industrial'], [-275, 275, 'arterial'], [275, 875, 'local']] },
  { axis: 'x', c: 340, name: 'Chapel Street', segs: [[-275, 275, 'oldtown']] },
  { axis: 'x', c: 405, name: 'Mercer Street', segs: [[-275, 275, 'oldtown']] },
  { axis: 'x', c: 470, name: 'Canal Street', segs: [[-275, 275, 'oldtown']] },
  // suburbs east-west
  ...[-220, -110, 0, 110, 220, 330, 385].map((z, i) => ({
    axis: 'x', c: z, name: ['Birch Lane', 'Cedar Lane', 'Elm Street', 'Willow Drive', 'Aspen Drive', 'Hazel Road', 'Orchard Road'][i],
    segs: [[275, 875, 'local']],
  })),
  // north-south
  { axis: 'z', c: -960, name: 'Bayfront Road', segs: [[-420, -275, 'industrial']] },
  { axis: 'z', c: -875, name: 'Dock Street', segs: [[-275, 275, 'industrial']] },
  { axis: 'z', c: -735, name: 'Foundry Road', segs: [[-275, 275, 'industrial']] },
  { axis: 'z', c: -595, name: 'Mill Road', segs: [[-560, -275, 'avenue'], [-275, 275, 'industrial']] },
  { axis: 'z', c: -455, name: 'Rail Street', segs: [[-275, 275, 'industrial']] },
  { axis: 'z', c: -275, name: '1st Street', segs: [[-275, 275, 'arterial'], [275, 470, 'oldtown']] },
  { axis: 'z', c: -165, name: '2nd Street', segs: [[-275, 275, 'arterial'], [275, 470, 'oldtown']] },
  { axis: 'z', c: -55, name: 'Central Avenue', segs: [[-560, -275, 'avenue'], [-275, 470, 'arterial']] },
  { axis: 'z', c: 55, name: 'Market Street', segs: [[-275, 470, 'arterial']] },
  { axis: 'z', c: 165, name: '4th Street', segs: [[-275, 275, 'arterial'], [275, 470, 'oldtown']] },
  { axis: 'z', c: 275, name: '5th Street', segs: [[-275, 275, 'arterial'], [275, 470, 'oldtown']] },
  ...[-220, -110, 0, 110, 220].map((x, i) => ({
    axis: 'z', c: x, name: ['Bell Street', 'Tanner Street', 'Guild Street', 'Weaver Street', 'Cooper Street'][i],
    segs: [[275, 470, 'oldtown']],
  })),
  { axis: 'z', c: 395, name: 'Park Road', segs: [[-275, 385, 'local']] },
  { axis: 'z', c: 515, name: 'Linden Road', segs: [[-275, 385, 'local']] },
  { axis: 'z', c: 635, name: 'Crest Avenue', segs: [[-575, -275, 'avenue'], [-275, 385, 'local']] },
  { axis: 'z', c: 755, name: 'Holly Road', segs: [[-275, 385, 'local']] },
  { axis: 'z', c: 875, name: 'Eastgate Avenue', segs: [[-275, 385, 'avenue']] },
  { axis: 'z', c: 1000, name: 'County Road 4', segs: [[-420, 385, 'rural']] },
  // Marlow Bay (coastal city) — east-west
  { axis: 'x', c: 1990, name: 'Harbor Road', segs: [[-360, 360, 'avenue']] },
  { axis: 'x', c: 2080, name: 'Bay Street', segs: [[-360, 360, 'arterial']] },
  { axis: 'x', c: 2170, name: 'Palm Avenue', segs: [[-360, 360, 'arterial']] },
  { axis: 'x', c: 2260, name: 'Ocean Boulevard', segs: [[-360, 360, 'avenue']] },
  // Marlow Bay — north-south
  ...[-360, -270, -180, -90, 0, 90, 180, 270, 360].map((x, i) => ({ axis: 'z', c: x, name: ['West End Road', 'Anchor Way', 'Coral Street', 'Pelican Street', 'Marlow Main Street', 'Tide Street', 'Wharf Street', 'Dune Street', 'East End Road'][i], segs: [[1990, 2260, i === 4 ? 'arterial' : 'local']] })),
];

export const FREEWAY = {
  name: 'Riverton Freeway',
  z: -420,
  x0: -960, x1: 1000,
  deckY: 8,
  elevated: [-700, 780],
  ramps: [
    { x: -595, name: 'Mill Rd / Industrial' },
    { x: -55, name: 'Central Ave / Downtown' },
    { x: 635, name: 'Crest Ave / Eastside' },
  ],
  rampSpan: 250,
  termS: -392, termN: -448,
};

export const RIDGE_ROAD = {
  name: 'Ridge Road',
  pts: [[-960, -420], [-945, -500], [-860, -565], [-720, -585], [-595, -560], [-470, -600], [-300, -640], [-160, -610], [-55, -560], [60, -600], [200, -665], [360, -690], [500, -640], [635, -575], [780, -560], [900, -520], [1000, -420]],
  joins: { '-595': 4, '-55': 8, '635': 13 },
};

export const ROUTE9 = {
  name: 'Route 9',
  from: [-55, 470],
  to: [0, 1990],
  pts: [[-55, 470], [-62, 560], [-88, 660], [-70, 770], [-20, 880], [40, 990], [88, 1090], [70, 1210], [10, 1310], [-52, 1410], [-70, 1520], [-30, 1630], [34, 1720], [60, 1810], [30, 1900], [0, 1990]],
};

export const DISTRICTS = [
  { id: 'cbd', name: 'Central Business District', short: 'Downtown', x0: -275, x1: 275, z0: -275, z1: 275, xs: D, zs: D, sidewalk: 4.5, style: 'cbd', color: '#6b7a8f' },
  { id: 'oldtown', name: 'Old City', short: 'Old City', x0: -275, x1: 275, z0: 275, z1: 470, xs: [-275, -220, -165, -110, -55, 0, 55, 110, 165, 220, 275], zs: [275, 340, 405, 470], sidewalk: 3, style: 'oldtown', color: '#8f6b5a' },
  { id: 'eastside', name: 'Eastside Suburbs', short: 'Eastside', x0: 275, x1: 875, z0: -275, z1: 385, xs: [275, 395, 515, 635, 755, 875], zs: [-275, -220, -165, -110, -55, 0, 55, 110, 165, 220, 275, 330, 385], sidewalk: 1.6, verge: 2.2, style: 'suburb', color: '#6f8f5a' },
  { id: 'industrial', name: 'Foundry Industrial District', short: 'Industrial', x0: -875, x1: -275, z0: -275, z1: 275, xs: [-875, -735, -595, -455, -275], zs: D, sidewalk: 1.8, style: 'industrial', color: '#8a8272' },
  { id: 'harbor', name: 'Port of Riverton', short: 'Harbor', x0: -1060, x1: -875, z0: -300, z1: 300, style: 'harbor', color: '#5a7385' },
  { id: 'hills', name: 'North Ridge Hills', short: 'North Ridge', x0: -1000, x1: 1000, z0: -900, z1: -440, style: 'hills', color: '#5f7a4d' },
  { id: 'country', name: 'Eastfield Countryside', short: 'Eastfield', x0: 1000, x1: 1600, z0: -900, z1: 900, style: 'country', color: '#9a9a5a' },
  { id: 'marlow', name: 'Marlow Bay', short: 'Marlow Bay', x0: -360, x1: 360, z0: 1990, z1: 2260, xs: [-360, -270, -180, -90, 0, 90, 180, 270, 360], zs: [1990, 2080, 2170, 2260], sidewalk: 3.4, style: 'coast', color: '#4fa3b5' },
  { id: 'pines', name: 'Pinewood Forest', short: 'Pinewood', x0: -900, x1: 900, z0: 900, z1: 1980, style: 'forest', color: '#4d6b45' },
];

// zoning overrides for individual blocks: [x0,x1,z0,z1,zone]
export const ZONES = [
  [-55, 55, -55, 55, 'park'],
  [275, 395, 110, 275, 'commercial'],
  [395, 515, 165, 275, 'commercial'],
  [635, 755, 0, 55, 'park'],
  [-165, -55, 275, 340, 'plaza'],
  [-275, -165, 165, 275, 'police'],
  [165, 275, -275, -165, 'hotel'],
  [-455, -275, -55, 55, 'garage'],
  [515, 635, 220, 275, 'school'],
  [-90, 0, 2170, 2260, 'park'],
  [90, 180, 2080, 2170, 'plaza'],
  // Alder Peak
  [-40, 40, -1790, -1700, 'lodge'],
  [-120, -40, -1700, -1610, 'chapel'],
  [40, 120, -1700, -1610, 'alpstore'],
  // Dry Springs (north row along Main Street)
  [2740, 2820, 50, 150, 'drygas'],
  [2820, 2900, 50, 150, 'diner'],
  [2900, 2980, 50, 150, 'drystore'],
  [2980, 3060, 50, 150, 'motel'],
  // Marin Village
  [-1970, -1870, -510, -420, 'plaza'],
];

export const WATER_LEVEL = -2.2;
export const SOUTH_COAST_Z = 2330;
export const MARLOW = { x0: -360, x1: 360, z0: 1990, z1: 2260, boardZ: 2274, beachZ: 2290, sandEnd: 2360 };
export const BAY_X = -1062;

export const POI = {
  garage: { x: -365, z: 0, heading: Math.PI / 2, name: "Nora's Garage", icon: 'garage' },
  safehouse: { x: 575, z: -140, name: 'Safehouse — Birch Lane', icon: 'home' },
  police: { x: -220, z: 220, name: 'RCPD Central Precinct', icon: 'police' },
  dealer: { x: 335, z: 192, name: 'Westwind Motors', icon: 'dealer' },
  diner: { x: 110, z: 372, name: 'Kettleworth Diner', icon: 'food' },
  harborGate: { x: -900, z: -20, name: 'Port of Riverton — Gate 2', icon: 'port' },
  cityHall: { x: 0, z: -110, name: 'City Hall', icon: 'civic' },
  viewpoint: { x: 200, z: -665, name: 'Ridge Road Overlook', icon: 'view' },
  motorClub: { x: 455, z: 230, name: 'Riverton Motor Club', icon: 'flag' },
  meet: { x: 450, z: 215, name: 'Eastside Car Meet', icon: 'meet' },
  marlow: { x: 0, z: 2130, name: 'Marlow Bay', icon: 'civic' },
  marina: { x: -250, z: 2350, name: 'Marlow Marina', icon: 'boat' },
  pier: { x: 90, z: 2330, name: 'Marlow Pier', icon: 'view' },
  lighthouse: { x: 330, z: 2300, name: 'Cape Light', icon: 'view' },
  forestOverlook: { x: 60, z: 1190, name: 'Pinewood Overlook', icon: 'view' },
  harborDocks: { x: -1050, z: 170, name: 'Riverton Small Craft Docks', icon: 'boat' },
};

export const SPAWNS = [
  { id: 'garage', label: "Nora's Garage (Industrial)", x: -300, z: 0, heading: Math.PI / 2 },
  { id: 'downtown', label: 'Downtown — Founders Park', x: -8.5, z: 70, heading: Math.PI },
  { id: 'eastside', label: 'Eastside — Birch Lane', x: 575, z: -224, heading: -Math.PI / 2 },
  { id: 'oldtown', label: 'Old City — Canal Street', x: 30, z: 474, heading: Math.PI / 2 },
  { id: 'harbor', label: 'Port of Riverton', x: -880, z: -20, heading: 0 },
  { id: 'freeway', label: 'Riverton Freeway (east)', x: 870, z: -413, heading: -Math.PI / 2 },
  { id: 'marlow', label: 'Marlow Bay — Main Street', x: 0, z: 2110, heading: Math.PI },
  { id: 'marina', label: 'Marlow Marina', x: -250, z: 2346, heading: 0 },
  { id: 'forest', label: 'Route 9 — Pinewood Forest', x: 40, z: 1000, heading: Math.PI },
  { id: 'airfield', label: 'Riverton Airfield', x: 1050, z: 2100, heading: Math.PI / 2 },
  { id: 'alder', label: 'Alder Peak — Summit Road', x: -40, z: -1662, heading: Math.PI },
  { id: 'dry', label: 'Dry Springs — Main Street', x: 2790, z: 144, heading: Math.PI / 2 },
  { id: 'marin', label: 'Marin Village — Bayline Drive', x: -1874, z: -462, heading: -Math.PI / 2 },
  { id: 'bridge', label: 'Bayline Bridge', x: -1300, z: -428, heading: -Math.PI / 2 },
];

// outer regions: towns first so they win over the broad region names
STREETS.push(...TOWN_STREETS);
DISTRICTS.unshift(...TOWN_DISTRICTS);
DISTRICTS.push(...REGION_DISTRICTS);
