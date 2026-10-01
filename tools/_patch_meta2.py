def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/data/meta.js', [
    ("name: 'Spare Key — Calder Pass Overlook', x: 430, z: -770 }", "name: 'Spare Key — Calder Pass Overlook', x: 418, z: -724 }"),
    ("name: 'Spare Key — Dry Springs Windmill', x: 3128, z: 112 }", "name: 'Spare Key — Dry Springs Windmill', x: 3222, z: 136 }"),
    ("name: 'Riverton Token — Sierra Switchback', x: 1905, z: -188 }", "name: 'Riverton Token — Sierra Switchback', x: 1870, z: -197 }"),
    ("name: 'Riverton Token — Ski Lift', x: -150, z: -1952 }", "name: 'Riverton Token — Ski Lift', x: -132, z: -1921 }"),
    ("name: 'Riverton Token — Mesa Overlook', x: 3466, z: 84 }", "name: 'Riverton Token — Mesa Overlook', x: 3471, z: 87 }"),
    ("name: 'Riverton Token — Bayline Pylon', x: -1380, z: -440 }", "name: 'Riverton Token — Bayline Pylon', x: -1380, z: -414 }"),
    ("name: 'Riverton Token — Marin Beach', x: -2160, z: -70 }", "name: 'Riverton Token — Marin Beach', x: -2163, z: -71 }"),
    ("name: 'Rare Plate \"MESA\"', x: 2900, z: 162 }", "name: 'Rare Plate \"MESA\"', x: 2912, z: 162 }"),
    ("{ id: 'hl_pass', name: 'Pass Hideout', x: -190, z: -930, desc: 'A cabin tucked behind the second switchback of Route 12.' }",
     "{ id: 'hl_pass', name: 'Switchback Lookout', x: -190, z: -930, desc: 'Most drivers rush past this bend of Route 12. The view over the pass is worth the stop.' }"),
    ("{ id: 'hl_quarry', name: 'Desert Quarry', x: 3250, z: 135, desc: 'An old quarry road that nobody patrols.' }",
     "{ id: 'hl_quarry', name: 'Mesa Overlook', x: 3250, z: 135, desc: 'The last bend before Route 40 drops into the desert. Nobody patrols it.' }"),
    ("x: 3252, z: 142, yaw: 1.6, cond: { level: 10 }, story: 'A desert racer left it at the quarry road. It idles like it is waiting for someone.' }",
     "x: 3249, z: 147, yaw: 1.6, cond: { level: 10 }, story: 'A desert racer left it at the roadside. It idles like it is waiting for someone.' }"),
    ("pts: [[-960, -420], [-1300, -420], [-1650, -420], [-1850, -420]]", "pts: [[-960, -420], [-1339.4, -420], [-1719.2, -420], [-1870, -420]]"),
    ("pts: [[-55, -560], [353, -786], [-191, -930], [138, -1094], [-4, -1258], [183, -1563], [-40, -1610]]", "pts: [[-55, -560], [298.2, -819.7], [-257.1, -945], [200.6, -1108.2], [-64.2, -1271.5], [222.9, -1555], [-40, -1610]]"),
    ("pts: [[1000, 55], [1542, 4], [1725, -277], [1975, -511], [2408, -202], [2740, 150]]", "pts: [[1000, 55], [1560, -0.5], [1693, -293.5], [2024.4, -505.5], [2447.2, -144.5], [2740, 150]]"),
])
print('ok')
