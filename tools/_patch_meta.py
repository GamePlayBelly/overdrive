def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/data/meta.js', [
    ("  { id: 'pho03', type: 'photo', name: 'Photo Spot — Founders Fountain', x: 0, z: 12, photo: true },\n];",
     """  { id: 'pho03', type: 'photo', name: 'Photo Spot — Founders Fountain', x: 0, z: 12, photo: true },
  // outer regions
  { id: 'key06', type: 'key', name: 'Spare Key — Calder Pass Overlook', x: 430, z: -770 },
  { id: 'key07', type: 'key', name: 'Spare Key — Alder Peak Chapel', x: -84, z: -1655 },
  { id: 'key08', type: 'key', name: 'Spare Key — Dry Springs Windmill', x: 3128, z: 112 },
  { id: 'key09', type: 'key', name: 'Spare Key — Marin Point Light', x: -2228, z: -925 },
  { id: 'tok07', type: 'token', name: 'Riverton Token — Sierra Switchback', x: 1905, z: -188 },
  { id: 'tok08', type: 'token', name: 'Riverton Token — Ski Lift', x: -150, z: -1952 },
  { id: 'tok09', type: 'token', name: 'Riverton Token — Mesa Overlook', x: 3466, z: 84 },
  { id: 'tok10', type: 'token', name: 'Riverton Token — Bayline Pylon', x: -1380, z: -440 },
  { id: 'tok11', type: 'token', name: 'Riverton Token — Marin Beach', x: -2160, z: -70 },
  { id: 'plt04', type: 'plate', name: 'Rare Plate "ALDER"', x: -40, z: -1745 },
  { id: 'plt05', type: 'plate', name: 'Rare Plate "MESA"', x: 2900, z: 162 },
  { id: 'pho04', type: 'photo', name: 'Photo Spot — Bayline Bridge', x: -1400, z: -426, photo: true },
  { id: 'pho05', type: 'photo', name: 'Photo Spot — Alder Peak at Dawn', x: 183, z: -1563, photo: true },
  { id: 'pho06', type: 'photo', name: 'Photo Spot — Mesa Sunset', x: 2408, z: -202, photo: true },
];"""),
    ("  { id: 'hl_barn', name: 'Old Barn', x: 1170, z: 180, desc: 'Somebody keeps a car under a tarp here.' },\n];",
     """  { id: 'hl_barn', name: 'Old Barn', x: 1170, z: 180, desc: 'Somebody keeps a car under a tarp here.' },
  { id: 'hl_pass', name: 'Pass Hideout', x: -190, z: -930, desc: 'A cabin tucked behind the second switchback of Route 12.' },
  { id: 'hl_quarry', name: 'Desert Quarry', x: 3250, z: 135, desc: 'An old quarry road that nobody patrols.' },
];"""),
    ("export const DYNAMIC_EVENTS = [", """RARE_VEHICLES.push(
  { id: 'rare_mesa_arc', model: 'arc', color: '#d9a21b', name: 'Mesa Mirage Arc', x: 3252, z: 142, yaw: 1.6, cond: { level: 10 }, story: 'A desert racer left it at the quarry road. It idles like it is waiting for someone.' },
  { id: 'rare_snow_ridge', model: 'ridge', color: '#e8eaee', name: 'Snow Wolf Ridge', x: -66, z: -1604, yaw: 0.2, cond: { level: 14, night: true }, story: 'The ski patrol vehicle that vanished one winter. It parks outside Alder Peak after dark.' },
);

export const DYNAMIC_EVENTS = ["""),
    ("rivals: ['dex', 'kira', 'hector'] }] },\n  { rank: 'Platinum'", "rivals: ['dex', 'kira', 'hector'] }, { id: 'lg_g2', name: 'Bayline Dash', pts: [[-960, -420], [-1300, -420], [-1650, -420], [-1850, -420]], rivals: ['dex', 'kira'] }] },\n  { rank: 'Platinum'"),
    ("rivals: ['dex', 'kira', 'lena'] }] },\n  { rank: 'Elite'", "rivals: ['dex', 'kira', 'lena'] }, { id: 'lg_p2', name: 'Calder Hillclimb', pts: [[-55, -560], [353, -786], [-191, -930], [138, -1094], [-4, -1258], [183, -1563], [-40, -1610]], rivals: ['dex', 'lena', 'kira'] }] },\n  { rank: 'Elite'"),
    ("rivals: ['dex', 'lena', 'kira'] }] },\n];", "rivals: ['dex', 'lena', 'kira'] }, { id: 'lg_e2', name: 'Mesa Run', pts: [[1000, 55], [1542, 4], [1725, -277], [1975, -511], [2408, -202], [2740, 150]], rivals: ['dex', 'lena', 'kira'] }] },\n];"),
])
print('ok')
