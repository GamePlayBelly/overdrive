// Ready-made characters for the creator. Each entry overrides the default look; anything it leaves out falls back to the base look.
const none = { type: 'none', color: '#000000' };
const jeans = (c = '#2e3f5e') => ({ type: 'jeans', color: c });
const sneakers = (c = '#f2f2f0') => ({ type: 'sneakers', color: c });
const boots = (c = '#15130f') => ({ type: 'boots', color: c });

export const BASE_LOOK = { species: 'human', acc: [], hat: { type: 'none', color: '#222222' }, glasses: 'none', facial: 'none', chain: 'none', bag: 'none', watch: 'steel' };

export const ARCHETYPES = [
  { id: 'rookie', name: 'Rookie', blurb: 'Denim and a grin', look: { skin: '#f1d0b5', eyes: '#4a3526', hair: { style: 'tousled', color: '#8a5a2e' }, top: { type: 'tshirt', color: '#f2f2f0' }, jacket: { type: 'bomber', color: '#4a86c7' }, pants: jeans(), shoes: sneakers() } },
  { id: 'glitch', name: 'Glitch', blurb: 'Lives in the headset', look: { skin: '#e8c4a8', eyes: '#5a6a7a', hair: { style: 'long', color: '#8a4fd8' }, acc: ['vr'], top: { type: 'tshirt', color: '#1a1a1f' }, jacket: { type: 'hoodie', color: '#16161c' }, pants: jeans('#1a1a22'), shoes: sneakers('#1c1c22') } },
  { id: 'operator', name: 'Operator', blurb: 'Plates, pouches, no small talk', look: { skin: '#e0b494', eyes: '#3d6b8c', hair: { style: 'spiky', color: '#3b6bff' }, acc: ['vest'], top: { type: 'shirt', color: '#1b1f26' }, jacket: none, pants: { type: 'jeans', color: '#1f242b' }, shoes: boots() } },
  { id: 'neko', name: 'Neko', blurb: 'Pink bob, cat ears', look: { skin: '#f6dcc8', eyes: '#c94f8a', hair: { style: 'bob', color: '#ff7aa8' }, acc: ['catEars'], top: { type: 'tank', color: '#f4f4f6' }, jacket: none, pants: jeans('#e9e9ee'), shoes: sneakers() } },
  { id: 'unit', name: 'Unit-7', blurb: 'Chrome shell, blue eyes', look: { species: 'android', hair: { style: 'none', color: '#111111' }, top: { type: 'tshirt', color: '#eef2f6' }, jacket: none, pants: jeans('#d6dde5'), shoes: sneakers('#2a3340') } },
  { id: 'dj', name: 'DJ Static', blurb: 'Headphones on, shades on', look: { skin: '#6b4127', eyes: '#2b1e16', hair: { style: 'buzz', color: '#111111' }, facial: 'stubble', glasses: 'sun', acc: ['headphones'], top: { type: 'tshirt', color: '#222226' }, jacket: { type: 'hoodie', color: '#1c1f26' }, pants: jeans('#1a1c22'), shoes: sneakers('#e0e0e0') } },
  { id: 'elf', name: 'Sylva', blurb: 'Flower crown, forest eyes', look: { species: 'elf', skin: '#f1d0b5', eyes: '#4a7a4a', hair: { style: 'wavy', color: '#4fd66b' }, acc: ['flowers'], top: { type: 'tank', color: '#3d8f4a' }, jacket: none, pants: { type: 'jeans', color: '#6b4a2e' }, shoes: boots('#4a3222') } },
  { id: 'shadow', name: 'Shadow', blurb: 'Nobody sees the face', look: { acc: ['hood'], hair: { style: 'none', color: '#000000' }, top: { type: 'tshirt', color: '#111114' }, jacket: { type: 'hoodie', color: '#0b0b0f' }, pants: jeans('#0d0d11'), shoes: boots('#0a0a0a') } },
  { id: 'sunny', name: 'Sunny', blurb: 'Straw hat, golden hair', look: { skin: '#f1d0b5', eyes: '#3d6b8c', hair: { style: 'long', color: '#ffd84a' }, hat: { type: 'sun', color: '#f2c23a', band: '#ff6fa8' }, top: { type: 'tshirt', color: '#ff7fb0' }, jacket: none, pants: { type: 'shorts', color: '#f2f2f0' }, shoes: sneakers('#ff9fbf') } },
  { id: 'neon', name: 'Neon', blurb: 'Teal skin, purple spikes', look: { species: 'cyber', eyes: '#35f0e0', hair: { style: 'spiky', color: '#8a4fd8' }, acc: ['cyber'], top: { type: 'tshirt', color: '#1a1630' }, jacket: none, pants: jeans('#1a1630'), shoes: boots('#241c44') } },
];
