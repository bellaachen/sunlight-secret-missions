"""新房間（C 包）→ 遊戲素材
用法：python3 tools/build_room2.py <C包資料夾> assets/bedroom
- bedroom_empty_bed.png → bedroom_full.webp（背景，床上沒有人）
- 遮擋圖（扣掉床上主人圖層蓋到的地方）：依 scene_config.json 的 occluders[].silhouette（或 mask 橢圓）從房間圖剪出 → overlay_*.webp + overlays.json
- 主人全景圖層 owner_scene_{sleeping,restless,awake}_NN.png → 裁到聯集範圍、2 欄 sheet → owner_scene_*.webp + owner_scene.json
"""
import sys, os, json, glob, math
import numpy as np
from PIL import Image, ImageDraw
SRC, OUT = sys.argv[1], sys.argv[2]
cfg = json.load(open(os.path.join(OUT, 'scene_config.json')))
room = Image.open(os.path.join(SRC, 'bedroom_empty_bed.png')).convert('RGBA')
room.convert('RGB').save(os.path.join(OUT, 'bedroom_full.webp'), quality=90, method=6)

# 床上主人的棉被會蓋在書桌抽屜、椅子前面 → 遮擋圖扣掉「任何一幀主人圖層有畫到」的地方，免得家具蓋到棉被上
OWNER_U = np.zeros((room.size[1], room.size[0]), bool)
for f in glob.glob(os.path.join(SRC, 'owner_scene_*.png')): OWNER_U |= np.array(Image.open(f).getchannel('A')) > 40
meta = {}
for o in cfg['occluders']:
    m = Image.new('L', room.size, 0); d = ImageDraw.Draw(m)
    if 'silhouette' in o: d.polygon([tuple(p) for p in o['silhouette']], fill=255)
    else:
        e = cfg['masks'][o['mask']]; d.ellipse([e['x']-e['rx'], e['y']-e['ry'], e['x']+e['rx'], e['y']+e['ry']], fill=255)
    m = Image.fromarray(np.where(OWNER_U, 0, np.array(m)).astype(np.uint8))
    x0, y0, x1, y1 = m.getbbox()
    im = room.copy(); im.putalpha(m)
    im.crop((x0, y0, x1, y1)).save(os.path.join(OUT, f"overlay_{o['overlay']}.webp"), quality=90, method=6)
    meta[o['overlay']] = {'x': x0, 'y': y0, 'w': x1-x0, 'h': y1-y0}
json.dump(meta, open(os.path.join(OUT, 'overlays.json'), 'w'), indent=1)

sets = {s: sorted(glob.glob(os.path.join(SRC, f'owner_scene_{s}_*.png'))) for s in ('sleeping', 'restless', 'awake')}
bb = None
for fs in sets.values():
    for f in fs:
        b = Image.open(f).getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
x0, y0 = bb[0] - 4, bb[1] - 4; W, H = bb[2] - x0 + 4, bb[3] - y0 + 4; COLS = 2
sm = {'x': x0, 'y': y0, 'frameWidth': W, 'frameHeight': H, 'columns': COLS, 'frames': {}}
for s, fs in sets.items():
    rows = math.ceil(len(fs) / COLS); sh = Image.new('RGBA', (COLS * W, rows * H), (0, 0, 0, 0))
    for i, f in enumerate(fs):
        sh.paste(Image.open(f).convert('RGBA').crop((x0, y0, x0 + W, y0 + H)), ((i % COLS) * W, (i // COLS) * H))
    sh.save(os.path.join(OUT, f'owner_scene_{s}.webp'), quality=88, method=6)
    sm['frames'][s] = len(fs)
json.dump(sm, open(os.path.join(OUT, 'owner_scene.json'), 'w'), indent=1)
print(meta, sm)
