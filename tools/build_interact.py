"""房間互動（I 系列）：把 GPT 交的圖組成遊戲用的素材，並產生 assets/interact/interact_inline.js
用法：python3 tools/build_interact.py   （在專案根目錄執行）

輸入（assets/interact/，2 倍大、已和參考圖對齊）
  laptop_closed_scene.png      書桌：筆電闔上
  lamp_tilt_scene.png          書桌：檯燈歪 45 度（筆電開著）
  lamp_fallen_off_scene.png    書桌：檯燈倒下熄燈（筆電開著）
  desk_no_lamp.png / desk_no_lamp_dim.png   拿掉檯燈的書桌（亮／暗）
  rug_no_toys.png              地毯：拿掉三個玩具
  fish.png / yarn.png / feather.png          綠幕去背後的玩具
輸出（1 倍大，和房間大圖同解析度）
  desk_{o|c}_{s|t|f}.webp      筆電 開/闔 × 檯燈 立/歪/倒 的 6 種書桌（340×160，放在房間 (520,240)）
  rug_no_toys.webp             480×180，放在房間 (700,660)
  toy_{fish|yarn|feather}.webp 玩具（顯示大小的 2 倍，遊戲裡縮 0.5）
"""
import base64, json, os
import cv2, numpy as np

D = "assets/interact/"
ref = cv2.imread("references/i_desk_reference.png").astype(np.float32)
closed = cv2.imread(D + "laptop_closed_scene.png").astype(np.float32)
# 原本打開的筆電佔的位置（之後檯燈的差異不能把這一塊當成檯燈，不然闔上的筆電旁邊會多出半個螢幕）
_nl = cv2.imread(D + "desk_no_laptop.png").astype(np.float32)
LAPTOP = cv2.dilate((np.abs(ref - _nl).sum(2) > 40).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
lamp = {
    "t": (cv2.imread(D + "lamp_tilt_scene.png").astype(np.float32), cv2.imread(D + "desk_no_lamp.png").astype(np.float32)),
    "f": (cv2.imread(D + "lamp_fallen_off_scene.png").astype(np.float32), cv2.imread(D + "desk_no_lamp_dim.png").astype(np.float32)),
}


_bright = cv2.GaussianBlur(cv2.imread(D + "desk_no_lamp.png").astype(np.float32), (0, 0), 18)
_dim = cv2.GaussianBlur(cv2.imread(D + "desk_no_lamp_dim.png").astype(np.float32), (0, 0), 18)
DIM = np.clip((_dim + 1) / (_bright + 1), 0.55, 1.0)
# 書桌圖的邊緣要和房間大圖接起來：離邊緣 36px 以內慢慢換回原圖（不然會看到一個方框）
_yy, _xx = np.mgrid[0:320, 0:680].astype(np.float32)
EDGE = np.clip(np.minimum.reduce([_xx, 679 - _xx, _yy, 319 - _yy]) / 36, 0, 1)
EDGE = (EDGE * EDGE * (3 - 2 * EDGE))[..., None]
DIM = 1 - (1 - DIM) * EDGE


def lamp_mask(scene, base):
    """檯燈那一塊：左邊整片（含光暈）＋往右伸到筆電旁邊的燈罩（用和「沒有檯燈」的差異找出來）"""
    m = np.zeros((320, 680), np.float32)
    m[:, :250] = 1
    m = cv2.GaussianBlur(m, (0, 0), 6)
    d = np.abs(scene - base).sum(2)
    # 只認顏色像檯燈的（橘色燈座、奶油色燈罩）：GPT 重畫的筆電位置有一點偏，螢幕邊緣不能被當成檯燈
    hsv = cv2.cvtColor(np.clip(scene, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # 奶油色燈罩（偏黃）或飽和的橘色燈座；牆壁是偏紅的粉橘色，不算
    lampish = ((H >= 13) & (H <= 30) & (S > 25) & (V > 165)) | ((H >= 4) & (H <= 22) & (S > 165) & (V > 110))
    xs = np.arange(680)[None, :]
    obj = ((d > 45) & lampish & (xs >= 200) & (xs < 350)).astype(np.uint8)
    obj = cv2.morphologyEx(obj, cv2.MORPH_OPEN, np.ones((6, 6), np.uint8))   # 筆電邊框被燈照亮的細線去掉
    obj = cv2.morphologyEx(obj, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(obj)                     # 只留和左邊檯燈連在一起的
    obj = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_LEFT] <= 206]).astype(np.uint8)
    # 補眼睛、嘴巴的洞（只補完全被包住的洞，耳朵旁邊的凹口不補）
    ff = obj.copy() * 255
    cv2.floodFill(ff, np.zeros((322, 682), np.uint8), (0, 0), 128)
    obj = ((obj > 0) | (ff == 0)).astype(np.uint8)
    obj = cv2.GaussianBlur(cv2.dilate(obj, np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 1.0)
    return np.maximum(m, obj)


def down(img, w, h):
    return cv2.resize(np.clip(img, 0, 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_AREA)


out = {}
for lk, base in (("o", ref), ("c", closed)):
    for mk in ("s", "t", "f"):
        img = base.copy()
        if mk == "f":
            # 燈熄了：整張書桌照「拿掉檯燈（暗）÷（亮）」的比例變暗，和倒下的檯燈那一塊接得起來
            img = img * DIM
        if mk != "s":
            scene, nol = lamp[mk]
            m = lamp_mask(scene, nol)[..., None] * EDGE
            img = img * (1 - m) + scene * m
        name = f"desk_{lk}_{mk}"
        cv2.imwrite(D + name + ".webp", down(img, 340, 160), [cv2.IMWRITE_WEBP_QUALITY, 92])
        out[name] = D + name + ".webp"

rug = cv2.imread(D + "rug_no_toys.png").astype(np.float32)
cv2.imwrite(D + "rug_no_toys.webp", down(rug, 480, 180), [cv2.IMWRITE_WEBP_QUALITY, 92])
out["rug_no_toys"] = D + "rug_no_toys.webp"

# 玩具：顯示寬度（房間座標）× 2
TOYS = {"fish": 265, "yarn": 305, "feather": 345}
for k, w2 in TOYS.items():
    s = cv2.imread(D + k + ".png", cv2.IMREAD_UNCHANGED)
    a = s[..., 3:4].astype(np.float32) / 255
    # 去掉綠幕留下的亮邊：透明度收 1px
    a = cv2.erode(a, np.ones((3, 3), np.uint8))[..., None] if a.ndim == 3 else a
    s = np.dstack([s[..., :3], (np.clip(a, 0, 1) * 255).astype(np.uint8).reshape(s.shape[:2])])
    h2 = round(s.shape[0] * w2 / s.shape[1])
    s = cv2.resize(s, (w2, h2), interpolation=cv2.INTER_AREA)
    cv2.imwrite(D + f"toy_{k}.webp", s, [cv2.IMWRITE_WEBP_QUALITY, 92])
    out["toy_" + k] = D + f"toy_{k}.webp"


def b64(path):
    return "data:image/webp;base64," + base64.b64encode(open(path, "rb").read()).decode()


cfg = json.load(open(D + "interact_config.json", encoding="utf-8"))
open(D + "interact_inline.js", "w", encoding="utf-8").write(
    "// 由 tools/build_interact.py 產生，勿手動編輯（改完 interact_config.json 請重跑）\nwindow.SUNLIGHT_INTERACT_INLINE="
    + json.dumps({"images": {k: b64(p) for k, p in out.items()}, "config": cfg}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("ok", {k: os.path.getsize(p) // 1024 for k, p in out.items()}, os.path.getsize(D + "interact_inline.js") // 1024, "KB")
