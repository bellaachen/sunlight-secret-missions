/* =========================================================
 * MissionHUD — 任務相關的畫面（只負責畫，不改規則）
 *   任務卡（左上）· 主人警覺值（上方中央）· 圓形情緒近景（右上）
 *   腳邊目標標記 · 睡覺進度環 · 驚醒大特寫 · 失敗／成功結算
 * ========================================================= */
const HUD_FONT = '"Zen Maru Gothic", "Noto Sans TC", sans-serif';
const STAGE_UI = {
  calm:     { color: 0x7fb48a, chip: '💤 熟睡中' },
  stir:     { color: 0xc9b25a, chip: '… 睡得不太安穩' },
  restless: { color: 0xe0a050, chip: '⚠ 翻來翻去' },
  peek:     { color: 0xe07a50, chip: '👀 在偷看！先別動' },
  awake:    { color: 0xd2694f, chip: '!! 醒了' },
};

class MissionHUD {
  constructor(scene, { mission, alert, params, W, H, portrait = false }) {
    this.s = scene; this.m = mission; this.a = alert; this.p = params; this.W = W; this.H = H;
    this.portrait = portrait;
    this.cardDY = portrait ? 132 : 0;      // 直式：任務卡往下移，讓出上方的警覺值條
    if (portrait) this.p = { ...params, lens: { ...params.lens, x: W - 140, y: 300 } };   // 直式：近景圓移到房間右上
    this.lensAlpha = 0; this.zTimer = 0; this.napZTimer = 0; this.t = 0;
    this.buildCard();
    this.buildMeter();
    this.buildLens();
    this.feetG = scene.add.graphics().setDepth(1);
    this.napG = scene.add.graphics().setDepth(7000);
  }

  text(x, y, str, size = 20, color = '#4a3328', bold = false, depth = 9001) {
    return this.s.add.text(x, y, str, { fontFamily: HUD_FONT, fontSize: size + 'px', color, fontStyle: bold ? '700' : '500' }).setDepth(depth);
  }

  /* ---------------- 任務卡 ----------------
   * 平常：上方一條膠囊「📍 位置　🐾 2/3 目前步驟」
   * 展開：任務開始 4.5 秒、完成步驟 3 秒、按住 Tab
   * 阿光碰到膠囊或卡片 → 自動變淡，不擋住貓爬架和書櫃頂端
   */
  buildCard() {
    this.pillG = this.s.add.graphics().setDepth(9000);
    this.pillText = this.text(46, 35, '', 20, '#4a3328', true);
    this.cardG = this.s.add.graphics().setDepth(9000);
    this.cardTitle = this.text(46, 96 + this.cardDY, '🐾 今晚的秘密任務', 21, '#4a3328', true);
    this.cardCount = this.text(0, 98 + this.cardDY, '', 19, '#a07e68', true);
    this.cardName = this.text(46, 128 + this.cardDY, this.m.def.title, 25, '#3d2a22', true);
    this.rows = this.m.steps.concat(this.m.bonus).map(() => this.text(0, 0, '', 19, '#4a3328'));
    this.cardParts = [this.cardG, this.cardTitle, this.cardCount, this.cardName, ...this.rows];
    this.pillParts = [this.pillG, this.pillText];
    this.cardAlpha = 1; this.pillAlpha = 1; this.cardOpen = 0;
    this.expandUntil = 4500;
    this.tabKey = this.s.input.keyboard.addKey('TAB');
    this.m.on('step', () => { this.expandUntil = Math.max(this.expandUntil, this.t + 3000); });
    this.m.on('bonus', () => { this.expandUntil = Math.max(this.expandUntil, this.t + 3000); });
  }

  drawCard(dt, cat, location) {
    const m = this.m, x = 24, y = 84 + this.cardDY, w = 440;
    const rowsY = 172 + this.cardDY, rowH = 34, n = this.rows.length;
    const h = rowsY - y + n * rowH + 14;
    const cur = m.current;
    const done = m.steps.filter(s => s.done).length;
    const stepNo = Math.min(done + (m.state === 'active' ? 1 : 0), m.steps.length);

    // 膠囊
    let step = m.state === 'success' ? '任務完成' : m.state === 'failed' ? '任務失敗' : cur ? cur.text : '';
    if (cur && cur.id === 'nap' && m.napT > 0) step += `　${(m.napT / 1000).toFixed(1)}/${m.def.napSeconds} 秒`;
    this.pillText.setText(`📍 ${location}　·　🐾 ${stepNo}/${m.steps.length} ${step}`);
    const pw = this.pillText.width + 44, pill = this.pillRect = new Phaser.Geom.Rectangle(x, 22, pw, 48);
    this.pillG.clear().fillStyle(0xfffaf3, 0.94).fillRoundedRect(pill.x, pill.y, pill.width, pill.height, 24);

    // 展開／收合
    const open = this.t < this.expandUntil || this.tabKey.isDown;
    this.cardOpen = Phaser.Math.Linear(this.cardOpen, open ? 1 : 0, Math.min(1, dt / 120));
    const card = new Phaser.Geom.Rectangle(x, y, w, h);

    // 阿光碰到就變淡
    const b = cat.sprite.getBounds();
    // 直式：介面和房間是不同鏡頭，座標不能直接比 → 用阿光在螢幕上的位置
    if (this.portrait) { const c = this.s.cameras.main, Z = this.s.UIZ; b.setTo(c.x / Z + (b.x - c.worldView.x) * c.zoom / Z, c.y / Z + (b.y - c.worldView.y) * c.zoom / Z, b.width * c.zoom / Z, b.height * c.zoom / Z); }
    const hitPill = Phaser.Geom.Intersects.RectangleToRectangle(b, pill);
    const hitCard = open && Phaser.Geom.Intersects.RectangleToRectangle(b, card);
    this.pillAlpha = Phaser.Math.Linear(this.pillAlpha, hitPill || hitCard ? 0.22 : 1, Math.min(1, dt / 120));
    this.cardAlpha = Phaser.Math.Linear(this.cardAlpha, hitCard || hitPill ? 0.22 : 1, Math.min(1, dt / 120));
    this.pillParts.forEach(o => o.setAlpha(this.pillAlpha));
    const ca = this.cardAlpha * this.cardOpen;
    this.cardParts.forEach(o => o.setAlpha(ca).setVisible(ca > 0.01));
    if (ca <= 0.01) return;

    this.cardG.clear().fillStyle(0xfffaf3, 0.94).fillRoundedRect(x, y, w, h, 20);
    this.cardCount.setText(`${stepNo} / ${m.steps.length}`).setX(x + w - 22 - this.cardCount.width);
    m.steps.concat(m.bonus).forEach((s, i) => {
      const ry = rowsY + i * rowH, isBonus = i >= m.steps.length, active = s === cur && m.state === 'active';
      const g = this.cardG;
      if (active) g.fillStyle(0xf3e4d2, 1).fillRoundedRect(x + 12, ry - 4, w - 24, rowH - 2, 10);
      const cx = x + 36, cy = ry + 13;
      if (s.done) { g.fillStyle(0x7fb48a, 1).fillCircle(cx, cy, 10); g.lineStyle(3, 0xffffff, 1).lineBetween(cx - 5, cy, cx - 1, cy + 4).lineBetween(cx - 1, cy + 4, cx + 6, cy - 4); }
      else g.lineStyle(2.5, isBonus ? 0xd8a24a : (active ? 0xc98a5e : 0xcdbfae), 1).strokeCircle(cx, cy, 9);
      let label = (isBonus ? '★ ' : '') + s.text;
      if (s.id === 'nap' && active && m.napT > 0) label += `　${(m.napT / 1000).toFixed(1)} / ${m.def.napSeconds} 秒`;
      if (isBonus && s.points) label += `（+${s.points}）`;
      this.rows[i].setText(label).setPosition(x + 56, ry).setColor(s.done ? '#9a8a7e' : active ? '#3d2a22' : isBonus ? '#a07a3a' : '#6b5d52')
        .setFontStyle(active ? '700' : '500');
    });
  }

  /* ---------------- 警覺值 ---------------- */
  buildMeter() {
    this.meterG = this.s.add.graphics().setDepth(9000);
    this.meterLabel = this.text(0, 0, '👁 主人警覺值', 22, '#4a3328', true);
    this.meterPct = this.text(0, 0, '', 22, '#4a3328', true);
  }

  drawMeter() {
    const P = this.p, v = this.a.value, st = STAGE_UI[this.a.stage];
    const bw = this.portrait ? 250 : 280, x0 = this.portrait ? 24 : this.W / 2 - 250, y0 = this.portrait ? 84 : 22;
    this.meterLabel.setPosition(x0 + 22, y0 + 12);
    const bx = x0 + 22 + this.meterLabel.width + 16;
    const g = this.meterG.clear();
    g.fillStyle(0xfffaf3, 0.94).fillRoundedRect(x0, y0, bx - x0 + bw + 92, 50, 25);
    g.fillStyle(0xe6dccf, 1).fillRoundedRect(bx, y0 + 18, bw, 14, 7);
    const shake = this.a.stage === 'peek' ? Math.sin(this.t / 40) * 1.5 : 0;
    g.fillStyle(st.color, 1).fillRoundedRect(bx + shake, y0 + 18, Math.max(14, bw * v / 100), 14, 7);
    for (const th of [P.warnAt, P.restlessAt, P.peekAt]) g.lineStyle(2, 0x8a7a6e, 0.55).lineBetween(bx + bw * th / 100, y0 + 13, bx + bw * th / 100, y0 + 37);
    this.meterPct.setText(Math.round(v) + '%').setPosition(bx + bw + 16, y0 + 12);
  }

  /* ---------------- 圓形情緒近景 ---------------- */
  buildLens() {
    const L = this.p.lens;
    this.lensRim = this.s.add.graphics().setDepth(8400);
    this.lensOwner = this.a.owner;          // AlertSystem 控制的那一個主人
    this.lensOwner.sprite.setDepth(8401);
    this.lensMaskG = this.s.make.graphics({ add: false });
    this.lensOwner.sprite.setMask(this.lensMaskG.createGeometryMask());
    this.lensRing = this.s.add.graphics().setDepth(8402);
    this.lensChip = this.text(0, 0, '', 19, '#4a3328', true, 8403).setOrigin(0.5).setPadding(12, 5, 12, 5).setBackgroundColor('#fffaf3ee');
    this.lensParts = [this.lensRim, this.lensOwner.sprite, this.lensRing, this.lensChip];
    this.zs = [];
  }

  drawLens(dt, visible) {
    const L = this.p.lens, a = this.a, st = a.stage;
    this.lensAlpha = Phaser.Math.Linear(this.lensAlpha, visible ? 1 : 0, Math.min(1, dt / 140));
    this.lensParts.forEach(o => o.setAlpha(this.lensAlpha));
    // 半徑隨警覺值變大；翻身／偷看時再放大一點
    const react = st === 'restless' ? 10 : st === 'peek' ? 18 : 0;
    const target = L.rCalm + (L.rAlert - L.rCalm) * Phaser.Math.Clamp(a.value / 100, 0, 1) + react;
    this.lensR = Phaser.Math.Linear(this.lensR || L.rCalm, target, Math.min(1, dt / 160));
    const wob = st === 'calm' ? 0 : st === 'stir' ? 1.5 : st === 'restless' ? 3 : 4.5;
    const cx = L.x + Math.sin(this.t / 90) * wob, cy = L.y + Math.cos(this.t / 120) * wob * 0.6;
    const A = this.lensOwner.art, LZ = A.lens, R = this.lensR, sc = R / LZ.r;
    const spr = this.lensOwner.sprite;
    spr.setScale(sc).setPosition(cx - (LZ.cx - A.frame.w / 2) * sc, cy - (LZ.cy - A.frame.h / 2) * sc);
    this.lensMaskG.clear().fillStyle(0xffffff).fillCircle(cx, cy, R);
    const col = STAGE_UI[st].color;
    this.lensRim.clear().fillStyle(col, 0.22).fillCircle(cx, cy, R + 14).fillStyle(0x2a2238, 1).fillCircle(cx, cy, R);
    this.lensRing.clear().lineStyle(6, 0xfffaf3, 1).strokeCircle(cx, cy, R).lineStyle(2, col, 0.9).strokeCircle(cx, cy, R + 6);
    this.lensChip.setText(STAGE_UI[st].chip).setPosition(cx, cy + R + 26);
    // 熟睡時飄 Zzz；有動靜（≥ warnAt）就停 → 第一個預兆
    this.zTimer -= dt;
    if (st === 'calm' && a.owner.state === 'sleeping' && this.zTimer <= 0 && this.lensAlpha > 0.5) {
      this.zTimer = 900;
      const z = this.text(cx + R * 0.55, cy - R * 0.55, 'z', 22 + Math.random() * 8, '#fffaf3', true, 8404);
      this.s.tweens.add({ targets: z, x: z.x + 22, y: z.y - 40, alpha: 0, duration: 1600, onComplete: () => z.destroy() });
    }
  }

  /* ---------------- 腳邊目標與睡覺進度 ---------------- */
  drawFeet(cat) {
    const m = this.m, z = m.def.feetZone, g = this.feetG.clear(), ng = this.napG.clear();
    const show = m.state === 'active' && m.isDone('onBed') && !m.isDone('nap');
    if (show) {
      const pulse = 0.35 + 0.25 * Math.sin(this.t / 260);
      g.fillStyle(0xfff3d6, pulse * 0.5).fillEllipse(z.x, z.y, z.rx * 2, z.ry * 2);
      g.lineStyle(3, 0xfff3d6, pulse + 0.3).strokeEllipse(z.x, z.y, z.rx * 2, z.ry * 2);
      if (!m.isDone('reachFeet')) this.feetLabel = this.feetLabel || this.text(z.x, z.y - z.ry - 30, '🐾 主人的腳邊', 20, '#fffaf3', true, 7001).setOrigin(0.5);
    }
    if (this.feetLabel) this.feetLabel.setVisible(show && !m.isDone('reachFeet'));
    if (m.napT > 0 && m.state === 'active') {
      const s = cat.sprite, need = m.def.napSeconds * 1000, k = Math.min(1, m.napT / need);
      const cx = s.x, cy = s.y - s.displayHeight * 0.5, r = 50;
      ng.lineStyle(7, 0x2a2238, 0.35).strokeCircle(cx, cy, r);
      ng.lineStyle(7, 0xfff3d6, 1).beginPath().arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
      this.napZTimer -= 16;
      if (this.napZTimer <= 0) {
        this.napZTimer = 520;
        const z = this.text(cx + 18, cy - 34, 'z', 20, '#fffaf3', true, 7002);
        this.s.tweens.add({ targets: z, x: z.x + 18, y: z.y - 34, alpha: 0, duration: 1300, onComplete: () => z.destroy() });
      }
    }
  }

  float(x, y, str, color = '#fffaf3', size = 26) {
    const t = this.text(x, y, str, size, color, true, 9400).setOrigin(0.5).setStroke('#4a3328', 5);
    t.worldUI = true;   // 飄字跟著房間位置（直式時畫在房間鏡頭）
    this.s.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1100, ease: 'Sine.Out', onComplete: () => t.destroy() });
  }

  update(dt, cat, lensVisible, location = '') {
    this.t += dt;
    this.drawCard(dt, cat, location);
    this.drawMeter();
    this.drawLens(dt, lensVisible);
    this.drawFeet(cat);
  }

  /* ---------------- 結束畫面 ---------------- */
  dim() {
    const d = this.s.add.rectangle(0, 0, this.W, this.H, 0x1d1420, 0.5).setOrigin(0).setDepth(9600).setAlpha(0);
    this.s.tweens.add({ targets: d, alpha: 1, duration: 260 });
  }

  /** 驚醒大特寫（情境式分割鏡頭），播完 Awake 後顯示失敗卡 */
  showWakeCloseup(onReady) {
    this.dim();
    this.lensParts.forEach(o => o.setVisible(false));
    const A = this.lensOwner.art, C = A.closeup, sc = 500 / C.w, w = C.w * sc, h = C.h * sc;
    const cx = this.W / 2, cy = this.H / 2 - 60, x0 = cx - w / 2, y0 = cy - h / 2;
    const bg = this.s.add.graphics().setDepth(9610).fillStyle(0x2a2238, 1).fillRoundedRect(x0, y0, w, h, 30);
    const big = new OwnerSprite(this.s, x0 + (A.frame.w / 2 - C.x) * sc, y0 + (A.frame.h / 2 - C.y) * sc, { scale: sc, art: this.lensOwner.artKey });
    big.sprite.setDepth(9611);
    const mg = this.s.make.graphics({ add: false }).fillStyle(0xffffff).fillRoundedRect(x0, y0, w, h, 30);
    big.sprite.setMask(mg.createGeometryMask());
    const ring = this.s.add.graphics().setDepth(9612).lineStyle(8, 0xfffaf3, 1).strokeRoundedRect(x0, y0, w, h, 30);
    const tag = this.text(x0 + 24, y0 + 20, '!!', 40, '#d2694f', true, 9613).setStroke('#fffaf3', 8);
    [bg, big.sprite, ring, tag].forEach(o => { o.x += 80; o.setAlpha(0); this.s.tweens.add({ targets: o, x: o.x - 80, alpha: 1, duration: 280, ease: 'Back.Out' }); });
    big.play('awake');
    big.once('awakeComplete', () => onReady && onReady({ y: y0 + h }));
  }

  showFail(r, belowY) {
    const w = 560, h = 120, x = this.W / 2 - w / 2, y = Math.min(belowY + 24, this.H - h - 20);
    this.s.add.graphics().setDepth(9620).fillStyle(0xfffaf3, 0.97).fillRoundedRect(x, y, w, h, 24);
    this.text(this.W / 2, y + 36, '主人醒來了！任務失敗', 32, '#4a3328', true, 9621).setOrigin(0.5);
    this.text(this.W / 2, y + 86, (this.s.touch ? '點一下畫面重新開始' : '按 Space 重新開始'), 22, '#8a6a58', false, 9621).setOrigin(0.5);
  }

  showSuccess(r) {
    this.dim();
    const w = 620, rowH = 40, h = 250 + r.lines.length * rowH + (r.title ? 54 : 0);
    const x = this.W / 2 - w / 2, y = this.H / 2 - h / 2;
    const g = this.s.add.graphics().setDepth(9620).fillStyle(0xfffaf3, 0.98).fillRoundedRect(x, y, w, h, 30);
    const objs = [g];
    objs.push(this.text(this.W / 2, y + 48, '任務完成！', 40, '#4a3328', true, 9621).setOrigin(0.5));
    objs.push(this.text(this.W / 2, y + 96, '阿光在主人腳邊睡著了 💤', 22, '#8a6a58', false, 9621).setOrigin(0.5));
    let yy = y + 140;
    g.lineStyle(1.5, 0xe6dccf, 1).lineBetween(x + 40, yy - 12, x + w - 40, yy - 12);
    for (const [label, pts] of r.lines) {
      objs.push(this.text(x + 56, yy, label, 22, '#4a3328', false, 9621));
      objs.push(this.text(x + w - 56, yy, `+${pts}`, 22, '#4a3328', true, 9621).setOrigin(1, 0));
      yy += rowH;
    }
    g.lineStyle(1.5, 0xe6dccf, 1).lineBetween(x + 40, yy + 4, x + w - 40, yy + 4);
    objs.push(this.text(x + 56, yy + 16, '肉泥點數', 24, '#4a3328', true, 9621));
    objs.push(this.text(x + w - 56, yy + 12, `${r.total}`, 32, '#c98a5e', true, 9621).setOrigin(1, 0));
    yy += 66;
    if (r.title) {
      objs.push(this.text(this.W / 2, yy, `獲得稱號：「${r.title}」`, 22, '#a07a3a', true, 9621).setOrigin(0.5, 0));
      yy += 54;
    }
    objs.push(this.text(this.W / 2, y + h - 40, `用時 ${r.seconds} 秒　·　${this.s.touch ? '點一下畫面再玩一次' : '按 Space 再玩一次'}`, 20, '#8a7a6e', false, 9621).setOrigin(0.5));
    objs.forEach(o => { o.setAlpha(0); this.s.tweens.add({ targets: o, alpha: 1, duration: 320, delay: 120 }); });
  }
}
