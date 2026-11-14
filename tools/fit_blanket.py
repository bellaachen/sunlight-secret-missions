"""C4 包主人圖層：把棉被前緣拉到床墊頂面的前緣（GPT 畫的棉被垂過床墊側面、斜度也和床不一致）
用法：python3 tools/fit_blanket.py <C4包資料夾> <輸出資料夾>
- 薄板樣條（thin-plate spline）變形：臉、枕頭、棉被後緣固定不動，前緣整條往上收到床墊頂面前緣，中段跟著收一半
- 熟睡、不安 14 張套用同一個變形 → 幀與幀之間不會多出跳動
- 驚醒（坐起來）不變形：手和腿會被拉長，而且驚醒時畫面有大特寫蓋住
"""
import sys, os, glob, numpy as np, cv2
from PIL import Image
from scipy.interpolate import RBFInterpolator
SRC, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
# 目標：棉被前緣＝床墊「頂面前緣」（Bella 畫的紅線），床墊側面要露出來
#   左段 (878,505)→(1155,602)，右段 (1155,602)→(1470,505)
FIX = [(1360,415),(1300,370),(1400,350),(1440,420),(1470,440),(1460,330),(1230,420),(1290,400),
       (1000,490),(1100,455),(1180,432),(950,512)]
EDGE_SRC = [(880,550),(940,577),(1000,598),(1060,619),(1120,640),(1150,651),(1240,614),(1300,587),(1360,559),(1420,532),(1470,516)]
def top_edge(x): return 505 + (x - 878) * 0.3502 if x <= 1155 else 602 - (x - 1155) * 0.308
MOVE = [(p, (p[0], round(top_edge(p[0])))) for p in EDGE_SRC]
# 棉被中段也一起往上收（約一半位移），花色才不會只在前緣被壓扁
MOVE += [((x, (y + top) // 2), (x, (round(top_edge(x)) + top) // 2)) for (x, y), top in
         [((960, 584), 520), ((1060, 619), 470), ((1160, 650), 440), ((1300, 587), 470), ((1400, 545), 470)]]
d = np.array([p for p in FIX] + [m[1] for m in MOVE], float)    # 輸出座標
s = np.array([p for p in FIX] + [m[0] for m in MOVE], float)    # 去原圖哪裡取
rbf = RBFInterpolator(d, s - d, kernel='thin_plate_spline', smoothing=0.0)
x0, y0, x1, y1 = 840, 280, 1560, 700                              # 只變形床的範圍，外面不動
ys, xs = np.mgrid[y0:y1, x0:x1]
disp = rbf(np.c_[xs.ravel(), ys.ravel()].astype(float)).reshape(y1 - y0, x1 - x0, 2)
mx = (xs + disp[..., 0]).astype(np.float32); my = (ys + disp[..., 1]).astype(np.float32)
import shutil
for f in sorted(glob.glob(os.path.join(SRC, 'owner_scene_*.png'))):
    if '_awake_' in f: shutil.copy(f, OUT); continue
    a = np.array(Image.open(f).convert('RGBA')).astype(np.float32)
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4] / 255                 # premultiplied，避免邊緣出現黑邊
    w = cv2.remap(pm, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    out = a.copy(); out[y0:y1, x0:x1] = w
    al = np.clip(out[..., 3:4], 0, 255)
    out[..., :3] = np.where(al > 0.5, out[..., :3] * 255 / np.maximum(al, 1e-3), 0)
    out[y0:y1, x0:x1, :3] = np.where(al[y0:y1, x0:x1] > 0.5, out[y0:y1, x0:x1, :3], 0)
    o = a.copy(); o[y0:y1, x0:x1] = np.clip(out[y0:y1, x0:x1], 0, 255)
    Image.fromarray(o.astype(np.uint8)).save(os.path.join(OUT, os.path.basename(f)))
print('ok')
