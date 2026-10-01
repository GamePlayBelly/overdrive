// Story missions. Step types handled by game/missions.js:
// goto, checkpoints (race/timetrial when rivals/limit), pickup, deliver, escape, tail, recover, escort, stunt, photo, ram, talk, onfoot, interact
const GARAGE = { poi: 'garage' };
const RIDGE = { W: [-945, -500], A: [-720, -585], B: [-470, -600], C: [-300, -640], D: [-160, -610], E: [-55, -560], F: [60, -600], G: [200, -665], H: [360, -690], I: [500, -640], J: [635, -575], K: [900, -520] };

export const CHAPTERS = ['New in Town', 'Rising', 'Known', 'Legend'];

export const MISSIONS = [
  {
    id: 'm01', ch: 0, title: 'Welcome to Riverton', type: 'Driving', giver: 'nora', level: 1, start: GARAGE,
    intro: [['nora', 'So you are the new driver. The Civa out front is yours now — it is not pretty, but it runs.'], ['nora', 'Take it around the Foundry blocks. I want to hear those brakes work. Follow the markers and bring it back in one piece.']],
    steps: [
      { t: 'checkpoints', text: 'Test drive through the Foundry District', pts: [[-275, 55], [-455, 55], [-455, 165], [-735, 165], [-735, -55], [-595, -55], [-595, -275], [-275, -275], [-275, -55]], limit: 0 },
      { t: 'goto', to: GARAGE, r: 7, text: "Return to Nora's Garage", stop: true },
    ],
    outro: [['nora', 'Brakes are fine. Your driving is… fine too. Stick around, I have work.']],
    rewards: { money: 800, xp: 600, rep: 150 },
  },
  {
    id: 'm02', ch: 0, title: 'Parts Run', type: 'Delivery', giver: 'nora', level: 1, requires: ['m01'], start: GARAGE,
    intro: [['nora', 'A crate of transmission parts is waiting at the port, gate 2. It is fragile and I needed it yesterday.'], ['nora', 'Grab it and bring it back. Do not bounce it off every lamp post.']],
    steps: [
      { t: 'goto', to: { poi: 'harborGate' }, r: 10, text: 'Drive to the Port of Riverton — Gate 2', stop: true },
      { t: 'pickup', text: 'Loading the crate…', dur: 2.5 },
      { t: 'deliver', to: GARAGE, r: 8, limit: 170, fragile: 0.3, text: "Deliver the parts to Nora's Garage" },
    ],
    outro: [['nora', 'Not a scratch. I might actually keep you.']],
    rewards: { money: 1400, xp: 800, rep: 200 },
  },
  {
    id: 'm03', ch: 0, title: 'Heat Check', type: 'Escape', giver: 'nora', level: 2, requires: ['m02'], start: GARAGE,
    intro: [['nora', 'My cousin left his Kestrel in the Old City. A tow company flagged it with the cops — Stone Recovery, of course.'], ['nora', 'Get it back here. If the police show up… do not let them catch you.']],
    steps: [
      { t: 'goto', to: { x: 0, z: 442 }, r: 12, text: 'Find the Kestrel Arc on Guild Street, Old City' },
      { t: 'recover', model: 'arc', color: '#1d4f91', at: { x: 0, z: 438, yaw: 0 }, text: 'Get in the Kestrel Arc' },
      { t: 'escape', level: 2, text: 'The police were tipped off — lose them!' },
      { t: 'deliver', to: GARAGE, r: 8, text: "Bring the car to Nora's Garage" },
    ],
    outro: [['nora', 'Stone again. That man tows half the county and nobody asks where the cars go.']],
    rewards: { money: 2200, xp: 1200, rep: 400 },
  },
  {
    id: 'm04', ch: 0, title: 'Street Sprint', type: 'Racing', giver: 'dex', level: 3, requires: ['m03'], start: { poi: 'motorClub' },
    intro: [['dex', 'So Nora\'s new pet can drive. Sprint to Market Street. Loser buys the coffee.'], ['dex', 'Try to keep up.']],
    steps: [
      { t: 'checkpoints', race: true, text: 'Beat Dex to Market & Riverton', pts: [[395, 220], [395, 55], [875, 55], [875, -275], [275, -275], [55, -275], [55, -55]], rivals: [{ id: 'dex', model: 'thunder', color: '#101010', skill: 0.72 }] },
    ],
    outro: [['dex', 'Beginner\'s luck. We will do this again.']],
    rewards: { money: 3000, xp: 1500, rep: 700 },
    fail: { race: 'You must finish first.' },
  },
  {
    id: 'm05', ch: 0, title: 'Night Delivery', type: 'Delivery', giver: 'marisol', level: 4, requires: ['m04'], start: { x: 110, z: 380 }, hours: [19, 5],
    intro: [['marisol', 'You are the driver Nora talks about? I have a cake order for a party at the Ridge Road overlook. It must be there hot — well, you know what I mean.']],
    steps: [
      { t: 'pickup', text: 'Loading the order…', dur: 2 },
      { t: 'deliver', to: { poi: 'viewpoint' }, r: 14, limit: 260, fragile: 0.35, text: 'Deliver to the Ridge Road Overlook' },
    ],
    outro: [['marisol', 'They loved it. Come by the café any time — I hear everything that happens in this town.']],
    rewards: { money: 2600, xp: 1400, rep: 350 },
  },
  {
    id: 'm06', ch: 1, title: 'The Tail', type: 'Pursuit', giver: 'nora', level: 5, requires: ['m05'], start: GARAGE,
    intro: [['nora', 'A Stone Recovery truck just hooked a customer\'s car outside the port. Follow it. Stay close enough not to lose it — far enough not to get spotted.']],
    steps: [
      { t: 'goto', to: { x: -860, z: -60 }, r: 20, text: 'Get near the port gate' },
      { t: 'tail', model: 'utility', color: '#e07a1a', route: [[-875, -20], [-875, -165], [-735, -165], [-735, -275], [-455, -275], [-455, -165], [-595, -165], [-625, -110]], min: 12, max: 130, speed: 13, text: 'Tail the Stone Recovery truck' },
    ],
    outro: [['nora', 'So that is where they take them. Foundry Road yard. Good work.']],
    rewards: { money: 2800, xp: 1600, rep: 500 },
  },
  {
    id: 'm07', ch: 1, title: 'Recovery', type: 'Recovery', giver: 'nora', level: 6, requires: ['m06'], start: GARAGE,
    intro: [['nora', 'That Meridian in Stone\'s yard belongs to Mrs. Alvarez. She paid for new brakes, not for a trip to the scrapyard.'], ['nora', 'Go get it. Their guards will call the cops.']],
    steps: [
      { t: 'goto', to: { x: -640, z: -110 }, r: 14, text: "Go to Stone's yard on Foundry Road" },
      { t: 'recover', model: 'meridian', color: '#3a4a5c', at: { x: -640, z: -100, yaw: Math.PI / 2 }, text: 'Take back the Meridian' },
      { t: 'escape', level: 2, text: 'Guards called the police — escape' },
      { t: 'deliver', to: GARAGE, r: 8, fragile: 0.6, text: "Deliver the Meridian to Nora's Garage" },
    ],
    outro: [['nora', 'Mrs. Alvarez is going to bake you something. Brace yourself.']],
    rewards: { money: 4200, xp: 2000, rep: 800 },
  },
  {
    id: 'm08', ch: 1, title: 'Showroom', type: 'Exploration', giver: 'ines', level: 7, requires: ['m07'], start: { poi: 'dealer' },
    intro: [['ines', 'I run the car meets at the Motor Club. I need shots of the three best cars in tonight\'s lineup for the flyer.'], ['ines', 'Open photo mode (F2) near each car and snap it.']],
    steps: [
      { t: 'goto', to: { poi: 'meet' }, r: 25, text: 'Drive to the Motor Club lot' },
      { t: 'photo', targets: [{ model: 'gts', color: '#d3431f', dx: 0, dz: 0 }, { model: 'thunder', color: '#1b3a6b', dx: 8, dz: 0 }, { model: 'arc', color: '#e6c229', dx: 16, dz: 0 }], text: 'Photograph the three featured cars' },
    ],
    outro: [['ines', 'Perfect. You have an eye for this. The meet is open to you anytime.']],
    rewards: { money: 2400, xp: 1500, rep: 600, items: ['decal_number'] },
  },
  {
    id: 'm09', ch: 1, title: 'Freeway Run', type: 'Time trial', giver: 'dex', level: 8, requires: ['m08'], start: { x: -55, z: -345 },
    intro: [['dex', 'Freeway east, up Crest Avenue, back along Ridge Road. Under three and a half minutes or do not bother talking to me.']],
    steps: [
      { t: 'checkpoints', text: 'Freeway & Ridge Road loop', timetrial: true, limit: 210, pts: [[-55, -392], [60, -393], [300, -414], [500, -414], [600, -393], [635, -448], RIDGE.J, RIDGE.I, RIDGE.H, RIDGE.G, RIDGE.F, RIDGE.E, [-55, -448]] },
    ],
    outro: [['dex', 'Fine. You are fast. That does not make you good.']],
    rewards: { money: 4000, xp: 2200, rep: 900 },
  },
  {
    id: 'm10', ch: 1, title: 'Underground: Bronze', type: 'Racing', giver: 'dex', level: 10, requires: ['m09'], start: { x: 55, z: -40 },
    intro: [['dex', 'Welcome to the Underground League. Two laps around downtown. Marco and Rhea think they own Bronze.']],
    steps: [
      { t: 'checkpoints', race: true, laps: 2, text: 'Win the Bronze qualifier', pts: [[55, -55], [275, -55], [275, 165], [-165, 165], [-165, -165], [55, -165]], rivals: [{ id: 'marco', model: 'arc', color: '#e6c229', skill: 0.66 }, { id: 'rhea', model: 'arc', color: '#b01e23', skill: 0.7 }, { id: 'rowan', model: 'gts', color: '#f2f2f2', skill: 0.64 }] },
    ],
    outro: [['dex', 'Bronze champion. Cute. See you in Silver.']],
    rewards: { money: 6500, xp: 3000, rep: 1500, league: 'Bronze' },
  },
  {
    id: 'm11', ch: 2, title: 'Detective Ortiz', type: 'Driving', giver: 'maya', level: 11, requires: ['m10'], start: { poi: 'diner' },
    intro: [['maya', 'Detective Maya Ortiz. I know about the Meridian. I also know Stone is dirty.'], ['maya', 'Drive me to City Hall. Carefully. If I see one scratch, we have a very different conversation.']],
    steps: [
      { t: 'deliver', to: { x: 0, z: -178 }, r: 10, limit: 200, fragile: 0.25, clean: true, text: 'Drive Detective Ortiz to City Hall — no damage, no police attention' },
    ],
    outro: [['maya', 'You can drive when you want to. I will be in touch.']],
    rewards: { money: 3500, xp: 2400, rep: 800 },
  },
  {
    id: 'm12', ch: 2, title: 'Convoy', type: 'Escort', giver: 'lou', level: 12, requires: ['m11'], start: { poi: 'harborGate' },
    intro: [['lou', 'I am hauling paperwork Stone would pay a lot to lose. His tow trucks are already circling.'], ['lou', 'Keep them off me until I reach the Eastside warehouse.']],
    steps: [
      { t: 'escort', model: 'boxtruck', color: '#2a4a7a', from: { x: -860, z: 40, yaw: Math.PI / 2 }, to: { x: 875, z: 300 }, enemies: 4, text: 'Escort Big Lou to the Eastside warehouse' },
    ],
    outro: [['lou', 'Not a dent on my rig. Drinks are on me forever.']],
    rewards: { money: 7000, xp: 3200, rep: 1400 },
  },
  {
    id: 'm13', ch: 2, title: 'Hill Climb', type: 'Racing', giver: 'sam', level: 13, requires: ['m12'], start: { x: -945, z: -470 },
    intro: [['sam', 'Ridge Road, end to end. I won this road in 1989 with half the horsepower you have got.'], ['sam', 'Show me what you learned.']],
    steps: [
      { t: 'checkpoints', race: true, text: 'Race Sam along Ridge Road', pts: [RIDGE.W, RIDGE.A, RIDGE.B, RIDGE.C, RIDGE.D, RIDGE.E, RIDGE.F, RIDGE.G, RIDGE.H, RIDGE.I, RIDGE.J, RIDGE.K], rivals: [{ id: 'sam', model: 'trek', color: '#b3261e', skill: 0.8, name: 'Sam Kowalski' }] },
    ],
    outro: [['sam', 'Hah! Now that was driving.']],
    rewards: { money: 7500, xp: 3400, rep: 1600 },
  },
  {
    id: 'm14', ch: 2, title: 'Stakeout', type: 'Pursuit', giver: 'maya', level: 14, requires: ['m13'], start: { x: -860, z: -250 }, hours: [21, 4],
    intro: [['maya', 'Stone\'s accountant leaves the port every night. Follow him and tell me where he goes.']],
    steps: [
      { t: 'tail', model: 'crown', color: '#0f1114', route: [[-875, -165], [-875, 55], [-455, 55], [-275, 55], [55, 55], [165, 55], [165, -165], [205, -190]], min: 15, max: 140, speed: 14, text: "Tail the accountant's Crown" },
    ],
    outro: [['maya', 'The Grand Meridian. Expensive taste for an accountant.']],
    rewards: { money: 6000, xp: 3000, rep: 1200 },
  },
  {
    id: 'm15', ch: 2, title: 'Stunt Show', type: 'Stunt', giver: 'ines', level: 15, requires: ['m14'], start: { poi: 'meet' },
    intro: [['ines', 'I am making a video for the meet. I need air time and big drifts. Anywhere in the county, three minutes.']],
    steps: [
      { t: 'stunt', air: 2.5, drift: 4000, limit: 180, text: 'Get 2.5 s of air time and 4,000 drift points' },
    ],
    outro: [['ines', 'This is going to get so many views.']],
    rewards: { money: 5000, xp: 3000, rep: 1500, items: ['decal_flames'] },
  },
  {
    id: 'm16', ch: 3, title: 'Double Cross', type: 'Escape', giver: 'stone', level: 17, requires: ['m15'], start: { poi: 'motorClub' },
    intro: [['stone', 'You have been busy. Towing my trucks, following my people…'], ['stone', 'I made a call. Enjoy the attention.']],
    steps: [
      { t: 'escape', level: 4, text: 'Stone set you up — escape a level 4 response' },
      { t: 'goto', to: { poi: 'safehouse' }, r: 10, text: 'Lie low at the safehouse', stop: true },
    ],
    outro: [['nora', 'You are all over the police scanner. Whatever Stone is hiding, it is big.']],
    rewards: { money: 9000, xp: 4000, rep: 2200 },
  },
  {
    id: 'm17', ch: 3, title: 'Evidence', type: 'Recovery', giver: 'maya', level: 19, requires: ['m16'], start: { poi: 'police' },
    intro: [['maya', 'Stone keeps a ledger in the port office. I cannot touch it without a warrant.'], ['maya', 'You, on the other hand… Bring it to the precinct. Fast.']],
    steps: [
      { t: 'goto', to: { x: -880, z: -50 }, r: 16, text: 'Go to the port office' },
      { t: 'onfoot', to: { x: -905, z: -61 }, r: 2.5, text: 'On foot: grab the ledger from the office door' },
      { t: 'escape', level: 3, text: 'Stone\'s people called the police — get away' },
      { t: 'deliver', to: { poi: 'police' }, r: 10, text: 'Bring the ledger to Detective Ortiz' },
    ],
    outro: [['maya', 'This is it. Every stolen car, every buyer. Stone is finished — if we can catch him.']],
    rewards: { money: 11000, xp: 4600, rep: 2600 },
  },
  {
    id: 'm18', ch: 3, title: 'Last Race', type: 'Racing', giver: 'dex', level: 20, requires: ['m17'], start: { x: 55, z: -40 },
    intro: [['dex', 'Heard you are a hero now. One race. Downtown, freeway, back. No Bronze kids this time.']],
    steps: [
      { t: 'checkpoints', race: true, text: 'Win the Gold final', pts: [[55, -165], [55, -275], [-55, -275], [-55, -392], [60, -393], [400, -414], [600, -393], [635, -275], [635, -55], [275, -55], [55, -55]], rivals: [{ id: 'dex', model: 'thunder', color: '#101010', skill: 0.9 }, { id: 'kira', model: 'gts', color: '#1d4f91', skill: 0.85 }, { id: 'hector', model: 'hauler', color: '#8c1c1c', skill: 0.75 }] },
    ],
    outro: [['dex', '…Okay. Okay. You are good. Do not let it go to your head.']],
    rewards: { money: 15000, xp: 6000, rep: 4000, league: 'Gold' },
  },
  {
    id: 'm19', ch: 3, title: 'Takedown', type: 'Pursuit', giver: 'maya', level: 22, requires: ['m18'], start: { poi: 'police' },
    intro: [['maya', 'Stone is running. Black Crown, heading for the port. Units are en route but you are closer.'], ['maya', 'Stop that car. Whatever it takes — I am authorizing it.']],
    steps: [
      { t: 'ram', model: 'crown', color: '#0f1114', from: { x: 165, z: -120, yaw: 0 }, text: "Take down Stone's Crown", health: 0.85, limit: 240 },
    ],
    outro: [['maya', 'Garrick Stone is in custody. Riverton owes you one. I will deny ever saying that.']],
    rewards: { money: 20000, xp: 8000, rep: 5000 },
  },
  {
    id: 'm20', ch: 3, title: 'Riverton Legend', type: 'Driving', giver: 'nora', level: 22, requires: ['m19'], start: GARAGE,
    intro: [['nora', 'Everyone is at the Motor Club. Dex, Ines, Sam, even Lou. They are waiting for you.'], ['nora', 'Go on. You earned it.']],
    steps: [
      { t: 'goto', to: { poi: 'meet' }, r: 18, text: 'Drive to the Motor Club celebration', stop: true },
    ],
    outro: [['ines', 'Ladies and gentlemen — the driver who took down Stone Recovery!'], ['dex', 'Rematch next week.'], ['nora', 'Welcome home.']],
    rewards: { money: 25000, xp: 10000, rep: 8000, items: ['outfit_legend'], title: 'Riverton Legend' },
  },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

// repeatable side activities
export const SIDE_JOBS = [
  { id: 'job_delivery', title: 'Delivery Job', type: 'Delivery', giver: 'lou', desc: 'Deliver a package across the county before the timer runs out.', pay: [900, 2400] },
  { id: 'job_race', title: 'Street Race', type: 'Racing', giver: 'dex', desc: 'Quick sprint against a local racer.', pay: [1200, 3000] },
  { id: 'job_trial', title: 'Time Trial', type: 'Time trial', giver: 'sam', desc: 'Beat the target time on a random route.', pay: [800, 2000] },
  { id: 'job_taxi', title: 'Ride Share', type: 'Driving', giver: 'theo', desc: 'Pick up a passenger and drive them to their destination.', pay: [600, 1500] },
];
