"""全景呼吸圖層：把 Breathing Prototype v2 的 8 張 1672×941 圖層裁成實際範圍，排成一張 sheet
用法：python3 tools/build_breathing.py <Breathing_Prototype_v2/assets/bedroom> assets/bedroom"""
import sys, json
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
frames = [Image.open(f'{SRC}/owner_breathing_full_{k:02d}.png').convert('RGBA') for k in range(8)]
box = frames[0].getbbox()
for f in frames[1:]:
    b = f.getbbox(); box = (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
w, h = box[2] - box[0], box[3] - box[1]
sheet = Image.new('RGBA', (w * 8, h), (0, 0, 0, 0))
for k, f in enumerate(frames): sheet.paste(f.crop(box), (k * w, 0))
sheet.save(f'{OUT}/owner_breathing.webp', quality=92, method=6)
json.dump({'x': box[0], 'y': box[1], 'frameWidth': w, 'frameHeight': h, 'frames': 8, 'cycleMs': 3600}, open(f'{OUT}/owner_breathing.json', 'w'), indent=1)
print(box, w, h)
