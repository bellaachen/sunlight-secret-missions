"""主人近景動畫 v2：從 ChatGPT 的 38 格概念總表切出四組動畫（只做去背、去白邊、縮放對齊，不重畫）

用法：
  python3 tools/extract_owner_v2.py <總表.png> <Breathing_Prototype_v2/assets/closeup> assets/owner_v2

步驟：
  1. 每列等分、在預期邊界附近找空白縫切格（熟睡 8／不安 12／偷看 8／驚醒 10）
  2. 去白底：從格子邊緣往內 flood fill 接近白色的像素 → 透明；邊緣 2px 依「離白色多遠」估 alpha，並把白色混色扣掉（去白邊）
  3. 對齊：用 zip 近景熟睡第 1 幀的臉當模板，多尺度比對找出每格的臉部中心與比例；
     每列用固定比例（該列中位數），每格平移讓臉對到 ANCHOR；驚醒第 7–10 格（坐起來）水平沿用第 6 格、垂直只跟一半
  4. 輸出 512×512／幀 的 sheet（owner_{state}.webp）＋未對齊版（owner_raw_{state}.webp）＋對齊參數
"""
import sys, json, cv2, numpy as np
from PIL import Image

SHEET, CLOSEUP_DIR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FS = 512
ANCHOR = (256, 300)   # 臉部中心；偏下一點，驚醒坐起來時頭才不會超出畫布
ROWS = [('sleeping', 8, 52, 248), ('restless', 12, 330, 484), ('peek', 8, 550, 737), ('awake', 10, 768, 1000)]
HOLD_FROM = {'awake': 5}

sheet = np.array(Image.open(SHEET).convert('RGB')).astype(np.float32)
nonwhite = (sheet.min(2) < 232) | ((sheet.max(2) - sheet.min(2)) > 18)

def cut_cells():
    cells = {}
    for name, n, y0, y1 in ROWS:
        col = nonwhite[y0:y1].sum(0)
        xs = np.where(col > 0)[0]; L, R = xs.min(), xs.max()
        w = (R - L) / n; cuts = [L]
        for i in range(1, n):
            e = int(L + w * i); lo, hi = e - int(w * 0.18), e + int(w * 0.18)
            cuts.append(lo + int(np.argmin(col[lo:hi])))
        cuts.append(R + 1)
        cells[name] = [(cuts[i], y0, cuts[i + 1] - cuts[i], y1 - y0) for i in range(n)]
    return cells

def remove_white(crop):
    """crop: HxWx3 float → RGBA float（已去白邊）"""
    h, w = crop.shape[:2]
    near_white = ((crop.min(2) > 236) & ((crop.max(2) - crop.min(2)) < 14)).astype(np.uint8)
    n, lab = cv2.connectedComponents(near_white, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    fg = (~bg).astype(np.uint8)
    # 只保留最大的一塊（去掉相鄰格子切進來的細條）
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n2 > 1:
        main = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
        fg = (lab2 == main).astype(np.uint8)
    # 邊緣帶：前景中距離背景 ≤ 2px 的像素，用「離白色的距離」估 alpha
    dist = cv2.distanceTransform(fg, cv2.DIST_L2, 3)
    band = (fg > 0) & (dist <= 2.5)
    away = 255 - crop.min(2)                     # 越接近白色越小
    alpha = fg.astype(np.float32)
    alpha[band] = np.clip(away[band] / 70.0, 0, 1)
    # 去白邊：c = a*F + (1-a)*255 → F = (c - (1-a)*255) / a
    a3 = alpha[..., None]
    fgc = np.where(a3 > 0.02, (crop - (1 - a3) * 255) / np.maximum(a3, 0.02), 0)
    fgc = np.clip(fgc, 0, 255)
    return np.dstack([fgc, alpha * 255])

def gray(rgb): return cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)

# 臉部模板：zip 近景熟睡第 1 幀（512 座標）
ref = np.array(Image.open(f'{CLOSEUP_DIR}/owner_sleeping_front_00.png').convert('RGBA')).astype(np.float32)
TX0, TY0, TX1, TY1 = 180, 200, 360, 330
T = gray(ref[TY0:TY1, TX0:TX1, :3])
REF_FACE = ((TX0 + TX1) / 2, (TY0 + TY1) / 2)

def match(cell_rgb):
    g = gray(cell_rgb); best = None
    for s in np.arange(0.22, 0.75, 0.01):
        t = cv2.resize(T, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        if t.shape[0] >= g.shape[0] or t.shape[1] >= g.shape[1]: continue
        r = cv2.matchTemplate(g, t, cv2.TM_CCOEFF_NORMED); _, mv, _, ml = cv2.minMaxLoc(r)
        if best is None or mv > best[0]: best = (mv, s, ml[0] + t.shape[1] / 2, ml[1] + t.shape[0] / 2)
    return best

def warp(rgba, k, tx, ty):
    pm = rgba.copy(); pm[..., :3] *= pm[..., 3:4] / 255
    M = np.float32([[k, 0, tx], [0, k, ty]])
    w = cv2.warpAffine(pm, M, (FS, FS), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    w[..., 3] = np.clip(w[..., 3], 0, 255)
    a = w[..., 3:4]
    w[..., :3] = np.where(a > 0.5, w[..., :3] * 255 / np.maximum(a, 1e-3), 0)
    return np.clip(w, 0, 255).astype(np.uint8)

cells = cut_cells()
report = {}
for name, n, _, _ in ROWS:
    pad = 2
    crops = []
    for (x, y, w, h) in cells[name]:
        x0, y0 = max(0, x - pad), max(0, y - pad)
        crops.append((sheet[y0:y + h + pad, x0:x + w + pad], (x0, y0)))
    m = [match(c[0]) for c in crops]
    good = [q[1] for q in m if q[0] >= 0.6] or [q[1] for q in m]
    s_row = float(np.median(good)); k = 1.0 / s_row
    out = np.zeros((FS, FS * n, 4), np.uint8); raw = np.zeros_like(out)
    rows = []; hold = None
    for i, ((crop, _), (score, s, cx, cy)) in enumerate(zip(crops, m)):
        rgba = remove_white(crop)
        if name in HOLD_FROM and i > HOLD_FROM[name] and hold is not None:
            # 坐起來：水平沿用、垂直只跟一半 → 保留起身的動作，頭也不會超出畫布
            tx = hold[0]
            ty = hold[1] + 0.5 * ((ANCHOR[1] - cy * k) - hold[1])
        else:
            tx, ty = ANCHOR[0] - cx * k, ANCHOR[1] - cy * k
            if name in HOLD_FROM and i == HOLD_FROM[name]: hold = (tx, ty)
        out[:, i * FS:(i + 1) * FS] = warp(rgba, k, tx, ty)
        ch, cw = crop.shape[:2]
        raw[:, i * FS:(i + 1) * FS] = warp(rgba, k, FS / 2 - cw * k / 2, FS / 2 - ch * k / 2)   # 未對齊：只置中
        rows.append({'frame': i, 'cell': [int(v) for v in cells[name][i]], 'matchScore': round(float(score), 3),
                     'faceInCell': [round(cx, 1), round(cy, 1)], 'scale': round(k, 3), 'translate': [round(float(tx), 1), round(float(ty), 1)]})
    Image.fromarray(out).save(f'{OUT}/owner_{name}.webp', quality=92, method=6)
    Image.fromarray(raw).save(f'{OUT}/owner_raw_{name}.webp', quality=92, method=6)
    report[name] = {'rowScale': round(k, 3), 'frames': rows}
    print(name, 'upscale ×%.2f' % k, 'scores', [round(q[0], 2) for q in m])
json.dump({'anchor': ANCHOR, 'frameSize': FS, 'source': 'ChatGPT 38-frame concept sheet', 'sets': report},
          open(f'{OUT}/owner_alignment.json', 'w'), indent=1)

# ---------- 去背問題自動偵測（512 尺寸的門檻） ----------
def detect(f):
    a = f[:, :, 3]; issues = []
    solid = (a > 100).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid, 8)
    if n > 1:
        main = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        for i in range(1, n):
            x, y, w, h, area = st[i]
            if i != main and area >= 40:
                issues.append({'type': 'fragment', 'label': '殘留碎片', 'box': [int(x), int(y), int(w), int(h)]})
        holes = (lab != main).astype(np.uint8)
        hn, hl, hs, _ = cv2.connectedComponentsWithStats(holes, 4)
        for i in range(1, hn):
            x, y, w, h, area = hs[i]
            touches = x == 0 or y == 0 or x + w >= f.shape[1] or y + h >= f.shape[0]
            if not touches and area >= 30:
                issues.append({'type': 'hole', 'label': '去背破洞', 'box': [int(x), int(y), int(w), int(h)]})
    # 白邊：邊緣附近仍接近白色的像素
    edge = cv2.dilate((a < 40).astype(np.uint8), np.ones((5, 5), np.uint8)) & (a > 40)
    white = edge.astype(bool) & (f[:, :, :3].min(2) > 225)
    if white.sum() > 80:
        ys, xs = np.where(white)
        issues.append({'type': 'halo', 'label': '白邊殘留', 'box': [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)], 'pixels': int(white.sum())})
    # 被畫布切到
    if a[0].max() > 40 or a[:, 0].max() > 40 or a[:, -1].max() > 40:
        issues.append({'type': 'fragment', 'label': '超出畫布被切到', 'box': [0, 0, f.shape[1], 6]})
    return issues

all_issues = {}
for name, n, _, _ in ROWS:
    sh = np.array(Image.open(f'{OUT}/owner_{name}.webp').convert('RGBA'))
    all_issues[name] = [detect(sh[:, k * FS:(k + 1) * FS]) for k in range(n)]
json.dump(all_issues, open(f'{OUT}/owner_issues.json', 'w'), ensure_ascii=False, indent=1)
print('issues', {n: {t: sum(1 for fr in v for i in fr if i['type'] == t) for t in ['hole', 'fragment', 'halo']} for n, v in all_issues.items()})
