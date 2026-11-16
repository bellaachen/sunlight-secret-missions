/* =========================================================
 * LayoutEditor — 遊戲內的碰撞／範圍編輯模式（臥室場景按 M 開關）
 *
 *   拖曳把手：移動頂點、圓心、橢圓中心、落點
 *   拖曳圓／橢圓外側的把手：調整半徑
 *   在多邊形邊上「雙擊」：新增頂點　·　在頂點上「右鍵」：刪除頂點（至少保留 3 個）
 *   按住 Shift 拖曳多邊形內部：整塊移動
 *   觸發範圍圖層：在地板觸發圈裡「雙擊」＝複製一個新圈　·　在圈的中心點「右鍵」＝刪除這個圈（至少保留 1 個）
 *   1–8 切換圖層　·　Ctrl+Z 復原　·　P 面板換邊（面板擋到要編輯的地方時）　·　M／Esc 離開
 *
 *   改動會立即套用到碰撞與任務判定，並自動存成瀏覽器草稿（重新整理也不會不見）。
 *   自動檢查：落點不在可走範圍（會卡住）、落點在腳邊範圍內（步驟會直接完成）、觸發範圍走不到 → 地圖上紅圈標示。
 *   改完按「匯出」取得新的 scene_config.json → 取代專案的 assets/bedroom/scene_config.json
 *   → 執行 python3 tools/build_inline_assets.py
 * ========================================================= */
const LE_DRAFT_KEY = 'sunlight_layout_draft_v1';
const LE_KEYS = ['blockedFloorPolygons', 'walkArea', 'levels', 'zones', 'ownerMission', 'missions'];
const LE_FONT = '"Zen Maru Gothic", "Noto Sans TC", sans-serif';

class LayoutEditor {
  /** 場景建立時呼叫：有同版本的草稿就套用 */
  static applyDraft(cfg) {
    try {
      const raw = localStorage.getItem(LE_DRAFT_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d.basedOn !== cfg.version) return false;
      LE_KEYS.forEach(k => { if (d.cfg[k] !== undefined) cfg[k] = d.cfg[k]; });
      return true;
    } catch (e) { return false; }
  }

  static cleanJSON(cfg, pick = null) {
    const src = pick ? Object.fromEntries(pick.map(k => [k, cfg[k]])) : cfg;
    // _runtime：執行時才加進來的東西（房間互動的互動點、加分任務），不寫回 scene_config.json
    return JSON.stringify(src, (k, v) => (k === 'pts' || k === 'blockedPts') ? undefined : Array.isArray(v) ? v.filter(x => !(x && x._runtime)) : v, 1);
  }

  constructor(scene) {
    this.s = scene;
    this.active = false;
    this.layer = 0;
    this.drag = null;
    this.undo = [];
    this.lastClick = { t: 0, x: 0, y: 0 };
    this.g = scene.add.graphics().setDepth(9900);
    this.panelG = scene.add.graphics().setDepth(9950);
    this.texts = [];
    this.buttons = [];
    this.layers = [
      { name: '地板碰撞', color: 0xff5a4a },
      { name: '牆線', color: 0x6fe08a },
      { name: '床（可走範圍／障礙／落地點）', color: 0x6fe08a, level: 'bed' },
      { name: '書桌', color: 0x6fe08a, level: 'desk' },
      { name: '書櫃頂端', color: 0x6fe08a, level: 'bookshelf_top' },
      { name: '主人的臉與腳邊範圍', color: 0xffd36a },
      { name: '觸發範圍（圓圈）', color: 0x7ff7ff },
      { name: '落點', color: 0xffe14a },
    ];
    scene.input.mouse && scene.input.mouse.disableContextMenu();
    scene.input.on('pointerdown', p => this.onDown(p));
    scene.input.on('pointermove', p => this.onMove(p));
    scene.input.on('pointerup', () => this.onUp());
    const kb = scene.input.keyboard;
    kb.on('keydown-M', () => this.toggle());
    kb.on('keydown-ESC', () => { if (this.active) this.toggle(false); });
    kb.on('keydown-P', () => { if (this.active) this.switchSide(); });
    kb.on('keydown', e => {
      if (!this.active) return;
      if (e.key >= '1' && e.key <= '8') { this.layer = Number(e.key) - 1; e.stopImmediatePropagation && e.stopImmediatePropagation(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') this.doUndo();
    });
    this.buildPanel();
    this.setPanelVisible(false);
    // 頁面上的「編輯碰撞」按鈕透過 registry 開關
    this.onReg = (_, v) => { if (!!v !== this.active) this.toggle(!!v); };
    scene.registry.events.on('changedata-editor', this.onReg);
    scene.events.once('shutdown', () => { scene.registry.events.off('changedata-editor', this.onReg); scene.registry.set('editor', false); });
  }

  get cfg() { return this.s.cfg; }

  toggle(on = !this.active) {
    this.active = on;
    this.s.registry.set('editor', on);
    if (on) { this.s.registry.set('debug', true); this.validate(); }
    this.setPanelVisible(on);
    if (!on) { this.g.clear(); if (this.coord) this.coord.setVisible(false); }
  }

  /* ---------- 圖層裡可以編輯的形狀 ---------- */
  shapes() {
    const c = this.cfg, L = this.layers[this.layer], out = [];
    const circle = (obj, rKey = 'radius', center = obj) => out.push({ type: 'circle', obj, rKey, center });
    const point = obj => out.push({ type: 'point', obj });
    const asList = v => [].concat(v || []);
    switch (this.layer) {
      case 0:
        c.blockedFloorPolygons.forEach(p => p.ellipse ? out.push({ type: 'ellipse', obj: p.ellipse }) : out.push({ type: 'poly', pts: p, closed: true }));
        break;
      case 1:
        c.walkArea.wallLines.forEach(l => out.push({ type: 'poly', pts: l, closed: false }));
        break;
      case 2: case 3: case 4: {
        const lv = c.levels[L.level];
        if (lv.walk) {
          out.push({ type: 'poly', pts: lv.walk.polygon, closed: true });
          (lv.walk.blocked || []).forEach(b => out.push({ type: 'poly', pts: b, closed: true, red: true }));
        }
        asList(lv.land).forEach(point);
        break;
      }
      case 5: {
        const om = c.ownerMission;
        circle(om.face);
        circle(om, 'nearOwnerRadius', om.face);
        out.push({ type: 'ellipse', obj: c.missions[0].feetZone });
        break;
      }
      case 6:
        c.zones.forEach(z => {
          asList(z.approach).forEach(a => out.push({ type: 'circle', obj: a, rKey: 'radius', center: a, zone: z }));   // 地板觸發圈：可雙擊複製、右鍵刪除
          Object.values(z.approachFrom || {}).forEach(a => circle(a));
        });
        Object.values(c.levels).forEach(l => Object.values(l.exitApproach || {}).forEach(a => circle(a)));
        break;
      case 7:
        c.zones.forEach(z => { asList(z.target).forEach(point); Object.values(z.targetFrom || {}).forEach(point); });
        Object.values(c.levels).forEach(l => { asList(l.land).forEach(point); Object.values(l.exitTarget || {}).forEach(point); });
        break;
    }
    return out;
  }

  handles() {
    const hs = [];
    this.shapes().forEach(sh => {
      if (sh.type === 'poly') sh.pts.forEach((p, i) => hs.push({ x: p[0], y: p[1], sh, i, set: (x, y) => { p[0] = x; p[1] = y; } }));
      if (sh.type === 'point') hs.push({ x: sh.obj.x, y: sh.obj.y, sh, set: (x, y) => { sh.obj.x = x; sh.obj.y = y; } });
      if (sh.type === 'circle') {
        const c = sh.center, r = sh.obj[sh.rKey];
        if (sh.center === sh.obj) hs.push({ x: c.x, y: c.y, sh, set: (x, y) => { c.x = x; c.y = y; } });
        hs.push({ x: c.x + r, y: c.y, sh, radius: true, set: (x, y) => { sh.obj[sh.rKey] = Math.max(8, Math.round(Math.hypot(x - c.x, y - c.y))); } });
      }
      if (sh.type === 'ellipse') {
        const e = sh.obj;
        hs.push({ x: e.x, y: e.y, sh, set: (x, y) => { e.x = x; e.y = y; } });
        hs.push({ x: e.x + e.rx, y: e.y, sh, radius: true, set: x => { e.rx = Math.max(8, Math.round(Math.abs(x - e.x))); } });
        hs.push({ x: e.x, y: e.y + e.ry, sh, radius: true, set: (x, y) => { e.ry = Math.max(6, Math.round(Math.abs(y - e.y))); } });
      }
    });
    return hs;
  }

  /* ---------- 滑鼠 ---------- */
  inPanel(p) { const P = this.panel; return p.worldX > P.x && p.worldX < P.x + P.w && p.worldY > P.y && p.worldY < P.y + P.h; }

  onDown(p) {
    if (!this.active) return;
    if (this.inPanel(p)) { this.clickPanel(p); return; }
    const x = Math.round(p.worldX), y = Math.round(p.worldY);
    // 取最近的把手（中心點優先），避免兩個圈的把手靠太近時抓錯
    const hit = this.handles().map(h => ({ h, d: Math.hypot(h.x - x, h.y - y) - (h.radius ? 0 : 4) })).filter(o => o.d < 16).sort((m, n) => m.d - n.d).map(o => o.h)[0];
    if (p.rightButtonDown()) {
      if (hit && hit.sh.type === 'poly' && hit.sh.closed && hit.sh.pts.length > 3) {
        this.snapshot(); hit.sh.pts.splice(hit.i, 1); this.changed();
      }
      // 地板觸發圈的中心點上右鍵 → 刪除這個圈（同一個家具至少保留 1 個）
      if (hit && hit.sh.zone && !hit.radius) {
        const z = hit.sh.zone, list = [].concat(z.approach);
        if (list.length > 1) {
          this.snapshot(); list.splice(list.indexOf(hit.sh.obj), 1);
          z.approach = list.length === 1 ? list[0] : list; this.changed();
          this.s.showToast(`已刪除「${z.label}」的一個觸發圈`);
        } else this.s.showToast('每個家具至少要保留一個觸發圈');
      }
      return;
    }
    const now = this.s.time.now, dbl = now - this.lastClick.t < 320 && Math.hypot(this.lastClick.x - x, this.lastClick.y - y) < 10;
    this.lastClick = { t: now, x, y };
    if (hit && !dbl) { this.snapshot(); this.drag = { h: hit }; return; }
    const polys = this.shapes().filter(s => s.type === 'poly');
    if (dbl) {
      // 雙擊地板觸發圈（圈內任何地方）→ 複製一個新的圈，放在旁邊，再拖到想要的位置
      const circ = this.shapes().find(sh => sh.zone && Math.hypot(sh.obj.x - x, sh.obj.y - y) <= sh.obj.radius);
      if (circ) {
        const z = circ.zone, list = [].concat(z.approach), a = circ.obj;
        this.snapshot();
        const off = a.radius * 2 + 16, nx = a.x + off < 1650 ? a.x + off : a.x - off;   // 放在旁邊、不和原本的圈重疊
        list.push({ x: Math.round(nx), y: a.y, radius: a.radius });
        z.approach = list; this.drag = null; this.changed();
        this.s.showToast(`「${z.label}」新增了一個觸發圈（在旁邊），拖中心點到想要的位置`);
        return;
      }
      // 雙擊邊線 → 新增頂點
      for (const sh of polys) {
        const n = sh.pts.length, segs = sh.closed ? n : n - 1;
        for (let i = 0; i < segs; i++) {
          const a = sh.pts[i], b = sh.pts[(i + 1) % n];
          if (this.distSeg(x, y, a, b) < 10) {
            if (!sh.closed && n >= 2) return;            // 牆線固定兩個端點
            this.snapshot(); sh.pts.splice(i + 1, 0, [x, y]); this.changed(); return;
          }
        }
      }
      return;
    }
    if (p.event && p.event.shiftKey) {
      const sh = polys.find(s => s.closed && pointInPoly(s.pts.map(([px, py]) => ({ x: px, y: py })), x, y));
      if (sh) { this.snapshot(); this.drag = { poly: sh, x, y }; }
    }
  }

  distSeg(x, y, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const t = Phaser.Math.Clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1);
    return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
  }

  onMove(p) {
    if (!this.active || !this.drag) return;
    const x = Math.round(p.worldX), y = Math.round(p.worldY);
    if (this.drag.h) this.drag.h.set(x, y);
    if (this.drag.poly) {
      const dx = x - this.drag.x, dy = y - this.drag.y;
      this.drag.poly.pts.forEach(pt => { pt[0] += dx; pt[1] += dy; });
      this.drag.x = x; this.drag.y = y;
    }
    this.s.rebuildGeometry();
  }

  onUp() { if (this.drag) { this.drag = null; this.changed(); } }

  /* ---------- 復原／草稿／匯出 ---------- */
  snapshot() {
    this.undo.push(LayoutEditor.cleanJSON(this.cfg, LE_KEYS));
    if (this.undo.length > 60) this.undo.shift();
  }
  doUndo() {
    const last = this.undo.pop();
    if (!last) { this.s.showToast('沒有可以復原的步驟'); return; }
    const d = JSON.parse(last);
    LE_KEYS.forEach(k => { this.cfg[k] = d[k]; });
    this.changed();
  }
  changed() {
    this.s.rebuildGeometry();
    this.validate();
    try { localStorage.setItem(LE_DRAFT_KEY, JSON.stringify({ basedOn: this.cfg.version, savedAt: Date.now(), cfg: JSON.parse(LayoutEditor.cleanJSON(this.cfg, LE_KEYS)) })); } catch (e) {}
  }
  clearDraft() {
    try { localStorage.removeItem(LE_DRAFT_KEY); } catch (e) {}
    location.reload();
  }
  exportJSON() {
    const json = LayoutEditor.cleanJSON(this.cfg) + '\n';
    let wrap = document.getElementById('le-export');
    if (wrap) wrap.remove();
    wrap = document.createElement('div');
    wrap.id = 'le-export';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(29,20,32,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    wrap.innerHTML = `<div style="background:#fffaf3;color:#3d332e;border-radius:16px;padding:18px;width:min(720px,100%);font-family:${LE_FONT.replace(/"/g, "'")}">
      <div style="font-weight:700;font-size:17px;margin-bottom:6px">匯出 scene_config.json</div>
      <div style="font-size:13px;color:#8a7a6e;margin-bottom:10px">取代專案的 assets/bedroom/scene_config.json，再執行 python3 tools/build_inline_assets.py</div>
      <textarea readonly style="width:100%;height:46vh;font:12px ui-monospace,Menlo,monospace;border:1px solid #e6dccf;border-radius:10px;padding:10px;box-sizing:border-box"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap">
        <button data-a="copy">複製</button><button data-a="dl">下載檔案</button><button data-a="close">關閉</button></div></div>`;
    wrap.querySelectorAll('button').forEach(b => b.style.cssText = 'font:inherit;padding:8px 16px;border-radius:999px;border:1px solid #e6dccf;background:#fff;cursor:pointer');
    document.body.appendChild(wrap);
    const ta = wrap.querySelector('textarea'); ta.value = json;
    wrap.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'close' || e.target === wrap) wrap.remove();
      if (a === 'copy') { ta.select(); try { navigator.clipboard.writeText(json).catch(() => document.execCommand('copy')); } catch (err) { document.execCommand('copy'); } e.target.textContent = '已複製'; }
      if (a === 'dl') {
        try {
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          const link = document.createElement('a'); link.href = url; link.download = 'scene_config.json';
          document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) { e.target.textContent = '無法下載，請用複製'; }
      }
    });
  }

  /* ---------- 自動檢查 ---------- */
  footOK(level, x, y) {
    const f = this.cfg.player.foot, s = this.s;
    if (level === 'floor') {
      const xs = [x - f.w / 2, x, x + f.w / 2], ys = [y - f.h, y];
      return !xs.some(px => ys.some(py => s.blockedPoint(px, py)));
    }
    const w = s.walkOf(level);
    if (!w) return true;
    return [x - f.w / 2 + 4, x, x + f.w / 2 - 4].every(px => pointInPoly(w.pts, px, y) && !w.blockedPts.some(b => pointInPoly(b, px, y)));
  }
  reachable(level, a) {
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const x = a.x + a.radius * i / 4.5, y = a.y + a.radius * j / 4.5;
      if (Math.hypot(x - a.x, y - a.y) < a.radius && this.footOK(level, x, y)) return true;
    }
    return false;
  }
  validate() {
    const c = this.cfg, out = [], L = v => [].concat(v || []);
    const walkLv = lv => !!(c.levels[lv] && c.levels[lv].walk);
    for (const z of c.zones) {
      if (z.level && walkLv(z.level)) {
        L(z.target).forEach(t => { if (!this.footOK(z.level, t.x, t.y)) out.push({ ...t, msg: `「${z.label}」的落點不在可走範圍（會卡住）` }); });
        Object.values(z.targetFrom || {}).forEach(t => { if (!this.footOK(z.level, t.x, t.y)) out.push({ ...t, msg: `「${z.label}」的落點不在可走範圍（會卡住）` }); });
      }
      L(z.approach).forEach(a => { if (!this.reachable('floor', a)) out.push({ x: a.x, y: a.y, msg: `「${z.label}」的觸發範圍在地板上走不到` }); });
      Object.entries(z.approachFrom || {}).forEach(([lv, a]) => { if (walkLv(lv) && !this.reachable(lv, a)) out.push({ x: a.x, y: a.y, msg: `「${z.label}」在${c.levels[lv].label}上的觸發範圍走不到` }); });
    }
    for (const [name, lv] of Object.entries(c.levels)) {
      L(lv.land).forEach(t => { if (!this.footOK('floor', t.x, t.y)) out.push({ ...t, msg: `從${lv.label}跳下的落地點被擋住` }); });
      Object.entries(lv.exitTarget || {}).forEach(([ex, t]) => { if (walkLv(ex) && !this.footOK(ex, t.x, t.y)) out.push({ ...t, msg: `從${lv.label}跳到${c.levels[ex].label}的落點不在可走範圍` }); });
      Object.entries(lv.exitApproach || {}).forEach(([ex, a]) => { if (lv.walk && !this.reachable(name, a)) out.push({ x: a.x, y: a.y, msg: `${lv.label}往${c.levels[ex].label}的觸發範圍走不到` }); });
    }
    const m = c.missions && c.missions[0];
    if (m && m.feetZone) {
      const fz = m.feetZone, bed = c.zones.find(z => z.level === 'bed');
      L(bed && bed.target).forEach(t => { if (((t.x - fz.x) / fz.rx) ** 2 + ((t.y - fz.y) / fz.ry) ** 2 <= 1) out.push({ ...t, msg: '跳上床的落點在腳邊範圍內（步驟 2 會直接完成）' }); });
      if (!this.reachable('bed', { x: fz.x, y: fz.y, radius: Math.min(fz.rx, fz.ry) })) out.push({ x: fz.x, y: fz.y, msg: '腳邊範圍在床上走不到' });
    }
    const sp = c.player.spawn;
    if (!this.footOK('floor', sp.x, sp.y)) out.push({ ...sp, msg: '出生點被擋住' });
    this.problems = out;
    return out;
  }

  /* ---------- 面板 ---------- */
  switchSide() {
    const P = this.panel, nx = P.x > ROOM_W / 2 ? 16 : ROOM_W - P.w - 16, dx = nx - P.x;
    P.x = nx;
    this.texts.forEach(t => { t.x += dx; });
  }

  buildPanel() {
    const W = 340, x = ROOM_W - W - 16, y = 86;
    this.panel = { x, y, w: W, h: 0 };
    const add = (str, yy, size = 18, color = '#4a3328', bold = false) => {
      const t = this.s.add.text(x + 18, yy, str, { fontFamily: LE_FONT, fontSize: size + 'px', color, fontStyle: bold ? '700' : '500', wordWrap: { width: W - 36, useAdvancedWrap: true } }).setDepth(9951);
      this.texts.push(t); return t;
    };
    add('✏️ 編輯模式', y + 14, 22, '#3d2a22', true);
    let yy = y + 52;
    this.layerTexts = this.layers.map((L, i) => { const t = add(`${i + 1}　${L.name}`, yy); this.buttons.push({ y: yy - 6, h: 32, act: () => { this.layer = i; } }); yy += 34; return t; });
    yy += 8;
    this.help = add('拖曳把手移動　·　拖外圈把手改半徑\n邊線上雙擊＝新增頂點　·　頂點上右鍵＝刪除\nShift＋拖曳內部＝整塊移動\n觸發圈裡雙擊＝複製一個圈　·　圈中心右鍵＝刪除', yy, 15, '#8a7a6e');
    yy += 98;
    this.checkText = add('', yy, 15, '#4a3328', true);
    yy += 112;
    const btns = [['⇆ 面板換邊（P）', () => this.switchSide()], ['↶ 復原（Ctrl+Z）', () => this.doUndo()], ['⬇ 匯出 scene_config.json', () => this.exportJSON()], ['清除草稿（還原）', () => this.clearDraft()], ['離開編輯（M）', () => this.toggle(false)]];
    this.btnTexts = btns.map(([label, act]) => { const t = add(label, yy + 6, 18, '#4a3328', true); this.buttons.push({ y: yy, h: 38, act, btn: true }); yy += 46; return t; });
    this.panel.h = yy - y + 10;
  }
  clickPanel(p) { const b = this.buttons.find(b => p.worldY >= b.y && p.worldY <= b.y + b.h); if (b) b.act(); }
  setPanelVisible(v) { this.panelG.setVisible(v); this.texts.forEach(t => t.setVisible(v)); }

  /* ---------- 每幀 ---------- */
  update() {
    if (!this.active) return;
    const P = this.panel, g = this.panelG.clear();
    g.fillStyle(0xfffaf3, 0.96).fillRoundedRect(P.x, P.y, P.w, P.h, 18);
    this.buttons.forEach(b => { if (b.btn) g.fillStyle(0xf3e4d2, 1).fillRoundedRect(P.x + 12, b.y, P.w - 24, b.h, 19); });
    this.layerTexts.forEach((t, i) => {
      const on = i === this.layer;
      if (on) g.fillStyle(0xc98a5e, 1).fillRoundedRect(P.x + 12, t.y - 6, P.w - 24, 32, 10);
      t.setColor(on ? '#ffffff' : '#4a3328').setFontStyle(on ? '700' : '500');
    });
    // 目前圖層的形狀與把手
    const L = this.layers[this.layer], d = this.g.clear();
    for (const sh of this.shapes()) {
      const col = sh.red ? 0xff5a4a : L.color;
      if (sh.type === 'poly') {
        const pts = sh.pts.map(([x, y]) => ({ x, y }));
        if (sh.closed) d.fillStyle(col, 0.18).fillPoints(pts, true);
        d.lineStyle(3, col, 1).strokePoints(pts, sh.closed);
      }
      if (sh.type === 'circle') d.lineStyle(3, col, 1).strokeCircle(sh.center.x, sh.center.y, sh.obj[sh.rKey]);
      if (sh.type === 'ellipse') d.fillStyle(col, 0.15).fillEllipse(sh.obj.x, sh.obj.y, sh.obj.rx * 2, sh.obj.ry * 2).lineStyle(3, col, 1).strokeEllipse(sh.obj.x, sh.obj.y, sh.obj.rx * 2, sh.obj.ry * 2);
    }
    const p = this.s.input.activePointer, px = p.worldX, py = p.worldY;
    for (const h of this.handles()) {
      const hot = Math.hypot(h.x - px, h.y - py) < 16 || (this.drag && this.drag.h && this.drag.h.sh === h.sh && this.drag.h.i === h.i && this.drag.h.radius === h.radius);
      d.fillStyle(hot ? 0xffffff : 0x1d1420, 1).lineStyle(2.5, h.sh.red ? 0xff5a4a : L.color, 1);
      if (h.radius) { d.fillCircle(h.x, h.y, hot ? 9 : 7); d.strokeCircle(h.x, h.y, hot ? 9 : 7); }
      else { d.fillRect(h.x - (hot ? 8 : 6), h.y - (hot ? 8 : 6), hot ? 16 : 12, hot ? 16 : 12); d.strokeRect(h.x - (hot ? 8 : 6), h.y - (hot ? 8 : 6), hot ? 16 : 12, hot ? 16 : 12); }
    }
    // 自動檢查結果
    const probs = this.problems || [];
    for (const pr of probs) {
      d.lineStyle(4, 0xff3b30, 1).strokeCircle(pr.x, pr.y, 16);
      d.lineStyle(3, 0xff3b30, 1).lineBetween(pr.x - 7, pr.y - 7, pr.x + 7, pr.y + 7).lineBetween(pr.x - 7, pr.y + 7, pr.x + 7, pr.y - 7);
    }
    this.checkText.setText(probs.length ? `⚠ ${probs.length} 個問題（地圖上紅圈）\n` + probs.slice(0, 3).map(p => '・' + p.msg).join('\n') + (probs.length > 3 ? '\n…' : '') : '✓ 自動檢查：沒有發現問題')
      .setColor(probs.length ? '#c0392b' : '#4f8a5b');
    // 座標提示
    if (!this.coord) this.coord = this.s.add.text(0, 0, '', { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '16px', color: '#ffffff', backgroundColor: '#1d1420cc', padding: { x: 6, y: 3 } }).setDepth(9960);
    this.coord.setVisible(!this.inPanel(p)).setText(`${Math.round(px)}, ${Math.round(py)}`).setPosition(px + 14, py + 14);
  }
}
