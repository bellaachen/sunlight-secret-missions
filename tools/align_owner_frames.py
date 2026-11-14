"""主人動畫對齊工具（只做幾何對齊：等比縮放＋平移，不改任何像素內容）

問題：三組動畫的人物比例不同（Restless ≈1.07×、Awake ≈0.96×），且 Sleeping 3–4、Restless 整段有臉部位置漂移。
做法：以 sleeping_0 的臉部為模板，用多尺度模板比對找出每一幀的臉部中心；
      每組用固定縮放（該組可信幀的中位數），每幀平移讓臉部中心對到同一點。
      Awake 7–9 是坐起來的動作，沿用第 6 幀的平移，保留起身的位移。
用法：python3 tools/align_owner_frames.py <Owner_Animation_Pack/assets/sheets> assets/owner
"""
import sys, json, cv2, numpy as np
SRC, OUT = sys.argv[1], sys.argv[2]
FW, FH = 256, 192
SETS = {'sleeping': 8, 'restless': 12, 'awake': 10}
HOLD_FROM = {'awake': 6}          # 這一幀之後沿用同一個平移（保留坐起來的動作）

def frames(n):
    im = cv2.imread(f'{SRC}/owner_{n}.png', cv2.IMREAD_UNCHANGED)
    return [im[:, k * FW:(k + 1) * FW] for k in range(SETS[n])]
gray = lambda f: cv2.cvtColor(f[:, :, :3], cv2.COLOR_BGR2GRAY)
ref = frames('sleeping')[0]
TY0, TY1, TX0, TX1 = 70, 150, 110, 200
T = gray(ref)[TY0:TY1, TX0:TX1]
ANCHOR = ((TX0 + TX1) / 2, (TY0 + TY1) / 2)   # 臉部中心要對到的位置

def match(f):
    best = None
    for s in np.arange(0.84, 1.16, 0.01):
        t = cv2.resize(T, None, fx=s, fy=s)
        r = cv2.matchTemplate(gray(f), t, cv2.TM_CCOEFF_NORMED)
        _, mv, _, ml = cv2.minMaxLoc(r)
        if best is None or mv > best[0]:
            best = (mv, s, ml[0] + t.shape[1] / 2, ml[1] + t.shape[0] / 2)
    return best

report = {}
for n, count in SETS.items():
    fs = frames(n)
    m = [match(f) for f in fs]
    good = [x[1] for x in m if x[0] >= 0.9] or [x[1] for x in m]
    scale = float(np.median(good))
    k = 1.0 / scale
    out = np.zeros((FH, FW * count, 4), np.uint8)
    rows = []
    hold = None
    for i, (f, (score, s, cx, cy)) in enumerate(zip(fs, m)):
        if n in HOLD_FROM and i > HOLD_FROM[n] and hold is not None:
            tx, ty = hold
        else:
            tx, ty = ANCHOR[0] - cx * k, ANCHOR[1] - cy * k
            if n in HOLD_FROM and i == HOLD_FROM[n]: hold = (tx, ty)
        M = np.float32([[k, 0, tx], [0, k, ty]])
        # 預乘 alpha 再縮放，避免邊緣出現暗邊
        pm = f.astype(np.float32); pm[:, :, :3] *= pm[:, :, 3:4] / 255
        w = cv2.warpAffine(pm, M, (FW, FH), flags=cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        a = w[:, :, 3:4]
        w[:, :, :3] = np.where(a > 0, w[:, :, :3] * 255 / np.maximum(a, 1e-3), 0)
        out[:, i * FW:(i + 1) * FW] = np.clip(w, 0, 255).astype(np.uint8)
        rows.append({'frame': i, 'matchScore': round(float(score), 3), 'faceBefore': [round(cx, 1), round(cy, 1)],
                     'scale': round(k, 4), 'translate': [round(float(tx), 1), round(float(ty), 1)]})
    cv2.imwrite(f'{OUT}/owner_{n}.png', out)
    report[n] = {'setScale': round(scale, 3), 'frames': rows}
json.dump({'anchor': ANCHOR, 'frameWidth': FW, 'frameHeight': FH, 'sets': report},
          open(f'{OUT}/owner_alignment.json', 'w'), indent=1)
print({n: r['setScale'] for n, r in report.items()})

# ---------- 去背問題自動偵測（寫進 owner_issues.json，測試模式會逐幀標示） ----------
def detect(f):
    a = f[:, :, 3]
    issues = []
    solid = (a > 100).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid, 8)
    if n > 1:
        main = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        for i in range(1, n):
            x, y, w, h, area = st[i]
            if i != main and area >= 12:
                issues.append({'type': 'fragment', 'label': '殘留碎片／標註線', 'box': [int(x), int(y), int(w), int(h)]})
        # 洞：主體內部的透明區（沒有連到畫面邊緣）
        holes = (lab != main).astype(np.uint8)
        hn, hl, hs, _ = cv2.connectedComponentsWithStats(holes, 4)
        for i in range(1, hn):
            x, y, w, h, area = hs[i]
            touches = x == 0 or y == 0 or x + w >= f.shape[1] or y + h >= f.shape[0]
            if not touches and area >= 10:
                issues.append({'type': 'hole', 'label': '去背破洞（會透出背景）', 'box': [int(x), int(y), int(w), int(h)]})
    # 底部半透明殘影（概念板的標籤底座）
    band = a[-16:]
    semi = (band > 15) & (band < 200)
    if semi.sum() > 120:
        ys, xs = np.where(semi)
        issues.append({'type': 'tab', 'label': '底部半透明殘影', 'box': [int(xs.min()), int(f.shape[0] - 16 + ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]})
    # 暗色殘邊：半透明且很暗的像素（深色背景沒去乾淨）
    dark = (a > 25) & (a < 215) & (f[:, :, :3].max(2) < 90)
    if dark.sum() > 60:
        ys, xs = np.where(dark)
        top = ys < np.percentile(ys, 60)
        issues.append({'type': 'halo', 'label': '暗色殘邊', 'box': [int(xs[top].min()), int(ys[top].min()), int(xs[top].max() - xs[top].min() + 1), int(ys[top].max() - ys[top].min() + 1)], 'pixels': int(dark.sum())})
    return issues

all_issues = {}
for n, count in SETS.items():
    sheet = cv2.imread(f'{OUT}/owner_{n}.png', cv2.IMREAD_UNCHANGED)
    all_issues[n] = [detect(sheet[:, k * FW:(k + 1) * FW]) for k in range(count)]
json.dump(all_issues, open(f'{OUT}/owner_issues.json', 'w'), ensure_ascii=False, indent=1)
summary = {n: {t: sum(1 for fr in v for i in fr if i['type'] == t) for t in ['hole', 'fragment', 'tab', 'halo']} for n, v in all_issues.items()}
print('issues', summary)
