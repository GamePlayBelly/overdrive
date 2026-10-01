import json, os, sys, urllib.request, hashlib

# CC0 PBR textures from Poly Haven (diffuse, GL normal, packed AO/rough/metal) at 1k JPG.
IDS = ['asphalt_02', 'concrete_floor_worn_001', 'square_tiles_03', 'leafy_grass', 'brown_mud_dry', 'gravel_floor_02', 'coast_sand_01',
       'red_brick_03', 'beige_wall_001', 'corrugated_iron', 'roof_slates_03', 'tarred_gravel', 'rock_05', 'bark_brown_02']
DEST = os.path.join('data', '_tex', 'src')
os.makedirs(DEST, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0'}
total = 0
for k in IDS:
    meta = json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.polyhaven.com/files/{k}', headers=UA), timeout=60))
    for key, name in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')):
        f = meta[key]['1k']['jpg']
        out = os.path.join(DEST, f'{k}_{name}.jpg')
        if os.path.exists(out) and os.path.getsize(out) == f['size']:
            total += f['size']; continue
        data = urllib.request.urlopen(urllib.request.Request(f['url'], headers=UA), timeout=120).read()
        if hashlib.md5(data).hexdigest() != f['md5']: print('md5 mismatch', k, name)
        open(out, 'wb').write(data)
        total += len(data)
    print(k, 'ok', round(total / 1048576, 1), 'MB so far')
print('total MB', round(total / 1048576, 1))
