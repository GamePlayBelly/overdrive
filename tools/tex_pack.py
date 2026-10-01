import os, json
import numpy as np
from PIL import Image, ImageFilter

SRC = os.path.join('data', '_tex', 'src')
OUT = os.path.join('assets', 'tex')
os.makedirs(OUT, exist_ok=True)
# key -> (Poly Haven id, tile size in metres)
MAP = {
    'asphalt': ('asphalt_02', 3.0), 'concrete': ('concrete_floor_worn_001', 3.0), 'pavers': ('square_tiles_03', 2.0), 'grass': ('leafy_grass', 2.0),
    'dirt': ('brown_mud_dry', 1.3), 'gravel': ('gravel_floor_02', 2.0), 'sand': ('coast_sand_01', 15.0), 'brick': ('red_brick_03', 1.0),
    'stucco': ('beige_wall_001', 3.0), 'corr': ('corrugated_iron', 1.12), 'shingles': ('roof_slates_03', 3.0), 'membrane': ('tarred_gravel', 2.2), 'rock': ('rock_05', 1.5), 'bark': ('bark_brown_02', 1.0),
}
# mean colour of the procedural textures these replace: the palette tints in the world assume it, so the photos keep the look and add the detail
PROC = {
    'concrete': (0.676, 0.668, 0.645), 'pavers': (0.59, 0.481, 0.441), 'grass': (0.32, 0.41, 0.17), 'dirt': (0.47, 0.38, 0.27), 'sand': (0.78, 0.7, 0.54),
    'brick': (0.822, 0.78, 0.744), 'stucco': (0.834, 0.821, 0.8), 'shingles': (0.641, 0.641, 0.641), 'membrane': (0.583, 0.583, 0.571), 'rock': (0.47, 0.42, 0.36), 'bark': (0.42, 0.33, 0.25),
}
S = 512
# flat-field: divide out the large-scale brightness of the scan (wrap-around blur) so repeated tiles do not show as a grid
FLAT = {'grass': 0.95, 'dirt': 0.9, 'sand': 0.9, 'gravel': 0.8, 'rock': 0.8, 'concrete': 0.9, 'stucco': 0.9, 'membrane': 0.9, 'asphalt': 0.7, 'bark': 0.6}
def flatten(d, strength):
    img = Image.fromarray((np.clip(d, 0, 1) * 255 + 0.5).astype(np.uint8))
    big = Image.new('RGB', (S * 3, S * 3))
    for i in range(3):
        for j in range(3): big.paste(img, (i * S, j * S))
    low = np.asarray(big.filter(ImageFilter.GaussianBlur(S / 7)).crop((S, S, 2 * S, 2 * S))).astype(np.float32) / 255.0
    mean = low.reshape(-1, 3).mean(0)
    return d * (mean / np.maximum(low, 0.02)) ** strength
index = {}
for key, (pid, size) in MAP.items():
    diff = Image.open(os.path.join(SRC, f'{pid}_diff.jpg')).convert('RGB').resize((S, S), Image.LANCZOS)
    nor = Image.open(os.path.join(SRC, f'{pid}_nor.jpg')).convert('RGB').resize((S, S), Image.LANCZOS)
    arm = Image.open(os.path.join(SRC, f'{pid}_arm.jpg')).convert('RGB').resize((S, S), Image.LANCZOS)
    d = np.asarray(diff).astype(np.float32) / 255.0
    a = np.asarray(arm).astype(np.float32) / 255.0
    n = np.asarray(nor).astype(np.uint8)
    ao = a[..., 0:1]
    d = d * (1.0 - 0.7 * (1.0 - ao))
    if key in FLAT: d = flatten(d, FLAT[key])
    if key in PROC:
        g = np.array(PROC[key], dtype=np.float32) / np.maximum(d.reshape(-1, 3).mean(0), 1e-4)
        d = d * g
        d = np.where(d > 0.8, 0.8 + (1 - np.exp(-(d - 0.8) * 5)) * 0.2 / 1.0, d)
    Image.fromarray((np.clip(d, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{key}.jpg'), quality=90, optimize=True)
    nr = np.dstack([n[..., 0], n[..., 1], (a[..., 1] * 255 + 0.5).astype(np.uint8)])
    Image.fromarray(nr).save(os.path.join(OUT, f'{key}_n.png'), optimize=True)
    mean = float(np.clip(d, 0, 1).mean())
    index[key] = {'src': pid, 'size': size, 'mean': round(mean, 3)}
    print(key, pid, 'mean albedo', round(mean, 3), 'rough', round(float(a[..., 1].mean()), 2))
json.dump({'license': 'CC0 1.0, Poly Haven (polyhaven.com)', 'textures': index}, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('assets/tex', round(tot / 1048576, 2), 'MB')
