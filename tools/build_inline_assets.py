"""重新產生 assets/*_inline.js（讓 index.html／dev.html 用 file:// 直接開也能載入素材）
用法：python3 tools/build_inline_assets.py   （在專案根目錄執行）"""
import base64, json, os
def b64(path, mime):
    return f"data:{mime};base64," + base64.b64encode(open(path, "rb").read()).decode()
atlas = json.load(open("assets/sunlight_atlas.json"))
open("assets/sunlight_inline.js", "w").write(
    "// 由 sunlight_atlas.png/.json 產生，勿手動編輯\nwindow.SUNLIGHT_INLINE={png:'%s',json:%s};\n"
    % (b64("assets/sunlight_atlas.png", "image/png"), json.dumps(atlas, separators=(",", ":"))))
B = "assets/bedroom/"
imgs = {"bedroom_full": b64(B + "bedroom_full.webp", "image/webp")}
imgs["cup"] = b64("assets/cup/cup.webp", "image/webp")
imgs["water_spill"] = b64("assets/cup/water_spill.webp", "image/webp")
imgs["sunlight_nap"] = b64("assets/sunlight_nap/sunlight_nap.webp", "image/webp")
for k in ("sleeping", "restless", "awake"): imgs["owner_scene_" + k] = b64(B + f"owner_scene_{k}.webp", "image/webp")
for f in os.listdir(B):
    if f.startswith("overlay_") and f.endswith(".webp"):
        imgs[f[:-5]] = b64(B + f, "image/webp")
cfg = json.load(open(B + "scene_config.json"))
ov = json.load(open(B + "overlays.json"))
open(B + "bedroom_inline.js", "w", encoding="utf-8").write(
    "// 由 assets/bedroom/ 的圖片與 scene_config.json 產生，勿手動編輯（改完設定請重跑本腳本）\nwindow.SUNLIGHT_BEDROOM_INLINE="
    + json.dumps({"images": imgs, "config": cfg, "overlays": ov, "ownerScene": json.load(open(B + "owner_scene.json"))}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("ok", {k: os.path.getsize(p) // 1024 for k, p in [("sunlight", "assets/sunlight_inline.js"), ("bedroom", B + "bedroom_inline.js")]})

O = "assets/owner/"
oimgs = {f[:-5]: b64(O + f, "image/webp") for f in os.listdir(O) if f.endswith(".webp")}
open(O + "owner_inline.js", "w", encoding="utf-8").write(
    "// 由 assets/owner/ 的動畫與 owner_issues.json 產生，勿手動編輯\nwindow.SUNLIGHT_OWNER_INLINE="
    + json.dumps({"images": oimgs, "issues": json.load(open(O + "owner_issues.json"))}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("owner", os.path.getsize(O + "owner_inline.js") // 1024, "KB")

O2 = "assets/owner_v2/"
o2imgs = {f[:-5]: b64(O2 + f, "image/webp") for f in os.listdir(O2) if f.endswith(".webp")}
open(O2 + "owner_v2_inline.js", "w", encoding="utf-8").write(
    "// 由 assets/owner_v2/ 的動畫與 owner_issues.json 產生，勿手動編輯\nwindow.SUNLIGHT_OWNER_V2_INLINE="
    + json.dumps({"images": o2imgs, "issues": json.load(open(O2 + "owner_issues.json"))}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("owner_v2", os.path.getsize(O2 + "owner_v2_inline.js") // 1024, "KB")

O3 = "assets/owner_v3/"
o3imgs = {f[:-5]: b64(O3 + f, "image/webp") for f in os.listdir(O3) if f.endswith(".webp")}
open(O3 + "owner_v3_inline.js", "w", encoding="utf-8").write(
    "// 由 assets/owner_v3/ 的動畫與 owner_issues.json 產生，勿手動編輯\nwindow.SUNLIGHT_OWNER_V3_INLINE="
    + json.dumps({"images": o3imgs, "issues": json.load(open(O3 + "owner_issues.json"))}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("owner_v3", os.path.getsize(O3 + "owner_v3_inline.js") // 1024, "KB")

O4 = "assets/owner_v4/"
o4imgs = {f[:-5]: b64(O4 + f, "image/webp") for f in os.listdir(O4) if f.endswith(".webp")}
open(O4 + "owner_v4_inline.js", "w", encoding="utf-8").write(
    "// 由 assets/owner_v4/ 的動畫與 owner_issues.json 產生，勿手動編輯\nwindow.SUNLIGHT_OWNER_V4_INLINE="
    + json.dumps({"images": o4imgs, "issues": json.load(open(O4 + "owner_issues.json"))}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("owner_v4", os.path.getsize(O4 + "owner_v4_inline.js") // 1024, "KB")

O5 = "assets/owner_v5/"
o5imgs = {f[:-5]: b64(O5 + f, "image/webp") for f in os.listdir(O5) if f.endswith(".webp")}
open(O5 + "owner_v5_inline.js", "w", encoding="utf-8").write(
    "// 由 assets/owner_v5/ 的動畫與 owner_issues.json 產生，勿手動編輯\nwindow.SUNLIGHT_OWNER_V5_INLINE="
    + json.dumps({"images": o5imgs, "issues": json.load(open(O5 + "owner_issues.json"))}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("owner_v5", os.path.getsize(O5 + "owner_v5_inline.js") // 1024, "KB")
