"""主人近景 v5：A2 Q 版 49 格 → 遊戲用的 sheet（只做平移對齊，不改像素內容）

用法：python3 tools/build_owner_v5.py <A2_Q_Pack＋A3_Pack 合併資料夾> assets/owner_v5

- 以耳朵＋頭髮做模板比對，量出每格相對 sleeping_00 的位移
- awake_02～12 整組往下偏了約 20px（頭在驚醒時反而往下掉）→ 平移回來，和前兩格對齊
- A3 包 awake_13～18 一樣偏 20～27px → 平移回來；awake_16 是「抬頭」，用 13～15 的共同位移，保留抬頭的動作
- 每組排成 4 欄格狀 sheet；同時輸出 owner_raw_*（未修正）、owner_alignment.json、owner_issues.json
"""
import sys, os, glob, json, math, cv2, numpy as np
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
FS, COLS = 512, 4
STATES = ['sleeping', 'restless', 'peek', 'awake']
OVERRIDE = {'awake_16': (3, 20)}   # 用指定位移（保留抬頭）
load = lambda f: np.array(Image.open(f).convert('RGBA'))
def gray(a): return cv2.cvtColor(np.clip(a[..., :3].astype(np.float32) * a[..., 3:] / 255, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
T = gray(load(os.path.join(SRC, 'owner_closeup_sleeping_00.png')))[150:260, 100:220]
def offset(a):
    r = cv2.matchTemplate(gray(a), T, cv2.TM_CCOEFF_NORMED); _, mv, _, ml = cv2.minMaxLoc(r)
    return ml[0] - 100, ml[1] - 150, float(mv)
def shift(a, dx, dy):
    out = np.zeros_like(a); H, W = a.shape[:2]
    ys, yd = (slice(dy, H), slice(0, H - dy)) if dy >= 0 else (slice(0, H + dy), slice(-dy, H))
    xs, xd = (slice(dx, W), slice(0, W - dx)) if dx >= 0 else (slice(0, W + dx), slice(-dx, W))
    out[yd, xd] = a[ys, xs]; return out
def sheet(frames):
    rows = math.ceil(len(frames) / COLS); s = np.zeros((rows * FS, COLS * FS, 4), np.uint8)
    for i, f in enumerate(frames): s[(i // COLS) * FS:(i // COLS + 1) * FS, (i % COLS) * FS:(i % COLS + 1) * FS] = f
    return s
os.makedirs(OUT, exist_ok=True); report, issues = {}, {}
for st in STATES:
    files = sorted(glob.glob(os.path.join(SRC, f'owner_closeup_{st}_*.png')))
    frames, raws, rows = [], [], []
    for i, f in enumerate(files):
        a = load(f); raws.append(a); dx, dy, sc = offset(a)
        key = os.path.basename(f)[14:-4]
        if key in OVERRIDE: dx, dy = OVERRIDE[key]
        if abs(dx) + abs(dy) > 4:
            frames.append(shift(a, dx, dy)); rows.append({'frame': i, 'fixed': True, 'shift': [-dx, -dy], 'matchScore': round(sc, 3)})
        else:
            frames.append(a); rows.append({'frame': i, 'fixed': False})
        # 問題偵測：畫布邊被切到（左邊頭髮、下面棉被本來就出血 → 只記錄上、右）
        al = frames[-1][..., 3]
        issues.setdefault(st, []).append([{'type': 'fragment', 'label': '超出畫布被切到', 'box': [0, 0, FS, 6]}] if al[0].max() > 40 or al[:, -1].max() > 40 else [])
    Image.fromarray(sheet(frames)).save(f'{OUT}/owner_{st}.webp', quality=90, method=6)
    Image.fromarray(sheet(raws)).save(f'{OUT}/owner_raw_{st}.webp', quality=90, method=6)
    report[st] = {'frames': rows}
    print(st, len(frames), [(r['frame'], r['shift']) for r in rows if r['fixed']])
json.dump({'frameSize': FS, 'columns': COLS, 'sets': report}, open(f'{OUT}/owner_alignment.json', 'w'), ensure_ascii=False, indent=1)
json.dump(issues, open(f'{OUT}/owner_issues.json', 'w'), ensure_ascii=False, indent=1)
