# 阿光的秘密任務 SunLight's Secret Missions — 2.5D (Phaser 3.80.1)

| 頁面 | 給誰 | 內容 |
|---|---|---|
| `index.html` | 玩家（公開版） | 只有第一關「偷偷在主人腳邊睡覺」，沒有 Debug、編輯模式、測試場景 |
| `dev.html` | 開發用 | 三個場景（臥室、主人動畫測試、移動測試）、B Debug、M 編輯碰撞 |

兩個頁面都可以直接雙擊開啟（素材經 `assets/*_inline.js` 內嵌載入，file:// 也能用），GitHub Pages 也可以直接部署這個資料夾（首頁就是公開版）。
公開版用 `window.SUNLIGHT_MODE = 'play'` 關掉開發工具，也不會套用編輯模式存在瀏覽器裡的草稿。

打包成單一 HTML 檔：`python3 tools/build_single_file.py index.html dist/index.html`（公開版）、`python3 tools/build_single_file.py dev.html dist/dev.html`（開發版）。

## 場景（dev.html）
- **② 夜晚臥室互動**（預設）：`src/BedroomScene.js`，使用 Sun_Light_Bedroom_Scene_Pack_v1 的核准美術；含床鋪近景任務（主人警覺值）
- **③ 主人動畫測試**：`src/OwnerTest.js`，原始／對齊後並排比較、三種狀態切換、背景切換、去背問題逐幀標示、警覺值滑桿
- **① 移動測試**：`src/scenes.js` 的 MovementTest（角色移動、腳底錨點、深度遮擋測試）

## 操作
WASD／方向鍵 移動 · Shift 潛行 · **Space 跳躍** · E 物品互動 · Tab 展開任務卡 · B Debug · M 編輯模式

Space 的去處（`BedroomScene.pickJump`）：
- 地板：跳上最近、規則允許的家具；附近沒東西就原地小跳
- 平台上只按 Space：能往上就往上（二樓 → 三樓），否則往下（三樓 → 二樓、書桌 → 椅子）
- 平台上 ↑ + Space：往上；↓／←／→ + Space：在往下的出口裡挑落點方向最接近的（二樓：↓ 一樓、→ 地板）
- 按住方向鍵時光環與提示會即時標出落點
- 可行走平台（書桌、床、書櫃頂端，`levels[].walk`）：方向鍵用來走路，走到觸發範圍內按 Space 跳；床上任何位置都能跳回地板（取最近的落地點）

## 第一關「偷偷在主人腳邊睡覺」
1. 跳上主人的床　2. 潛行到主人的腳邊（床尾發光的範圍）　3. 在腳邊安靜待 5 秒（動了就重來）　★ 推倒床頭的水杯（+80，但很吵）
- 成功：結算肉泥點數（完成 100、主人完全沒翻身 +50／沒被偷看到 +20、★水杯 +80）與稱號，Space 再玩一次
- 失敗：警覺值 100% → 驚醒大特寫 → 失敗卡，Space 重新開始
- 主人的預兆：25% 近景的 Zzz 停止並微微晃動 → 35% 翻身（Restless）→ 70% 瞇眼偷看（Peek，這時候動會大幅增加警覺值）→ 100% 驚醒
- 警覺值：跳上床 +14、在床上走 +9/秒、主人臉附近 +30/秒、偷看時還在動 +40/秒、Shift 潛行 ×0.3、推倒水杯 +35、跳下床 +6
  在主人身邊（300px 內）停下來**不會下降**；床上其他地方停下 −3/秒、在腳邊睡覺 −4/秒、離開床 −12/秒
- 任務定義：`scene_config.json` 的 `missions[0]`；警覺值參數：`ownerMission`

### 程式架構
| 模組 | 負責 |
|---|---|
| `src/AlertSystem.js` | 警覺值數值、預兆階段、主人狀態切換（不畫東西） |
| `src/MissionManager.js` | 任務步驟、睡覺計時、成功／失敗、結算與稱號（不畫東西） |
| `src/MissionHUD.js` | 任務卡、警覺值條、圓形情緒近景、腳邊標記、睡覺進度環、驚醒大特寫、結算畫面 |
| `src/BedroomScene.js` | 移動、碰撞、平台與跳躍；把上面三個模組接起來 |

### 床頭櫃的馬克杯（E 包）
- `assets/cup/cup.webp`（4 欄：0 立著、1～6 倒下、7 倒在地上）、`water_spill.webp`；位置在 `scene_config.json` 的 `cup`（stand＝桌面、floor＝掉落點）
- 在床上靠近床頭櫃按 E：杯子逐格倒下、沿拋物線掉到地板、灑出一灘茶，警覺值 +35，★加分 80

### 警覺值（v3.8 調快）
| 行為 | 每秒／每次 |
|---|---|
| 床上走動／靠近臉走動 | +14／+38 每秒（Shift 潛行 ×0.4） |
| 跳上床／跳下床／推倒水杯 | +20／+6／+35 |
| 走動時的聲響（不定時，每 1.6～3.2 秒） | 床上 +7「吱…」、地板 +3「嘎吱」（潛行 ×0.4） |
| 地板上走動 | +1 每秒；床下最多只到 30（只會停止 Zzz，不會翻身） |
| 停下來 | 床上 −2、離開床 −8、主人身邊 0、腳邊睡覺 −4 每秒 |
參數都在 `scene_config.json` 的 `ownerMission`（`gain`、`decay`、`noise`）。

### 阿光捲成一團睡覺（D 包）
- `assets/sunlight_nap/sunlight_nap.webp`：5 欄 sheet，0～5 趴下捲起來、6～9 呼吸循環；腳邊安靜待著（napping）或任務成功時顯示，縮放＝阿光目前縮放 × 0.79（坐姿高度對齊原本的阿光）

### 房間 v3.0（C_Pack_3 背景＋C4 包床上主人，目前使用）
- C4 包：不安只用 00、01，驚醒只用 00、01（其他格是重複的），中間由程式淡化；C_Pack_3 的主人圖層備份在 `assets/bedroom/owner_c3_backup/`
- C4 包的棉被斜度和床不一致 → `python3 tools/fit_blanket.py <C4包> <輸出>` 用薄板樣條把熟睡、不安的棉被前緣收到床墊頂面前緣（臉、枕頭、棉被後緣不動），再跑 `build_room2.py`
- GPT 依遊戲截圖重畫的房間：家具位置全部和 v2.0 不同，座標重量（初版，請用 M 微調）
- 背景地板上被多畫了一隻阿光（約 x 656–751、y 575–681），已用左邊的地板補掉
- 床頭櫃上沒有杯子 → 加分任務暫停：`missions[0].bonusPending`、`zonesPending`，等 E 包再放回
- 上一版：設定 `scene_config.room2.json`、圖檔 `assets/bedroom/room2_backup/`

### 房間 v2.0（C_Pack_1／2）
- 背景 `assets/bedroom/bedroom_full.webp` = C 包 `bedroom_empty_bed.png`；床上的主人是另一層 `owner_scene_{sleeping,restless,awake}.webp`（`tools/build_room2.py` 產生，裁到人物範圍、2 欄 sheet）
- 熟睡：8 格跟著 3.6 秒呼吸時鐘，兩格之間交叉淡化（減少整張重畫的閃動）；不安／驚醒跟著近景的狀態播放，Peek 時全景維持熟睡
- 主人全景目前是 C_Pack_2（Q 版）；`scene_config.json` 的 `ownerScene.use` 指定只用哪幾格：不安 00、03，驚醒 00、05（其他格是半透明疊圖）。C_Pack_1 的寫實版圖層備份在 `assets/bedroom/owner_c1_backup/`
- 遮擋圖改成「從房間圖依輪廓多邊形剪出」：`occluders[].silhouette`，改完重跑 `python3 tools/build_room2.py <C包> assets/bedroom`；會自動扣掉床上主人蓋到的地方
- 所有碰撞、平台、落點、腳邊範圍、主人臉部範圍都是新量的初版 → 用編輯模式（M）微調後匯出
- 舊房間：設定 `scene_config.room1.json`、圖檔 `assets/bedroom/room1_backup/`

### 主人美術 v5（近景，目前使用）：Q 版 A2 包＋A3 包（驚醒 19 格）
- `tools/build_owner_v5.py` 組裝（4 欄 sheet）；awake_02～12 原圖整組往下偏 20px、左偏 3px，已平移對齊
- 人物左邊、下面出血到畫布外 → 圓形近景取景 (236,250) 半徑 140，驚醒大特寫取 x 60–400、y 92–383
- 單檔網頁版為了控制大小拿掉 v2、v3、v4（專案資料夾裡仍保留）

### 主人美術 v4（近景）：直髮、熊熊印花棉被
- A 包更新版 38 格，`tools/build_owner_v4.py` 組裝；awake_02 原圖畫小約 15%，已等比放大對齊前後格
- 已加入過渡幀 11 格（熟睡 8、不安 16、偷看 12、驚醒 13）；過渡幀原圖位置偏 15～35px，已平移到前後格之間
- 單檔網頁版為控制在 16MB 內，拿掉了 v2（專案資料夾裡仍保留）

### 主人美術 v3：捲髮＋過渡幀
- A 包 38 格＋過渡幀 9 格，由 `tools/build_owner_v3.py` 組裝：熟睡 10、不安 16、偷看 8、驚醒 13 格（4 欄格狀 sheet）
- 不安的 4 張過渡格原圖畫小約 20%，工具會等比放大並把臉對到前後格之間；其他格原樣使用
- 近景 Sleeping 用呼吸相位和大圖同步（幀數不同也能對齊）
- 已知：主人仍是捲髮（直髮造型待 ChatGPT 角色設定圖確認後重畫 A 包＋C 包）

### 主人美術 v2 與呼吸同步
- `scene_config.json` 的 `ownerArt` 選擇近景美術：`v2`（預設，38 格概念總表）或 `v1`（Owner Animation Pack）
- v2 由 `tools/extract_owner_v2.py` 從總表切出：去白底、去白邊、去掉相鄰格的細條、以臉部對齊到 512×512（不重畫）
- 臥室大圖的棉被呼吸圖層：`assets/bedroom/owner_breathing.webp`（`tools/build_breathing.py` 產生），和近景 Sleeping 用同一個 3.6 秒呼吸時鐘逐幀同步
- 測試模式按 **A** 切換 v1／v2 比較
- v2 已知問題：頭髮邊緣仍有白邊、「不安」放大 2.86 倍偏糊、驚醒第 9 幀頭頂略被切到、近景與大圖的主人畫風不完全一樣 → 見 `ASSET_REQUESTS.md` A 包

### 圓形近景
以幀座標 (150,120)、半徑 44 取景 → 所有幀的卡片邊緣、底部殘影、左側直條都在圓外（測試模式的青色圓圈就是這個範圍）。
驚醒大特寫取幀座標 x 84–196、y 66–162。素材只有 256×192，放大後偏糊，見 `ASSET_REQUESTS.md`。

### 主人動畫的處理
`tools/align_owner_frames.py` 只做幾何對齊（等比縮放＋平移），不改像素內容：
| 問題（原始素材） | 對齊後 |
|---|---|
| Restless 人物比 Sleeping 大約 1.06× | 統一比例 |
| Awake 人物比 Sleeping 小約 0.9× | 統一比例 |
| Sleeping 第 4–5 幀臉往上跳 7px | 0px |
| Restless 臉部整段往右漂 20px（回 Sleeping 會跳回來） | ≤ 2px |
Awake 第 8–10 幀是坐起來的動作，保留原本的位移。

### 素材 v1 的已知問題（沒有用不透明色塊遮蓋，測試模式按 I 可逐幀看到）
| 問題 | 出現在 | 影響 |
|---|---|---|
| 頭髮髮圈處有去背破洞 | 幾乎每一幀 | 會透出後面的背景色 |
| 底部半透明殘影（概念板標籤底座） | Sleeping、Restless 全部 | 面板底部有一塊半透明灰色 |
| 頭髮上緣暗色殘邊 | 全部 | 淺色背景上看得到灰色光暈 |
| 白色標註線／動態線殘留 | Restless 第 4–5 幀、Sleeping 部分幀頭髮上 | 頭髮上的白色筆觸 |
| 左側直條（概念板邊框） | Awake 第 7–10 幀 | 面板左側一條細直線 |
| 每一幀都含棉被與枕頭，且是圓角卡片形狀 | 全部 | 疊到臥室原圖上會出現兩顆頭、兩層棉被（測試模式背景選「床鋪」可看到） |
| 臥室背景裡的主人永遠是睡著的 | 正式任務 | 近景是 Awake 時，大圖上的主人還在睡 |
正式版需要：只有人物（或人物＋棉被分層）的逐幀透明素材，以及沒有主人的床鋪底圖。

## 檔案
| 路徑 | 內容 |
|---|---|
| `src/sunlight.js` | 阿光載入、動畫、`SunLightCat` 移動控制器（新增 collide / frozen / manual hooks，原移動邏輯不變） |
| `src/BedroomScene.js` | 臥室場景：多邊形碰撞、前後遮擋、互動提示、平台狀態機、跳躍過渡、Debug |
| `assets/sunlight_atlas.*` | 阿光 sprite atlas（腳底對齊） |
| `assets/bedroom/scene_config.json` | **互動規則與座標（v1.1，改這裡即可調整）** |
| `assets/bedroom/scene_config.original.json` | 原始 v1.0 設定（參考） |
| `assets/bedroom/*.webp` | 臥室背景與遮擋圖（由原 PNG 裁切壓縮，未重繪） |
| `tools/build_inline_assets.py` | **改完 scene_config.json 或圖片後要重跑**，更新 file:// 用的內嵌素材 |
| `tools/build_atlas.py`, `tools/fix_ears.py` | 重建阿光 atlas |
| `src/owner.js` | 主人動畫載入（含 Peek）、`OwnerSprite` 狀態機、近景取景範圍、警覺值預設參數 |
| `ASSET_REQUESTS.md` | 需要請 ChatGPT 產出的素材清單 v2（逐檔檔名、規格、交付前自我檢查） |
| `references/` | 給 ChatGPT 的參考圖（臥室、床頭櫃區塊、阿光、主人造型） |
| `assets/owner_v3/`、`tools/build_owner_v3.py` | 主人近景 v3（遊戲使用中）與組裝工具 |
| `assets/owner_v2/`、`tools/extract_owner_v2.py` | 主人近景 v2 與切圖工具 |
| `assets/bedroom/owner_scene_*`、`tools/build_room2.py` | 新房間：背景、遮擋圖、床上主人全景圖層 |
| `assets/bedroom/room1_backup/`、`tools/build_breathing.py` | 舊房間的圖檔與棉被呼吸圖層（不再使用） |
| `src/LayoutEditor.js` | 遊戲內編輯模式（拖曳碰撞、範圍、落點，匯出設定檔） |
| `assets/owner/owner_*.webp` | 對齊後的主人動畫（遊戲使用）；`owner_raw_*.webp` 為原始素材（測試比對用） |
| `assets/owner/owner_alignment.json`、`owner_issues.json` | 每幀的對齊參數、自動偵測的去背問題 |
| `tools/align_owner_frames.py` | 重新對齊主人動畫並偵測問題（`python3 tools/align_owner_frames.py <Owner Pack>/assets/sheets assets/owner`） |
| `tools/remove_desk_cups.py` | 移除書桌上兩個筆筒（`python3 tools/remove_desk_cups.py <原 bedroom_full.png> <輸出.png>`） |

## 編輯模式（推薦）
臥室場景按 **M**（或頁面上的「編輯碰撞」）進入，遊戲會暫停：
- **1–8** 切換圖層：地板碰撞、牆線、床、書桌、書櫃頂端、主人的臉與腳邊範圍、觸發範圍、落點
- 拖曳方塊把手＝移動頂點／中心；拖曳圓形把手＝調整半徑
- 在邊線上**雙擊**＝新增頂點；在頂點上**右鍵**＝刪除頂點；**Shift＋拖曳**多邊形內部＝整塊移動
- 觸發範圍圖層（7）：在地板觸發圈裡**雙擊**＝複製一個新圈（出現在右邊，再拖過去）；在圈的中心點**右鍵**＝刪除這個圈（同一個家具至少保留 1 個）
- **Ctrl+Z** 復原；**P** 面板換邊（面板擋到要編輯的地方時）
- 改動立即生效，並自動存成瀏覽器草稿（重新整理也還在）
- **自動檢查**：落點不在可走範圍（跳上去會卡住）、跳上床的落點在腳邊範圍內（步驟會直接完成）、觸發範圍走不到、落地點被擋住 → 地圖上紅圈，面板列出問題
- 桌腳、椅腳之間可以描出凹口讓阿光鑽到桌子底下；前後遮擋用碰撞形狀的凸包判斷，鑽進去時會被桌子擋住、只顯示剪影
- 改完按「⬇ 匯出」→ 複製或下載 `scene_config.json` → 取代 `assets/bedroom/scene_config.json` → 執行 `python3 tools/build_inline_assets.py`
- 「清除草稿」會丟掉沒匯出的修改，回到專案裡的設定

## 手動調整碰撞／互動範圍的流程
1. 按 B 開 Debug，點畫面會記錄座標（右上角，也會 console.log）
2. 修改 `assets/bedroom/scene_config.json`
   - `blockedFloorPolygons`：地板碰撞（紅）
   - `walkArea.wallLines`：牆線（綠）
   - `zones[].approach`：地板觸發範圍（青）；`zones[].target`：落點（黃）
   - `levels[].land`：跳下的落地點（粉）；`levels[].refY`：平台上的遠近縮放基準
   - `masks`：一樓洞口、貓窩前緣的遮罩形狀
   - `levels[].walk.polygon / blocked`：平台上的可走範圍與障礙物（綠面／紅）
   - `zones[].approachFrom`、`levels[].exitApproach`：平台上的觸發範圍（青圈／粉圈）
3. 在專案根目錄執行 `python3 tools/build_inline_assets.py`
4. 重新整理頁面

## 跳躍動畫
目前沒有跳躍 sprite → 用弧線位置過渡 + 加速的走路動畫。
之後只要在 `SUN_ANIMS` 加入 `jump`（或 `jump_left` / `jump_right` / `jump_up` / `jump_down`），
`BedroomScene.perform()` 會自動改播放跳躍動畫。

## 已知限制
- 臥室是一張平面插畫，遮擋圖是從同一張圖裁出來的，不是獨立家具；
  所以設計上避免阿光走到大型家具後面（椅子下方已設為碰撞），被擋住時顯示半透明剪影。
- 書桌上的筆筒是用程式修補移除的（非重繪），近看修補處會略有光澤感；正式版建議換成乾淨的桌面美術。
- 書櫃頂端的紙箱佔滿整個深度，所以用「跳過紙箱」越過，而不是從前面繞過。
