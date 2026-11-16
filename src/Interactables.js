/* =========================================================
 * Interactables — 房間互動（I 系列）：闔上筆電、推倒檯燈、把地上的玩具撥出去
 *
 * 只在 dev.html 載入（需要 assets/interact/interact_inline.js）。公開版沒載入就完全不受影響。
 * 設定：assets/interact/interact_config.json（改完重跑 tools/build_interact.py）
 *
 *   書桌：房間大圖上蓋一張「目前狀態」的書桌圖（筆電 開/闔 × 檯燈 立/歪/倒 共 6 張），換狀態時交叉淡化
 *   玩具：地毯蓋一張「沒有玩具」的圖，三個玩具變成可以滑動、轉動的物件
 *   加分：闔上筆電、推倒檯燈、三個玩具都撥過 → 結算加分；全部加分都做完拿稱號「深夜破壞王」
 * ========================================================= */
class Interactables {
  static preload(scene) {
    const IN = window.SUNLIGHT_INTERACT_INLINE;
    if (!IN) return;
    for (const [k, src] of Object.entries(IN.images)) if (!scene.textures.exists('ix_' + k)) scene.load.image('ix_' + k, src);
  }

  constructor(scene) {
    const s = this.s = scene, C = this.C = window.SUNLIGHT_INTERACT_INLINE.config, cfg = s.cfg;
    this.inject(cfg);

    /* ---- 書桌 ---- */
    this.state = { laptop: 'o', lamp: 's' };
    const D = C.desk, sx = D.w / s.textures.get('ix_desk_o_s').getSourceImage().width;
    this.deskA = s.add.image(D.x, D.y, 'ix_desk_o_s').setOrigin(0).setScale(sx).setDepth(0.45);
    this.deskB = s.add.image(D.x, D.y, 'ix_desk_o_s').setOrigin(0).setScale(sx).setDepth(0.451).setAlpha(0);
    // 阿光走到書桌後面時，書桌的遮擋圖層是原本的房間圖 → 疊一張目前狀態的書桌，用同一個輪廓遮住
    this.deskOcc = (s.occluders || []).find(o => o.overlay === 'desk');
    this.deskFront = s.add.image(D.x, D.y, 'ix_desk_o_s').setOrigin(0).setScale(sx).setDepth(5001).setVisible(false);
    if (this.deskOcc && this.deskOcc.silhouette) {
      const g = s.make.graphics({ add: false });
      g.fillStyle(0xffffff).fillPoints(this.deskOcc.silhouette.map(([x, y]) => ({ x, y })), true);
      this.deskFront.setMask(g.createGeometryMask());
    }
    // 燈熄了以後，檯燈附近的牆、窗簾變暗
    if (!s.textures.exists('ix_dim')) {
      const t = s.textures.createCanvas('ix_dim', 256, 256), ctx = t.getContext();
      const gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(28,18,40,1)'); gr.addColorStop(0.55, 'rgba(28,18,40,0.55)'); gr.addColorStop(1, 'rgba(28,18,40,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 256, 256); t.refresh();
    }
    const M = C.dim;
    this.dim = s.add.image(M.x, M.y, 'ix_dim').setDisplaySize(M.rx * 2, M.ry * 2).setDepth(0.46).setAlpha(0);

    /* ---- 地毯和玩具 ---- */
    const R = C.rug, rs = R.w / s.textures.get('ix_rug_no_toys').getSourceImage().width;
    this.rug = s.add.image(R.x, R.y, 'ix_rug_no_toys').setOrigin(0).setScale(rs).setDepth(0.44);
    this.toys = C.toys.map(t => {
      const spr = s.add.image(t.x, t.y, 'ix_toy_' + t.id).setScale(0.5, 0.5 * (t.scaleY || 1)).setAngle(t.angle || 0);
      const w = spr.displayWidth, h = spr.displayHeight;
      const shadow = s.add.ellipse(t.x, t.y + h * 0.28, w * 0.8, Math.max(10, h * 0.32), 0x3b2418, 0.16).setDepth(0.47);
      return { ...t, spr, shadow, w, h, vx: 0, vy: 0, ang: t.angle || 0, moved: false };
    });
    this.syncToys();
  }

  /** 把互動點、加分任務加進設定（只在執行時加；編輯模式匯出時會濾掉 _runtime） */
  inject(cfg) {
    const C = this.C, def = cfg.missions[0];
    def.bonus = def.bonus || [];
    for (const b of C.bonus) if (!def.bonus.some(x => x.id === b.id)) def.bonus.push({ ...b, _runtime: true });
    for (const z of C.zones) if (!cfg.zones.some(x => x.id === z.id)) cfg.zones.push({ ...JSON.parse(JSON.stringify(z)), _runtime: true });
    Object.defineProperty(def, 'allTitle', { value: C.titleAll, enumerable: false, configurable: true });
  }

  /* ---------- 規則 ---------- */
  bonusOf(z) { return z.bonus || (z.id === 'water' ? 'cup' : z.id); }
  isDone(z) { const m = this.s.missionMgr; return !!(m && m.isDone(this.bonusOf(z))); }

  /** 地板上：阿光腳邊夠近的玩具（最近的一個） */
  floorItems() {
    const c = this.s.cat.sprite;
    let best = null;
    for (const t of this.toys) {
      const d = Math.hypot(t.x - c.x, t.y - c.y);
      if (d < t.reach && (!best || d < best.d)) best = { t, d };
    }
    return best ? [{ label: best.t.label, toy: best.t, kind: 'interact' }] : [];
  }
  itemFor(toy) { return this.floorItems().find(i => i.toy === toy) || null; }

  /** 點到的是哪個玩具 */
  toyAt(x, y) {
    return this.toys.find(t => Math.abs(x - t.x) < t.w / 2 + 10 && Math.abs(y - t.y) < t.h / 2 + 16) || null;
  }

  perform(act) {
    if (act.toy) { this.pushToy(act.toy); return true; }
    const id = act.zone && act.zone.id;
    if (id === 'laptop') { this.closeLaptop(); return true; }
    if (id === 'lamp') { this.knockLamp(); return true; }
    return false;
  }

  face(x) { this.s.cat.facingLeft = x < this.s.cat.sprite.x; }

  bump(amount, reason, floor = false) {
    const a = this.s.alertSys; if (!a) return;
    if (floor) { const cap = ((this.s.alertParams || {}).noise || {}).floorCap ?? 100; amount = Math.min(amount, cap - a.value); }
    if (amount > 0) a.bump(amount, reason);
  }

  /* ---------- 書桌 ---------- */
  deskKey() { return `ix_desk_${this.state.laptop}_${this.state.lamp}`; }

  /** 換成目前狀態的書桌圖：新圖淡入，淡完換到底下那張 */
  swapDesk(dur, done) {
    const s = this.s, A = this.deskA, B = this.deskB, key = this.deskKey();
    if (this.swapTween) { this.swapTween.complete(); }
    B.setTexture(key).setAlpha(0);
    this.swapTween = s.tweens.add({ targets: B, alpha: 1, duration: dur, ease: 'Quad.In',
      onComplete: () => { this.swapTween = null; A.setTexture(key); B.setAlpha(0); this.deskFront.setTexture(key); if (done) done(); } });
  }

  closeLaptop() {
    const s = this.s, z = s.cfg.zones.find(z => z.id === 'laptop');
    if (!s.missionMgr.completeBonus('laptop')) { s.showToast('筆電已經闔上了'); return; }
    this.face(z.point.x);
    this.bump(this.C.gain.laptop, 'laptop');
    this.state.laptop = 'c';
    this.swapDesk(240, () => {
      s.hud.float(z.point.x, z.point.y - 20, '啪！', '#fffaf3', 32);
      s.cameras.main.shake(110, 0.002);
    });
  }

  knockLamp() {
    const s = this.s, z = s.cfg.zones.find(z => z.id === 'lamp');
    if (!s.missionMgr.completeBonus('lamp')) { s.showToast('檯燈已經倒了'); return; }
    this.face(z.point.x);
    this.state.lamp = 't';
    this.swapDesk(110, () => s.time.delayedCall(120, () => {
      this.state.lamp = 'f';
      this.swapDesk(140, () => {
        this.bump(this.C.gain.lamp, 'lamp');
        s.hud.float(z.point.x + 20, z.point.y + 10, '喀啷！', '#fffaf3', 34);
        s.cameras.main.shake(200, 0.005);
        s.tweens.add({ targets: this.dim, alpha: this.C.dim.alpha, duration: 600, ease: 'Sine.Out' });
      });
    }));
  }

  /* ---------- 玩具 ---------- */
  pushToy(t) {
    const s = this.s, c = s.cat.sprite;
    let dx = t.x - c.x, dy = (t.y - c.y) * 1.3, d = Math.hypot(dx, dy);
    if (d < 8) { dx = s.cat.facingLeft ? -1 : 1; dy = 0; d = 1; }
    const a = Math.atan2(dy, dx) + Phaser.Math.FloatBetween(-0.25, 0.25), sp = t.speed * Phaser.Math.FloatBetween(0.9, 1.1);
    t.vx = Math.cos(a) * sp; t.vy = Math.sin(a) * sp * 0.7;          // 地板有透視：往前後滑得比較短
    t.dir = t.vx >= 0 ? 1 : -1;
    this.face(t.x);
    this.bump(this.C.gain.toy, 'toy', s.level !== 'bed');
    s.hud.float(t.x, t.y - t.h / 2 - 10, t.id === 'yarn' ? '咕嚕咕嚕～' : '咻～', '#fffaf3', 24);
    if (!t.moved) {
      t.moved = true;
      if (this.toys.every(x => x.moved) && s.missionMgr.completeBonus('toys')) s.hud.float(c.x, c.y - 120, '★ 玩具全部撥出去了', '#ffe6a8', 24);
    }
  }

  blockedAt(t, x, y) {
    const s = this.s, wa = s.cfg.walkArea;
    if (x < wa.minX + t.w * 0.3 || x > wa.maxX - t.w * 0.3 || y > wa.maxY - 70) return true;   // 不要滑到畫面下緣的提示列後面
    const fy = y + t.h * 0.22;
    return [x - t.w * 0.3, x, x + t.w * 0.3].some(px => s.blockedPoint(px, fy));
  }

  update(dt) {
    const sec = dt / 1000, k = Math.exp(-this.C.friction * sec);
    for (const t of this.toys) {
      const sp = Math.hypot(t.vx, t.vy);
      if (sp < 14) { t.vx = t.vy = 0; continue; }
      let nx = t.x + t.vx * sec, ny = t.y + t.vy * sec;
      // 撞到家具或牆就彈回來一點（一開始就在擋住的地方 → 先讓它滑出來）
      if (!this.blockedAt(t, t.x, t.y) && this.blockedAt(t, nx, ny)) {
        if (!this.blockedAt(t, nx, t.y)) { t.vy = -t.vy * 0.5; ny = t.y; }
        else if (!this.blockedAt(t, t.x, ny)) { t.vx = -t.vx * 0.5; nx = t.x; }
        else { t.vx = -t.vx * 0.4; t.vy = -t.vy * 0.4; nx = t.x; ny = t.y; }
      }
      t.x = nx; t.y = ny; t.vx *= k; t.vy *= k;
      if (t.roll) t.ang += (t.vx >= 0 ? 1 : -1) * sp * sec / t.roll * 180 / Math.PI;   // 毛線球：滾動
      else t.ang += t.dir * t.spin * (sp / t.speed) * sec;                            // 魚、逗貓棒：原地打轉
    }
    this.syncToys();
    if (this.deskOcc) this.deskFront.setVisible(this.deskOcc.img.visible && this.deskKey() !== 'ix_desk_o_s');
  }

  syncToys() {
    for (const t of this.toys) {
      t.spr.setPosition(t.x, t.y).setDepth(t.y + t.h * 0.22);
      if (t.roll) t.spr.setAngle(t.ang);                  // 毛線球：整顆在畫面上滾
      else {
        // 魚、逗貓棒是「躺在地上」轉：長軸在地板上轉一圈，畫面上看起來前後方向會變短（不會像站起來）
        const th = (t.ang - (t.angle || 0)) * Math.PI / 180, dx = Math.cos(th), dy = 0.38 * Math.sin(th), flip = dx < 0;
        const a = flip ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx);
        t.spr.setFlipX(flip).setAngle((t.angle || 0) + a * 180 / Math.PI).setScale(0.5 * Math.max(0.55, Math.hypot(dx, dy)), 0.5 * (t.scaleY || 1));
      }
      t.shadow.setPosition(t.x, t.y + t.h * 0.28);
    }
  }
}
