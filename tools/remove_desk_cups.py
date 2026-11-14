"""移除書桌上兩個杯子（筆筒）。
杯子 2：沿桌面邊緣斜率做左右插值，讓窗台／桌緣的橫線連續；杯子 1：Telea 修補（左邊緊貼檯燈、右邊是筆電，無法左右取樣）。"""
import sys, cv2, numpy as np
src, out = sys.argv[1], sys.argv[2]
img = cv2.imread(src, cv2.IMREAD_COLOR).astype(np.float32)
H, W = img.shape[:2]

def directional_fill(img, mask, slope, rng):
    res = img.copy()
    ys, xs = np.where(mask > 0)
    for y, x in zip(ys, xs):
        samples = []
        for sgn in (-1, 1):
            for d in range(1, 120):
                xx = x + sgn * d; yy = int(round(y - sgn * d * slope * -1))
                yy = int(round(y + sgn * d * slope))
                if not (0 <= xx < W and 0 <= yy < H): break
                if mask[yy, xx] == 0:
                    samples.append((d, img[yy, xx])); break
        if len(samples) == 2:
            (d1, c1), (d2, c2) = samples
            res[y, x] = (c1 * d2 + c2 * d1) / (d1 + d2)
        elif samples:
            res[y, x] = samples[0][1]
    return res

m2 = np.zeros((H, W), np.uint8)
cv2.fillPoly(m2, [np.array([[706, 252], [744, 252], [749, 288], [749, 312], [710, 312], [706, 290]])], 255)
m2 = cv2.dilate(m2, np.ones((3, 3), np.uint8))
img = directional_fill(img, m2, -0.08, None)
# 輕微模糊插值區，避免條紋
blur = cv2.GaussianBlur(img, (0, 0), 1.2)
mm = (cv2.GaussianBlur(m2, (7, 7), 0).astype(np.float32) / 255)[..., None]
img = img * (1 - mm) + blur * mm

m1 = np.zeros((H, W), np.uint8)
cv2.fillPoly(m1, [np.array([[536, 297], [569, 297], [571, 320], [572, 343], [578, 347], [578, 357], [530, 357], [530, 346], [537, 343], [536, 320]])], 255)
m1 = cv2.dilate(m1, np.ones((3, 3), np.uint8))
# 杯子 1：左邊貼著檯燈、右邊是筆電、上方是牆，直接修補會吸進灰色。
# 做法：只取周圍「桌面色」像素（高飽和橘色，排除灰色筆電與偏灰的牆），擬合光線漸層填滿，再疊上桌面的細紋理。
img8 = np.clip(img, 0, 255).astype(np.uint8)
m1d = cv2.dilate(m1, np.ones((5, 5), np.uint8))
ring = cv2.dilate(m1, np.ones((25, 25), np.uint8)) & ~cv2.dilate(m1, np.ones((7, 7), np.uint8))
hsv = cv2.cvtColor(img8, cv2.COLOR_BGR2HSV)
desk = (ring > 0) & (hsv[..., 1] > 120) & (hsv[..., 2] > 150) & (hsv[..., 0] < 25)
yy, xx = np.where(desk)
A = np.stack([np.ones_like(xx), xx, yy, xx * yy, xx ** 2, yy ** 2], 1).astype(np.float64)
coef = [np.linalg.lstsq(A, img8[yy, xx, c].astype(np.float64), rcond=None)[0] for c in range(3)]
ty, tx = np.where(m1d > 0)
At = np.stack([np.ones_like(tx), tx, ty, tx * ty, tx ** 2, ty ** 2], 1).astype(np.float64)
fill = img8.astype(np.float32).copy()
for c in range(3): fill[ty, tx, c] = At @ coef[c]
# 桌面紋理：取檯燈左側乾淨桌面的高頻細節
patch = img8[308:334, 418:466].astype(np.float32)
hp = patch - cv2.GaussianBlur(patch, (0, 0), 3)
# （不疊紋理：取樣到的紋理會帶入不相干的線條）
a1 = (cv2.GaussianBlur(m1d, (7, 7), 0).astype(np.float32) / 255)[..., None]
a1 = np.maximum(a1, (m1 > 0)[..., None].astype(np.float32))
# 三段：上段（桌子後緣／牆）與下段（桌子前緣）用左右插值保留橫線，中段用擬合的光線漸層
def band_fill(y0, y1):
    band = np.zeros_like(m1d); band[y0:y1, :] = m1d[y0:y1, :]
    out = directional_fill(img8.astype(np.float32), band, -0.075, None)
    w = np.zeros(img8.shape[:2], np.float32); w[y0:y1] = 1
    w = cv2.GaussianBlur(w, (1, 7), 0)[..., None] * (band > 0)[..., None]
    return out, w
top, wt = band_fill(285, 310)
lip, wb = band_fill(338, 366)
fill = fill * (1 - wt) + top * wt
fill = fill * (1 - wb) + lip * wb
# 中段：在上下兩段之間逐欄垂直內插（跟著檯燈的光線變化）
cols = np.unique(tx)
r0 = cv2.GaussianBlur(fill[309:310].copy(), (0, 0), sigmaX=4, sigmaY=0.1)[0]
r1 = cv2.GaussianBlur(fill[340:341].copy(), (0, 0), sigmaX=4, sigmaY=0.1)[0]
for x in cols:
    c0, c1 = r0[x].copy(), r1[x].copy()
    for y in range(310, 340):
        if m1d[y, x]:
            t = (y - 309) / 31
            fill[y, x] = c0 * (1 - t) + c1 * t
fill = cv2.GaussianBlur(fill, (0, 0), 0.8)
print('desk samples', len(xx))
img8 = np.clip(img8 * (1 - a1) + fill * a1, 0, 255).astype(np.uint8)

# 修補區補回與周圍相近的細微雜訊
img = img8.astype(np.float32)
noise = np.random.default_rng(7).normal(0, 0.7, img.shape).astype(np.float32)
mall = (cv2.GaussianBlur(np.maximum(m1, m2), (7, 7), 0).astype(np.float32) / 255)[..., None]
img = np.clip(img + noise * mall, 0, 255).astype(np.uint8)
cv2.imwrite(out, img)
cv2.imwrite(out.replace('.png', '_mask.png'), np.maximum(m1, m2))
