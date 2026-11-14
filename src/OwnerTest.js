/* =========================================================
 * OwnerTest — 主人動畫測試模式
 *   左：未對齊　右：對齊後（遊戲使用）→ 兩邊同步播放，十字線固定在臉部錨點，看得出漂移
 *   美術：v1（Owner Animation Pack）／v2（38 格概念總表），按鈕或 A 鍵切換
 *   背景：深色／淺色／棋盤格／床鋪（重影檢查：把動畫疊在原臥室背景上）
 *   問題標示：逐幀顯示自動偵測到的去背問題（破洞、殘影、碎片、暗邊）
 *   警覺值滑桿 + 自動模式：驗證 Sleeping → Restless → Awake 的切換門檻
 * 鍵盤：Z/X/V/C 四種狀態（V = Peek 偷看） · A 切換美術版本 · G 換背景 · I 問題標示 · H 十字線 · L 圓形近景取景 · T 自動模式 · ←/→ 警覺值
 * ========================================================= */
const OT_W = 1672, OT_H = 941;
const OT_FONT = '"Zen Maru Gothic", "Noto Sans TC", sans-serif';
const OT_PANEL = { w: 640, h: 480, y: 168 };
const OT_ROOM_SCALE = { v1: 1, v2: 2.5, v3: 2.8, v4: 2.8, v5: 2.3 };      // 床鋪重影檢查：幀座標比臥室大圖放大多少
const OT_BGS = [['dark', '深色'], ['light', '淺色'], ['checker', '棋盤格'], ['bed', '床鋪（重影檢查）']];

class OwnerTest extends Phaser.Scene {
  constructor() { super('OwnerTest'); }

  preload() {
    preloadOwner(this, { raw: true });
    for (const [art, A] of Object.entries(OWNER_ART)) if (!window[A.inline]) this.load.json('ownerIssues_' + art, A.dir + 'owner_issues.json');
    const IN = window.SUNLIGHT_BEDROOM_INLINE;
    if (!this.textures.exists('room')) this.load.image('room', IN ? IN.images.bedroom_full : 'assets/bedroom/bedroom_full.webp');
  }

  create() {
    createOwnerAnimations(this);
    this.issues = {};
    for (const [art, A] of Object.entries(OWNER_ART)) this.issues[art] = window[A.inline] ? window[A.inline].issues : this.cache.json.get('ownerIssues_' + art);
    const cfg = window.SUNLIGHT_BEDROOM_INLINE ? window.SUNLIGHT_BEDROOM_INLINE.config : null;
    this.art = this.art || (cfg && OWNER_ART[cfg.ownerArt] ? cfg.ownerArt : 'v2');
    this.cameras.main.setBackgroundColor('#f4efe8');
    this.bgMode = 'dark'; this.showIssues = true; this.showCross = true; this.showLens = true; this.auto = false;
    this.alert = 0; this.restlessCooldown = 0; this.lastAlert = 0;

    const txt = (x, y, s, size = 22, color = '#4a3f3a', bold = false) =>
      this.add.text(x, y, s, { fontFamily: OT_FONT, fontSize: size + 'px', color, fontStyle: bold ? '700' : '500' });
    txt(48, 30, '③ 主人動畫測試', 32, '#3d332e', true);
    txt(48, 76, 'Z／X／V／C 切換狀態　·　A 切換美術版本　·　G 背景　·　I 問題標示　·　H 十字線　·　L 圓形近景取景　·　T 自動切換　·　←／→ 警覺值', 19, '#8a7a6e');

    /* ---- 兩個面板 ---- */
    const gap = (OT_W - OT_PANEL.w * 2) / 3;
    this.panels = [
      { x: gap, title: '未對齊', raw: true },
      { x: gap * 2 + OT_PANEL.w, title: '對齊後（遊戲使用）', raw: false },
    ].map(p => this.makePanel(p));

    /* ---- 控制列 ---- */
    this.buttons = [];
    let bx = gap;
    const by = OT_PANEL.y + OT_PANEL.h + 62;
    for (const s of ['sleeping', 'restless', 'peek', 'awake']) {
      bx = this.makeButton(bx, by, OWNER_LABEL[s], () => { this.auto = false; this.setState(s); }, () => this.state === s) + 10;
    }
    bx += 20;
    for (const art of Object.keys(OWNER_ART)) bx = this.makeButton(bx, by, art, () => this.setArt(art), () => this.art === art) + 8;
    bx += 20;
    txt(bx, by + 9, '背景', 19, '#8a7a6e'); bx += 52;
    for (const [m, label] of OT_BGS) bx = this.makeButton(bx, by, label, () => this.setBg(m), () => this.bgMode === m) + 10;
    let bx2 = gap;
    const by2 = by + 58;
    bx2 = this.makeButton(bx2, by2, '問題標示', () => { this.showIssues = !this.showIssues; }, () => this.showIssues) + 10;
    bx2 = this.makeButton(bx2, by2, '十字線', () => { this.showCross = !this.showCross; }, () => this.showCross) + 10;
    bx2 = this.makeButton(bx2, by2, '圓形近景取景', () => { this.showLens = !this.showLens; }, () => this.showLens) + 10;
    bx2 = this.makeButton(bx2, by2, '依警覺值自動切換', () => { this.auto = !this.auto; }, () => this.auto) + 40;

    // 警覺值滑桿
    this.slider = { x: bx2 + 150, y: by2 + 22, w: OT_W - gap - (bx2 + 150) - 90 };
    txt(bx2, by2 + 9, '主人警覺值', 19, '#8a7a6e');
    this.sliderG = this.add.graphics();
    this.alertText = txt(this.slider.x + this.slider.w + 18, by2 + 7, '0%', 22, '#4a3f3a', true);
    const zone = this.add.zone(this.slider.x - 10, this.slider.y - 22, this.slider.w + 20, 44).setOrigin(0).setInteractive({ useHandCursor: true });
    const setFromPointer = p => { this.alert = Phaser.Math.Clamp((p.x - this.slider.x) / this.slider.w * 100, 0, 100); };
    zone.on('pointerdown', setFromPointer);
    this.input.on('pointermove', p => { if (p.isDown && p.y > this.slider.y - 30 && p.y < this.slider.y + 30) setFromPointer(p); });

    this.status = txt(gap, OT_H - 70, '', 18, '#6b5d52').setLineSpacing(6);

    const kb = this.input.keyboard;
    kb.on('keydown-Z', () => { this.auto = false; this.setState('sleeping'); });
    kb.on('keydown-X', () => { this.auto = false; this.setState('restless'); });
    kb.on('keydown-C', () => { this.auto = false; this.setState('awake'); });
    kb.on('keydown-V', () => { this.auto = false; this.setState('peek'); });
    kb.on('keydown-L', () => { this.showLens = !this.showLens; });
    kb.on('keydown-A', () => { const ks = Object.keys(OWNER_ART); this.setArt(ks[(ks.indexOf(this.art) + 1) % ks.length]); });
    kb.on('keydown-G', () => { const i = OT_BGS.findIndex(b => b[0] === this.bgMode); this.setBg(OT_BGS[(i + 1) % OT_BGS.length][0]); });
    kb.on('keydown-I', () => { this.showIssues = !this.showIssues; });
    kb.on('keydown-H', () => { this.showCross = !this.showCross; });
    kb.on('keydown-T', () => { this.auto = !this.auto; });
    this.keys = kb.addKeys('LEFT,RIGHT');

    this.setBg('dark');
    this.setState('sleeping');
  }

  makePanel(p) {
    const { w, h, y } = OT_PANEL;
    const P = { ...p, cx: p.x + w / 2, cy: y + h / 2 };
    P.bgG = this.add.graphics().setDepth(0);
    P.over = this.add.graphics().setDepth(3);
    P.frameText = this.add.text(p.x, y + h + 14, '', { fontFamily: OT_FONT, fontSize: '19px', color: '#6b5d52' });
    P.titleText = this.add.text(p.x, y - 38, '', { fontFamily: OT_FONT, fontSize: '22px', color: '#3d332e', fontStyle: '700' });
    P.maskG = this.make.graphics({ add: false }).fillStyle(0xffffff).fillRoundedRect(p.x, y, w, h, 18);
    P.bgG.setMask(P.maskG.createGeometryMask());
    this.buildPanelArt(P);
    return P;
  }

  /** 依目前的美術版本建立面板內容（切換 v1／v2 時重建） */
  buildPanelArt(P) {
    if (P.owner) { P.owner.sprite.destroy(); P.owner.removeAllListeners(); }
    if (P.room) P.room.destroy();
    const A = OWNER_ART[this.art], { w, h } = OT_PANEL;
    const scale = Math.min(w / A.frame.w, h / A.frame.h);
    const fx = P.cx - A.frame.w * scale / 2, fy = P.cy - A.frame.h * scale / 2;
    // 床鋪背景：把臥室原圖對齊到主人的臉（臉部中心 1370,430 ↔ 幀錨點）
    const rs = OT_ROOM_SCALE[this.art];
    const crop = { x: 1370 - A.anchor.x / rs, y: 430 - A.anchor.y / rs, w: A.frame.w / rs, h: A.frame.h / rs };
    P.room = this.add.image(fx - crop.x * scale * rs, fy - crop.y * scale * rs, 'room').setOrigin(0).setScale(scale * rs)
      .setCrop(crop.x, crop.y, crop.w, crop.h).setVisible(this.bgMode === 'bed').setDepth(1);
    P.owner = new OwnerSprite(this, P.cx, P.cy, { scale, art: this.art, raw: P.raw });
    P.owner.sprite.setDepth(2);
    [P.room, P.owner.sprite].forEach(o => o.setMask(P.maskG.createGeometryMask()));
    P.owner.on('awakeComplete', () => { if (!P.raw) this.awakeDone = true; });
    Object.assign(P, { scale, fx, fy });
    P.titleText.setText(`${P.title}　${A.label}`);
  }

  setArt(art) {
    if (art === this.art) return;
    this.art = art;
    this.panels.forEach(p => this.buildPanelArt(p));
    this.setState(this.state || 'sleeping');
  }

  makeButton(x, y, label, onClick, isActive) {
    const g = this.add.graphics();                       // 先建背景，文字才會在上層
    const t = this.add.text(0, 0, label, { fontFamily: OT_FONT, fontSize: '19px', color: '#4a3f3a', fontStyle: '700' });
    const w = t.width + 34, h = 44;
    t.setPosition(x + 17, y + (h - t.height) / 2);
    const z = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    z.on('pointerdown', onClick);
    this.buttons.push({ x, y, w, h, g, t, isActive });
    return x + w;
  }

  setBg(mode) {
    this.bgMode = mode;
    for (const p of this.panels) {
      const g = p.bgG.clear(), { w, h, y } = OT_PANEL;
      if (mode === 'dark') g.fillStyle(0x2a2238).fillRect(p.x, y, w, h);
      if (mode === 'light') g.fillStyle(0xf8f2ea).fillRect(p.x, y, w, h);
      if (mode === 'checker') {
        for (let yy = 0; yy < h; yy += 20) for (let xx = 0; xx < w; xx += 20)
          g.fillStyle(((xx + yy) / 20) % 2 ? 0xbdbdbd : 0xe8e8e8).fillRect(p.x + xx, y + yy, 20, 20);
      }
      if (mode === 'bed') g.fillStyle(0x2a2238).fillRect(p.x, y, w, h);
      p.room.setVisible(mode === 'bed');
    }
  }

  setState(s) {
    this.state = s;
    this.awakeDone = false;
    this.panels.forEach(p => p.owner.play(s));
  }

  update(_, dt) {
    // 警覺值
    if (this.keys.LEFT.isDown) this.alert = Math.max(0, this.alert - dt * 0.06);
    if (this.keys.RIGHT.isDown) this.alert = Math.min(100, this.alert + dt * 0.06);
    this.restlessCooldown = Math.max(0, this.restlessCooldown - dt);
    if (this.auto) {
      const T = OWNER_MISSION_DEFAULTS;
      if (this.alert >= T.failAt) { if (this.state !== 'awake') this.setState('awake'); }
      else if (this.state === 'awake') this.setState('sleeping');
      else if (this.state === 'peek' || this.state === 'restless') {
        if (!this.panels[1].owner.sprite.anims.isPlaying) this.state = 'sleeping';
      }
      else if (this.alert >= T.peekAt && this.state === 'sleeping' && this.restlessCooldown <= 0) {
        this.setState('peek'); this.restlessCooldown = T.peekCooldown * 1000;
      }
      else if (this.alert >= T.restlessAt && this.state === 'sleeping' && this.restlessCooldown <= 0) {
        this.setState('restless'); this.restlessCooldown = T.restlessCooldown * 1000;
      }
    }
    this.lastAlert = this.alert;

    // 面板疊加：十字線、問題框、幀資訊
    for (const p of this.panels) {
      const g = p.over.clear(), sc = p.scale, o = p.owner, A = OWNER_ART[this.art];
      const fi = o.frameIndex, st = o.state, tf = o.textureFrame;
      if (this.showCross) {
        const ax = p.fx + A.anchor.x * sc, ay = p.fy + A.anchor.y * sc;
        g.lineStyle(2, 0xff5a4a, 0.95).lineBetween(ax - 26, ay, ax + 26, ay).lineBetween(ax, ay - 26, ax, ay + 26);
        g.lineStyle(1, 0xffffff, 0.35).strokeRect(p.fx, p.fy, A.frame.w * sc, A.frame.h * sc);
      }
      const iss = this.issues[this.art];
      if (this.showIssues && !p.raw && iss) {
        for (const is of (iss[tf.set] || [])[tf.index] || []) {
          const [x, y, w, h] = is.box;
          const col = { hole: 0xff4fa3, fragment: 0xffb020, tab: 0x4fc3ff, halo: 0xb48cff }[is.type];
          g.lineStyle(2.5, col, 1).strokeRect(p.fx + x * sc - 3, p.fy + y * sc - 3, w * sc + 6, h * sc + 6);
        }
      }
      if (this.showLens && !p.raw) {
        // 第一關實際使用的圓形近景取景範圍（圓外的卡片邊緣／殘影不會出現在遊戲裡）
        g.lineStyle(3, 0x7ff7ff, 0.95).strokeCircle(p.fx + A.lens.cx * sc, p.fy + A.lens.cy * sc, A.lens.r * sc);
        const C = A.closeup;
        if (st === 'awake') g.lineStyle(2, 0x7ff7ff, 0.6).strokeRoundedRect(p.fx + C.x * sc, p.fy + C.y * sc, C.w * sc, C.h * sc, 12);
      }
      const I = ownerAnimInfo(this.art, st);
      p.frameText.setText(`${OWNER_LABEL[st]}　·　第 ${fi + 1} / ${I.frames} 幀${st === 'peek' && A.peek ? `（Awake 第 ${tf.index + 1} 幀）` : ''}　·　${+I.frameRate.toFixed(2)} FPS　·　${I.repeat < 0 ? '循環' : '播放一次'}`);
    }

    // 按鈕狀態
    for (const b of this.buttons) {
      const on = b.isActive();
      b.g.clear().fillStyle(on ? 0xc98a5e : 0xfffdf9, 1).fillRoundedRect(b.x, b.y, b.w, b.h, 22)
        .lineStyle(1.5, on ? 0xc98a5e : 0xe0d4c4, 1).strokeRoundedRect(b.x, b.y, b.w, b.h, 22);
      b.t.setColor(on ? '#ffffff' : '#4a3f3a');
    }
    // 滑桿
    const S = this.slider, T = OWNER_MISSION_DEFAULTS, g = this.sliderG.clear();
    g.fillStyle(0xe6dccf).fillRoundedRect(S.x, S.y - 7, S.w, 14, 7);
    const col = this.alert >= T.failAt ? 0xd2694f : this.alert >= T.restlessAt ? 0xe0a050 : 0x7fb48a;
    g.fillStyle(col).fillRoundedRect(S.x, S.y - 7, Math.max(14, S.w * this.alert / 100), 14, 7);
    g.lineStyle(2, 0x8a7a6e, 0.8).lineBetween(S.x + S.w * T.restlessAt / 100, S.y - 16, S.x + S.w * T.restlessAt / 100, S.y + 16);
    g.fillStyle(0xffffff).fillCircle(S.x + S.w * this.alert / 100, S.y, 13).lineStyle(2, col).strokeCircle(S.x + S.w * this.alert / 100, S.y, 13);
    this.alertText.setText(Math.round(this.alert) + '%');

    const legend = this.showIssues ? '\n問題框：粉＝破洞　黃＝碎片／標註線／被畫布切到　藍＝底部殘影　紫＝暗邊／白邊　｜　青圈＝第一關的圓形近景取景（圓外不會出現在遊戲中）' : '';
    this.status.setText(`門檻：${T.warnAt}% 預兆、${T.restlessAt}% Restless、${T.peekAt}% Peek（播完都回 Sleeping）、${T.failAt}% Awake${this.awakeDone ? '　→　Awake 播完（正式任務在這裡判定失敗）' : ''}${legend}`);
  }
}
