/* =========================================================
 * TapNav — 手機版「點哪走哪」（觸控模式才會啟用）
 *
 *   點地板          → 阿光自己繞過家具走過去
 *   點家具／平台    → 走到觸發範圍，自動跳上去（要先上椅子才能上書桌這類規則照舊，會自動先跳椅子）
 *   點床上、書桌上  → 跳上去之後走到點的位置
 *   點水杯          → 上床、走到床頭、推倒
 *   點阿光          → 立刻停下來（主人偷看時用）
 *   右下「潛行」鈕  → 切換潛行（走慢、比較安靜）
 *   點任務膠囊      → 展開任務卡
 *
 * 找路：每個平台各自一張 8px 格子地圖（用阿光真正的碰撞判定），A* 找路後把路線拉直。
 * 換平台：用 platforms／zones 的規則做 BFS，找出最少跳幾次。
 * ========================================================= */
const TN_CELL = 8;

class TapNav {
  constructor(scene) {
    this.s = scene;
    this.goal = null;      // { type: 'walk' | 'level' | 'item', level, x, y, zone }
    this.path = null;      // 目前平台上的路線（世界座標點）
    this.sneak = false;
    this.cache = new Map();
    this.stuckT = 0;
    this.buildUI();
    scene.input.on('pointerdown', p => this.onTap(p));
  }

  /* ---------------- 畫面：潛行按鈕、目的地標記 ---------------- */
  buildUI() {
    const s = this.s, W = ROOM_W, H = ROOM_H;
    this.btn = { x: W - 196, y: H - 132, w: 172, h: 92 };
    this.btnG = s.add.graphics().setDepth(9100);
    this.btnText = s.add.text(this.btn.x + this.btn.w / 2, this.btn.y + this.btn.h / 2, '', {
      fontFamily: UI_FONT, fontSize: '30px', color: '#4a3328', fontStyle: '700', align: 'center',
    }).setOrigin(0.5).setDepth(9101);
    this.mark = s.add.ellipse(0, 0, 54, 20).setStrokeStyle(4, 0xffffff, 0.95).setDepth(3999).setVisible(false);
    this.drawButton();
  }
  drawButton() {
    const b = this.btn, on = this.sneak;
    this.btnG.clear().fillStyle(on ? 0x7a5a8c : 0xfffaf3, on ? 0.92 : 0.9).fillRoundedRect(b.x, b.y, b.w, b.h, 30);
    this.btnText.setText(on ? '🐾 潛行中' : '🐾 潛行').setColor(on ? '#fff8ee' : '#4a3328');
  }
  inBtn(x, y) { const b = this.btn; return x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h; }

  /* ---------------- 點擊 ---------------- */
  onTap(p) {
    const s = this.s, x = p.worldX, y = p.worldY, cat = s.cat.sprite;
    if (s.ended) { if (s.endReady) s.scene.restart(); return; }
    if (this.inBtn(x, y)) { this.sneak = !this.sneak; this.drawButton(); return; }
    const hud = s.hud;
    if (hud.pillRect && Phaser.Geom.Rectangle.Contains(hud.pillRect, x, y)) { hud.expandUntil = hud.t + 4000; return; }
    if (s.bubble.visible && s.bubbleRect && Phaser.Geom.Rectangle.Contains(s.bubbleRect, x, y) && s.primaryAct) {
      this.stop(); s.perform(s.primaryAct); return;
    }
    if (s.busy) return;
    // 正在走的時候點阿光 → 停下（沒在走的時候點到阿光，就當成點那個位置）
    const b = cat.getBounds(); Phaser.Geom.Rectangle.Inflate(b, 12, 12);
    if ((this.goal || s.cat.moving) && Phaser.Geom.Rectangle.Contains(b, x, y)) { this.stop(); s.showToast('停下來了'); return; }
    this.goal = this.interpret(x, y);
    this.path = null; this.stuckT = 0;
    if (this.goal) this.showMark(this.goal.mx ?? x, this.goal.my ?? y);
  }

  /** 點到的東西是什麼 */
  interpret(x, y) {
    const s = this.s, cfg = s.cfg;
    // 水杯
    const cup = cfg.zones.find(z => z.type === 'interact');
    if (cup && cfg.cup && Math.hypot(x - cfg.cup.stand.x, y - (cfg.cup.stand.y - 20)) < 60 && !(s.missionMgr.bonus.find(b => b.id === 'cup') || {}).done) return { type: 'item', zone: cup, mx: cfg.cup.stand.x, my: cfg.cup.stand.y };
    // 可以走的平台（床、書桌、書櫃頂端）：點在上面 → 走到那個位置
    for (const [lv, L] of Object.entries(cfg.levels)) {
      const w = s.walkOf(lv);
      if (w && pointInPoly(w.pts, x, y)) return { type: 'walk', level: lv, x, y };
    }
    // 固定落點的平台（貓窩、貓爬架、椅子）：點在附近 → 跳上去
    let best = null;
    for (const z of cfg.zones) {
      if (z.type === 'interact' || !z.point || s.walkOf(z.level) || z.level === 'floor') continue;
      const d = Math.hypot(x - z.point.x, y - z.point.y) / (z.radius || 80);
      if (d < 1 && (!best || d < best.d)) best = { z, d };
    }
    if (best) { const t = [].concat(best.z.target)[0]; return { type: 'level', level: best.z.level, mx: t.x, my: t.y }; }
    // 其他：地板
    return { type: 'walk', level: 'floor', x, y };
  }

  stop() { this.goal = null; this.path = null; this.s.cat.virtualDir = null; this.mark.setVisible(false); }

  showMark(x, y) {
    this.mark.setPosition(x, y).setVisible(true).setScale(0.6).setAlpha(1);
    this.s.tweens.killTweensOf(this.mark);
    this.s.tweens.add({ targets: this.mark, scale: 1.2, alpha: 0.5, duration: 420, yoyo: true, repeat: 1 });
  }

  /* ---------------- 每幀 ---------------- */
  update(dt) {
    const s = this.s, cat = s.cat;
    cat.virtualDir = null;
    if (!this.goal || s.busy || s.ended) return;
    const g = this.goal, lv = s.level;

    if (g.type === 'item') {
      const req = g.zone.requires || [];
      if (req.includes(lv)) {
        const it = s.jumpOptions().items.find(i => i.zone === g.zone);
        if (it) { this.stop(); s.perform(it); return; }
        const ap = (g.zone.approachFrom || {})[lv];
        if (ap) return this.walkTo(ap.x, ap.y, dt, ap.radius * 0.6);
        this.stop(); return;
      }
      return this.hopToward(req[0]);
    }
    if (lv === g.level) {
      if (g.type === 'level') { this.stop(); return; }
      return this.walkTo(g.x, g.y, dt, 6, true);
    }
    this.hopToward(g.level);
  }

  /** 往目標平台跳一步；在觸發範圍外就先走過去 */
  hopToward(target) {
    const s = this.s, lv = s.level, cfg = s.cfg;
    const next = this.route(lv, target);
    if (!next) { this.stop(); s.showToast('那裡現在去不了'); return; }
    const opts = s.jumpOptions();
    let act = opts.up.concat(opts.down).find(o => o.to === next);
    // 地板上：已經站進那個家具的觸發圈，但旁邊另一個家具比較近（jumpOptions 只給最近的）→ 直接跳指定的那個
    if (!act && lv === 'floor') {
      const z = cfg.zones.find(z => z.level === next && (z.requires || ['floor']).includes('floor') && z.approach);
      const c = s.cat.sprite;
      if (z && [].concat(z.approach).some(a => Math.hypot(c.x - a.x, c.y - a.y) < a.radius))
        act = { label: z.label, zone: z, to: z.level, target: s.nearestLand(z.target), kind: z.type };
    }
    if (act) { this.path = null; s.perform(act); return; }
    // 還不在觸發範圍內 → 走過去
    let ap = null;
    if (lv === 'floor') {
      const z = cfg.zones.find(z => z.level === next && (z.requires || ['floor']).includes('floor') && z.approach);
      if (z) {
        const c = s.cat.sprite;
        ap = [].concat(z.approach).reduce((a, b) => Math.hypot(c.x - a.x, c.y - a.y) <= Math.hypot(c.x - b.x, c.y - b.y) ? a : b);
      }
    } else {
      const z = cfg.zones.find(z => z.level === next && (z.requires || []).includes(lv));
      ap = (z && (z.approachFrom || {})[lv]) || ((cfg.levels[lv] || {}).exitApproach || {})[next];
    }
    if (!ap || !s.walkOf(lv) && lv !== 'floor') { this.stop(); s.showToast('那裡現在去不了'); return; }
    this.walkTo(ap.x, ap.y, this.lastDt || 16, Math.max(6, ap.radius * 0.5));
    // 走到圈裡了卻還是跳不了（規則不允許）→ 放棄，避免原地卡住
    const c = s.cat.sprite;
    if (Math.hypot(c.x - ap.x, c.y - ap.y) <= Math.max(6, ap.radius * 0.5) && !s.busy) { if ((this.waitT = (this.waitT || 0) + (this.lastDt || 16)) > 800) { this.waitT = 0; this.stop(); } } else this.waitT = 0;
  }

  /** 平台之間的路線（BFS，回傳下一個要去的平台） */
  route(from, to) {
    const cfg = this.s.cfg, prev = { [from]: null }, q = [from];
    const nexts = lv => {
      const out = [];
      cfg.zones.forEach(z => { if (z.type !== 'interact' && z.level !== lv && (z.requires || ['floor']).includes(lv)) out.push(z.level); });
      ((cfg.platforms[lv] || {}).exits || []).forEach(e => out.push(e));
      return [...new Set(out)];
    };
    while (q.length) {
      const lv = q.shift();
      if (lv === to) break;
      for (const n of nexts(lv)) if (!(n in prev)) { prev[n] = lv; q.push(n); }
    }
    if (!(to in prev)) return null;
    let cur = to;
    while (prev[cur] !== from && prev[cur] !== null) cur = prev[cur];
    return cur === from ? null : cur;
  }

  /* ---------------- 同一個平台上走路（A*） ---------------- */
  walkTo(tx, ty, dt, tol = 6, final = false) {
    const s = this.s, cat = s.cat, c = cat.sprite;
    this.lastDt = dt;
    if (cat.frozen) { this.stop(); return; }
    if (Math.hypot(tx - c.x, ty - c.y) <= tol) { if (final) this.stop(); this.path = null; return; }
    if (!this.path || this.path.goal.x !== tx || this.path.goal.y !== ty) {
      const pts = this.findPath(c.x, c.y, tx, ty);
      if (!pts) { this.stop(); s.showToast('走不過去'); return; }
      this.path = { pts, goal: { x: tx, y: ty }, i: 0 };
    }
    const P = this.path;
    while (P.i < P.pts.length && Math.hypot(P.pts[P.i].x - c.x, P.pts[P.i].y - c.y) < 5) P.i++;
    if (P.i >= P.pts.length) { if (final) this.stop(); this.path = null; return; }
    const wp = P.pts[P.i], dx = wp.x - c.x, dy = (wp.y - c.y) / cat.opt.depthFactor, l = Math.hypot(dx, dy) || 1;
    cat.virtualDir = { x: dx / l, y: dy / l };
    // 卡住（被擋住、沒在動）→ 重新找路，再卡就放棄
    this.stuckT = cat.moving ? 0 : this.stuckT + dt;
    if (this.stuckT > 600) { this.path = null; this.stuckT = 0; if ((this.stuckTries = (this.stuckTries || 0) + 1) > 2) { this.stuckTries = 0; this.stop(); } }
  }

  free(cx, cy) {
    const key = this.s.level + ':' + cx + ',' + cy;
    let v = this.cache.get(key);
    if (v === undefined) { v = !this.s.cat._blocked(cx * TN_CELL + TN_CELL / 2, cy * TN_CELL + TN_CELL / 2); this.cache.set(key, v); }
    return v;
  }
  invalidate() { this.cache.clear(); this.path = null; }

  findPath(sx, sy, tx, ty) {
    const C = TN_CELL, W = Math.ceil(ROOM_W / C), H = Math.ceil(ROOM_H / C);
    const toCell = (x, y) => [Phaser.Math.Clamp(Math.floor(x / C), 0, W - 1), Phaser.Math.Clamp(Math.floor(y / C), 0, H - 1)];
    let [ax, ay] = toCell(sx, sy), [bx, by] = toCell(tx, ty);
    // 目的地剛好在家具裡 → 找最近的空格
    if (!this.free(bx, by)) {
      let found = null;
      for (let r = 1; r < 14 && !found; r++)
        for (let dx = -r; dx <= r && !found; dx++) for (const dy of [-r, r]) if (this.free(bx + dx, by + dy)) { found = [bx + dx, by + dy]; break; }
      for (let r = 1; r < 14 && !found; r++)
        for (let dy = -r; dy <= r && !found; dy++) for (const dx of [-r, r]) if (this.free(bx + dx, by + dy)) { found = [bx + dx, by + dy]; break; }
      if (!found) return null;
      [bx, by] = found; tx = bx * C + C / 2; ty = by * C + C / 2;
    }
    const startFree = this.free(ax, ay);
    const idx = (x, y) => y * W + x, h = (x, y) => { const dx = Math.abs(x - bx), dy = Math.abs(y - by); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const gS = new Map([[idx(ax, ay), 0]]), from = new Map(), open = [[h(ax, ay), ax, ay]], closed = new Set();
    let iter = 0;
    while (open.length && iter++ < 40000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y] = open.splice(bi, 1)[0], k = idx(x, y);
      if (closed.has(k)) continue; closed.add(k);
      if (x === bx && y === by) {
        const cells = []; let cur = k;
        while (cur !== undefined) { cells.unshift([cur % W, Math.floor(cur / W)]); cur = from.get(cur); }
        const pts = cells.map(([cx, cy]) => ({ x: cx * C + C / 2, y: cy * C + C / 2 }));
        pts[pts.length - 1] = { x: tx, y: ty };
        return this.smooth([{ x: sx, y: sy }, ...pts.slice(1)]);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        // 起點本身可能貼著邊（例：剛落地）→ 允許從起點離開
        if (!this.free(nx, ny)) continue;
        if (dx && dy && (!this.free(x + dx, y) || !this.free(x, y + dy)) && !(x === ax && y === ay && !startFree)) continue;
        const ng = gS.get(k) + (dx && dy ? 1.414 : 1), nk = idx(nx, ny);
        if (ng < (gS.get(nk) ?? Infinity)) { gS.set(nk, ng); from.set(nk, k); open.push([ng + h(nx, ny), nx, ny]); }
      }
    }
    return null;
  }

  /** 把格子路線拉直：能直線走到的點就跳過中間的 */
  smooth(pts) {
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clear(pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    return out.slice(1);
  }
  clear(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
    for (let k = 1; k < n; k++) {
      const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
      if (this.s.cat._blocked(x, y)) return false;
    }
    return true;
  }
}
