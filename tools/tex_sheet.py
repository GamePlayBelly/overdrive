import sys, os, io, urllib.request
from PIL import Image, ImageDraw

ids = sys.argv[2:]
out = sys.argv[1]
cols = 6
S = 220
rows = (len(ids) + cols - 1) // cols
sheet = Image.new('RGB', (cols * S, rows * (S + 18)), (20, 20, 20))
dr = ImageDraw.Draw(sheet)
for i, k in enumerate(ids):
    try:
        req = urllib.request.Request(f'https://cdn.polyhaven.com/asset_img/thumbs/{k}.png?width=256&height=256', headers={'User-Agent': 'Mozilla/5.0'})
        im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert('RGB').resize((S, S))
    except Exception as e:
        im = Image.new('RGB', (S, S), (80, 0, 0)); print('fail', k, e)
    x, y = (i % cols) * S, (i // cols) * (S + 18)
    sheet.paste(im, (x, y))
    dr.text((x + 3, y + S + 3), k, fill=(255, 255, 255))
sheet.save(out)
print('saved', out)
