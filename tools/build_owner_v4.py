"""主人近景 v4（直髮、熊熊棉被）：A 包更新版 38 格 + 過渡幀 11 格

（由 build_owner_v3.py 改寫）原說明：主人近景 v3：A 包 38 格 + 過渡幀 9 格 → 遊戲用的 sheet（只做縮放對齊，不改像素內容）

用法：python3 tools/build_owner_v4.py <A包更新版資料夾> <過渡幀資料夾> assets/owner_v4

- 依動作順序插入過渡幀（見 SEQ）
- 不安的 4 張過渡格畫小了（約 0.8×）→ 以臉部模板比對，等比放大並把臉對回 (256,256)
- 其他格已經對齊在 (256,256)，原樣使用
- 每組排成 4 欄的格狀 sheet（避免超過 GPU 貼圖寬度上限）
- 同時輸出 owner_raw_*（未修正，測試模式比對用）、owner_alignment.json、owner_issues.json
"""
import sys, os, json, math, cv2, numpy as np
from PIL import Image

A, TW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FS, COLS, ANCHOR = 512, 4, (256, 256)
SEQ = {
    'sleeping': [f'sleeping_{k:02d}' for k in range(8)],
    'restless': ['restless_00', 'restless_01', 'T:restless_tween_a_00', 'T:restless_tween_a_01'] + [f'restless_{k:02d}' for k in range(2, 10)]
                + ['T:restless_tween_b_00', 'T:restless_tween_b_01', 'restless_10', 'restless_11'],
    'peek': ['peek_00', 'peek_01', 'T:peek_tween_a_00', 'T:peek_tween_a_01', 'peek_02', 'peek_03', 'peek_04', 'peek_05',
             'T:peek_tween_b_00', 'T:peek_tween_b_01', 'peek_06', 'peek_07'],
    'awake': [f'awake_{k:02d}' for k in range(5)] + ['T:awake_tween_00', 'T:awake_tween_01', 'T:awake_tween_02'] + [f'awake_{k:02d}' for k in range(5, 10)],
}
# 過渡幀（11 格）位置偏下偏左 15～35px → 平移到前後格之間，讓動作平均分配（比例相同，不縮放）
AFFINE = {'awake_02': (1.18, 40.3, -54.7), 'restless_tween_a_00': (1.0, 15.7, -22.3), 'restless_tween_a_01': (1.0, 10.3, -17.7), 'restless_tween_b_00': (1.0, 10.0, -18.7), 'restless_tween_b_01': (1.0, 15.0, -24.3), 'peek_tween_a_00': (1.0, 20.0, -34.7), 'peek_tween_a_01': (1.0, 31.0, -30.3), 'peek_tween_b_00': (1.0, 32.7, -5.0), 'peek_tween_b_01': (1.0, 12.3, -34.0), 'awake_tween_00': (1.0, 26.8, -33.5), 'awake_tween_01': (1.0, 30.5, -6.0), 'awake_tween_02': (1.0, 32.2, -32.5)}
FIX = {}

def load(name):
    d = TW if name.startswith('T:') else A
    return np.array(Image.open(os.path.join(d, 'owner_closeup_' + name.replace('T:', '') + '.png')).convert('RGBA')).astype(np.float32)

gray = lambda a: cv2.cvtColor(np.clip(a[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
REF = load('sleeping_00')
T = gray(REF)[206:306, 176:336]

def match(a):
    best = None
    for s in np.arange(0.74, 1.12, 0.01):
        t = cv2.resize(T, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        r = cv2.matchTemplate(gray(a), t, cv2.TM_CCOEFF_NORMED); _, mv, _, ml = cv2.minMaxLoc(r)
        if best is None or mv > best[0]: best = (mv, s, ml[0] + t.shape[1] / 2, ml[1] + t.shape[0] / 2)
    return best

def warp(a, k, tx, ty):
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4] / 255
    w = cv2.warpAffine(pm, np.float32([[k, 0, tx], [0, k, ty]]), (FS, FS), flags=cv2.INTER_LANCZOS4,
                       borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    w[..., 3] = np.clip(w[..., 3], 0, 255); al = w[..., 3:4]
    w[..., :3] = np.where(al > 0.5, w[..., :3] * 255 / np.maximum(al, 1e-3), 0)
    return np.clip(w, 0, 255).astype(np.uint8)

def detect(f):
    a = f[:, :, 3]; issues = []
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 100).astype(np.uint8), 8)
    if n > 1:
        main = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        for i in range(1, n):
            x, y, w, h, area = st[i]
            if i != main and area >= 40: issues.append({'type': 'fragment', 'label': '殘留碎片', 'box': [int(x), int(y), int(w), int(h)]})
    edge = cv2.dilate((a < 40).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & (a > 40)
    white = edge & (f[:, :, :3].min(2) > 235)
    if white.sum() > 200:
        ys, xs = np.where(white)
        issues.append({'type': 'halo', 'label': '淺色邊緣（可能是白睡衣）', 'box': [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]})
    if a[0].max() > 40 or a[:, 0].max() > 40 or a[:, -1].max() > 40:
        issues.append({'type': 'fragment', 'label': '超出畫布被切到', 'box': [0, 0, FS, 6]})
    return issues

def sheet(frames):
    rows = math.ceil(len(frames) / COLS)
    out = np.zeros((rows * FS, COLS * FS, 4), np.uint8)
    for i, f in enumerate(frames): out[(i // COLS) * FS:(i // COLS + 1) * FS, (i % COLS) * FS:(i % COLS + 1) * FS] = f
    return out

os.makedirs(OUT, exist_ok=True)
report, issues = {}, {}
for state, names in SEQ.items():
    frames, raws, rows = [], [], []
    for i, n in enumerate(names):
        a = load(n); raws.append(np.clip(a, 0, 255).astype(np.uint8))
        key = n.replace('T:', '')
        if key in AFFINE:
            k, tx, ty = AFFINE[key]
            frames.append(warp(a, k, tx, ty))
            rows.append({'frame': i, 'file': key, 'fixed': True, 'scale': k, 'translate': [tx, ty]})
        elif key in FIX:
            score, s, cx, cy = match(a); k = 1 / s
            ax, ay = FIX[key]
            tx, ty = ax - cx * k, ay - cy * k
            frames.append(warp(a, k, tx, ty))
            rows.append({'frame': i, 'file': key, 'fixed': True, 'scale': round(k, 3), 'translate': [round(tx, 1), round(ty, 1)], 'matchScore': round(float(score), 3)})
        else:
            frames.append(raws[-1]); rows.append({'frame': i, 'file': key, 'fixed': False})
    Image.fromarray(sheet(frames)).save(f'{OUT}/owner_{state}.webp', quality=90, method=6)
    Image.fromarray(sheet(raws)).save(f'{OUT}/owner_raw_{state}.webp', quality=90, method=6)
    report[state] = {'frames': rows}
    issues[state] = [detect(f) for f in frames]
    print(state, len(frames), 'frames', [(r['file'], r['scale']) for r in rows if r['fixed']])
json.dump({'anchor': ANCHOR, 'frameSize': FS, 'columns': COLS, 'sets': report}, open(f'{OUT}/owner_alignment.json', 'w'), ensure_ascii=False, indent=1)
json.dump(issues, open(f'{OUT}/owner_issues.json', 'w'), ensure_ascii=False, indent=1)
