"""把頁面和所有素材打包成一個獨立的 HTML（不需要伺服器、可以直接分享）

用法：
  python3 tools/build_single_file.py dev.html   dist/dev.html     # 開發版（含編輯模式、Debug、主人動畫測試）
  python3 tools/build_single_file.py index.html dist/index.html   # 公開版（只有第一關）
開發版為了控制在 16MB 內，拿掉舊的主人近景 v2／v3／v4（專案資料夾裡仍保留）。
"""
import re, sys, os
src, out = sys.argv[1], sys.argv[2]
g = os.path.dirname(os.path.abspath(src))
html = open(src, encoding="utf-8").read()
def inline(path): return "<script>\n" + open(os.path.join(g, path), encoding="utf-8").read() + "\n</script>"
DROP = ["owner_v2", "owner_v3", "owner_v4"]
html = html.replace('<script src="assets/owner/owner_inline.js"></script>', '<script>window.SUNLIGHT_DROP_ARTS=(window.SUNLIGHT_DROP_ARTS||[]).concat(["v1"]);</script>')
for d in DROP:
    html = html.replace(f'<script src="assets/{d}/{d}_inline.js"></script>', '<script>window.SUNLIGHT_DROP_ARTS=(window.SUNLIGHT_DROP_ARTS||[]).concat(["' + d.split("_")[1] + '"]);</script>')
html = re.sub(r'<script src="(assets/[^"]+|src/[^"]+)"></script>', lambda m: inline(m.group(1)), html)
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
open(out, "w", encoding="utf-8").write(html)
print(out, len(html) // 1024, "KB")
