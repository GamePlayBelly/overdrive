// Original characters of Riverton County.
export const NPCS = {
  nora: { name: 'Nora Vance', role: 'Mechanic, owner of Nora\'s Garage', color: '#e5383b', look: { height: 1.68, build: 0.4, skin: '#d6a078', hair: { style: 'ponytail', color: '#4a3222' }, facial: 'none', top: { type: 'tshirt', color: '#2c3440' }, jacket: { type: 'none' }, pants: { type: 'cargo', color: '#3a3f2e' }, shoes: { type: 'boots', color: '#3a2a1f' }, watch: 'smart' } },
  dex: { name: 'Dex Calloway', role: 'Underground League champion', color: '#d4a72c', look: { height: 1.84, build: 0.5, skin: '#f1d0b5', hair: { style: 'slick', color: '#d8c090' }, facial: 'stubble', top: { type: 'tshirt', color: '#f2f2f0' }, jacket: { type: 'leather', color: '#101010' }, pants: { type: 'jeans', color: '#1c1d20' }, shoes: { type: 'sneakers', color: '#1a1a1c' }, glasses: 'aviator', chain: 'thick', watch: 'gold' } },
  stone: { name: 'Garrick Stone', role: 'Owner of Stone Recovery', color: '#8a8272', look: { height: 1.8, build: 0.75, skin: '#e8b995', hair: { style: 'short', color: '#9a9a9a' }, facial: 'beard', top: { type: 'shirt', color: '#dfe4ea' }, jacket: { type: 'blazer', color: '#2e3440' }, pants: { type: 'suit', color: '#2e3440' }, shoes: { type: 'dress', color: '#1a1410' }, watch: 'gold' } },
  maya: { name: 'Det. Maya Ortiz', role: 'RCPD Detective', color: '#2f80ed', look: { height: 1.7, build: 0.35, skin: '#a9714c', hair: { style: 'bun', color: '#1c1510' }, facial: 'none', top: { type: 'shirt', color: '#e8e8e6' }, jacket: { type: 'blazer', color: '#23283a' }, pants: { type: 'suit', color: '#23283a' }, shoes: { type: 'dress', color: '#111' }, watch: 'steel' } },
  theo: { name: 'Theo Park', role: 'App developer, runs the Riverton phone network', color: '#2fb36a', look: { height: 1.72, build: 0.3, skin: '#e8b995', hair: { style: 'medium', color: '#1c1510' }, facial: 'none', top: { type: 'hoodie', color: '#2e7d32' }, jacket: { type: 'none' }, pants: { type: 'jeans', color: '#34465e' }, shoes: { type: 'sneakers', color: '#f2f2f0' }, glasses: 'square', bag: 'backpack' } },
  marisol: { name: 'Marisol Reyes', role: 'Owner of Copper Kettle Café', color: '#c77dff', look: { height: 1.63, build: 0.45, skin: '#c68e6a', hair: { style: 'long', color: '#2b1e16' }, facial: 'none', top: { type: 'shirt', color: '#8c2f2b' }, jacket: { type: 'none' }, pants: { type: 'jeans', color: '#1c1d20' }, shoes: { type: 'sneakers', color: '#1a1a1c' } } },
  lou: { name: 'Big Lou Brennan', role: 'Independent trucker', color: '#e0a21a', look: { height: 1.9, build: 0.95, skin: '#e8b995', hair: { style: 'buzz', color: '#6b4a2e' }, facial: 'beard', top: { type: 'shirt', color: '#8c2f2b' }, jacket: { type: 'none' }, pants: { type: 'jeans', color: '#34465e' }, shoes: { type: 'boots', color: '#6b4a2b' }, hat: { type: 'cap', color: '#1d4f91' } } },
  ines: { name: 'Ines Duarte', role: 'Car meet organizer', color: '#ff7a1a', look: { height: 1.66, build: 0.35, skin: '#8d5a3b', hair: { style: 'curly', color: '#1c1510' }, facial: 'none', top: { type: 'tshirt', color: '#1b1c1e' }, jacket: { type: 'bomber', color: '#6b3fa0' }, pants: { type: 'jeans', color: '#1c1d20' }, shoes: { type: 'sneakers', color: '#f2f2f0' }, glasses: 'round' } },
  sam: { name: 'Sam Kowalski', role: 'Retired rally champion', color: '#5fb3e8', look: { height: 1.76, build: 0.55, skin: '#f1d0b5', hair: { style: 'short', color: '#e0e0e0' }, facial: 'mustache', top: { type: 'polo', color: '#1d4f91' }, jacket: { type: 'none' }, pants: { type: 'chinos', color: '#b8a57e' }, shoes: { type: 'boots', color: '#3a2a1f' }, hat: { type: 'cap', color: '#b3261e' } } },
};

// Underground League rivals
export const RIVALS = [
  { id: 'dex', name: 'Dex Calloway', car: 'thunder', color: '#101010', skill: 0.9, aggr: 0.8, style: 'Aggressive — blocks the racing line', rank: 'Gold', rep: 22000, bio: 'Three-time Underground champion. Never lets anyone forget it.' },
  { id: 'kira', name: 'Kira Voss', car: 'gts', color: '#1d4f91', skill: 0.85, aggr: 0.4, style: 'Clean and precise — late braker', rank: 'Silver', rep: 9000, bio: 'Engineer by day. Knows every apex in downtown.' },
  { id: 'marco', name: 'Marco Lind', car: 'arc', color: '#e6c229', skill: 0.7, aggr: 0.5, style: 'Consistent — rarely makes mistakes', rank: 'Bronze', rep: 3000, bio: 'Weekend racer from the Eastside. Friendly until the lights go green.' },
  { id: 'rhea', name: 'Rhea Sato', car: 'arc', color: '#b01e23', skill: 0.75, aggr: 0.6, style: 'Bold overtakes on the inside', rank: 'Bronze', rep: 4200, bio: 'One half of the Sato twins. Faster than her brother (she says).' },
  { id: 'rowan', name: 'Rowan Sato', car: 'gts', color: '#f2f2f0', skill: 0.74, aggr: 0.55, style: 'Drafts, then pounces', rank: 'Silver', rep: 5100, bio: 'The other Sato twin. Slightly more careful.' },
  { id: 'hector', name: 'Hector Ruiz', car: 'hauler', color: '#8c1c1c', skill: 0.72, aggr: 0.85, style: 'Pushes people off the road', rank: 'Silver', rep: 7600, bio: 'Off-road veteran. His truck has seen worse than you.' },
  { id: 'lena', name: 'Lena Brooks', car: 'vireo', color: '#e0b21b', skill: 0.95, aggr: 0.35, style: 'Flawless — the one to beat', rank: 'Elite', rep: 42000, bio: 'Nobody has beaten her on the freeway loop. Yet.' },
];

// rumors NPCs can tell (conditions checked at runtime)
export const RUMORS = [
  { id: 'r_rare_night', text: 'A friend swears he saw a gold Castellan Vireo parked near the harbor cranes — only after midnight.', hint: { x: -960, z: -140 }, cond: { level: 8 } },
  { id: 'r_secret_race', text: 'Street racers meet at the Ridge Road overlook when it rains. Winner takes the pot.', hint: { x: 200, z: -665 }, cond: { level: 6 } },
  { id: 'r_hidden_garage', text: 'There is an old workshop behind the substation north of downtown. Nobody has used it in years.', hint: { x: 180, z: -340 }, cond: { level: 4 } },
  { id: 'r_police', text: 'Cops have been parking under the freeway lately. Speed traps everywhere near Central Avenue.', hint: { x: -55, z: -420 }, cond: { level: 1 } },
  { id: 'r_event', text: 'Ines is putting together a car meet at the Motor Club this weekend. Everyone who is anyone will be there.', hint: { x: 455, z: 230 }, cond: { level: 3 } },
  { id: 'r_stone', text: 'Stone Recovery tows cars that were parked perfectly legally. Then they vanish at the port.', hint: { x: -880, z: -20 }, cond: { level: 5 } },
  { id: 'r_country', text: 'The farm roads out east are great for a quiet drive. Watch out for tractors.', hint: { x: 1150, z: -60 }, cond: { level: 2 } },
  { id: 'r_keys', text: 'Somebody has been hiding spare keys all over the county. Collectors pay good money for those.', hint: null, cond: { level: 3 } },
];

// conditional contact messages (phone)
export const MESSAGES = [
  { id: 'msg_welcome', from: 'nora', text: 'Welcome to Riverton! Swing by the garage when you are ready to work. — N', cond: { level: 1 } },
  { id: 'msg_theo', from: 'theo', text: 'Installed the Riverton apps on your phone. Map, missions, friends — all synced. Press P anytime.', cond: { level: 1 } },
  { id: 'msg_dex', from: 'dex', text: 'Heard there is a new face in town. Motor Club, whenever you want to lose.', cond: { mission: 'm03' } },
  { id: 'msg_maya', from: 'maya', text: 'This is Detective Ortiz. We should talk. Kettleworth Diner, Old City.', cond: { mission: 'm10' } },
  { id: 'msg_ines', from: 'ines', text: 'Car meet at the Motor Club lot every evening. Bring something shiny!', cond: { level: 4 } },
  { id: 'msg_lou', from: 'lou', text: 'Got delivery jobs if you want cash. Port of Riverton, gate 2.', cond: { level: 3 } },
  { id: 'msg_sam', from: 'sam', text: 'You drive like me in 1989. Come find me on Ridge Road.', cond: { mission: 'm12' } },
];
