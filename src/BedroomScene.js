/* =========================================================
 * BedroomScene — 夜晚臥室互動場景（使用 Sun_Light_Bedroom_Scene_Pack 的美術）
 *
 * 規則來源：assets/bedroom/scene_config.json
 *   zones      互動點（approach = 地板觸發範圍，target = 跳上去的落點）
 *   requires   前置平台（例：desk 只接受 chair、cat_tower_3 只接受 tower_2）
 *   platforms  每個平台可以往哪裡去（exits）
 *   levels     平台落地點、遠近縮放基準
 *
 * 操作：WASD／方向鍵 移動 · Shift 潛行 · Space 跳躍（平台上按住方向鍵瞄準）· E 物品互動 · B Debug
 *
 * 床鋪近景任務（owner.js）：跳上床後右上角出現主人近景；在床上走動會讓「主人警覺值」上升，
 *   ≥ restlessAt 播放 Restless，≥ failAt 播放 Awake → 任務失敗（Space 重新開始）。
 * ========================================================= */
const ROOM_W = 1672, ROOM_H = 941;
const ROOM_OVERLAYS = ['desk', 'chair', 'cat_tree', 'pet_bed', 'bookshelf', 'nightstand'];
const OWNER_SCENE_SETS = ['sleeping', 'restless', 'awake'];
const BREATH_CYCLE_MS = 3600;   // 呼吸一次 3.6 秒：全景圖層與近景 Sleeping 共用
const UI_FONT = '"Zen Maru Gothic", "Noto Sans TC", sans-serif';

function ellipsePoints(e, n = 32, half = null) {
  const pts = [];
  const a0 = half === 'lower' ? 0 : 0, a1 = half === 'lower' ? Math.PI : Math.PI * 2;
  const steps = half ? n : n - 1;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / (half ? n : n));
    pts.push({ x: e.x + Math.cos(a) * e.rx, y: e.y + Math.sin(a) * e.ry });
  }
  return pts;
}

function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 凸包：桌腳之間的凹口在判斷前後時算「桌子底下」（凹口不影響遮擋判定，只影響碰撞） */
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** 多邊形在 x 位置的「前緣」y（最下面那條邊）。不在 x 範圍內回傳 null。 */
function frontEdgeY(poly, x) {
  let best = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.x <= x && b.x >= x) || (b.x <= x && a.x >= x)) {
      const y = a.x === b.x ? Math.max(a.y, b.y) : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

class BedroomScene extends Phaser.Scene {
  constructor() { super('BedroomScene'); }

  preload() {
    preloadSunLight(this);
    preloadOwner(this);
    const BIN = window.SUNLIGHT_BEDROOM_INLINE;
    // 床頭櫃的馬克杯（E 包：0 立著、1～6 倒下、7 倒在地上；128×128，杯底在 (64,112)）
    if (!this.textures.exists('cup')) {
      this.load.spritesheet('cup', BIN ? BIN.images.cup : 'assets/cup/cup.webp', { frameWidth: 128, frameHeight: 128 });
      this.load.image('water_spill', BIN ? BIN.images.water_spill : 'assets/cup/water_spill.webp');
    }
    // 阿光在腳邊捲成一團睡覺（D 包：0～5 趴下捲起來、6～9 呼吸循環；256×256，身體最低點 y=240）
    if (!this.textures.exists('sun_nap')) this.load.spritesheet('sun_nap', BIN ? BIN.images.sunlight_nap : 'assets/sunlight_nap/sunlight_nap.webp', { frameWidth: 256, frameHeight: 256 });
    // 房間裡床上的主人（C 包全景圖層，裁到人物範圍）
    if (!this.textures.exists('oscene_sleeping')) {
      const SM = BIN ? BIN.ownerScene : null;
      if (SM) OWNER_SCENE_SETS.forEach(k => this.load.spritesheet('oscene_' + k, BIN.images['owner_scene_' + k], { frameWidth: SM.frameWidth, frameHeight: SM.frameHeight }));
      else {
        this.load.json('osceneMeta', 'assets/bedroom/owner_scene.json');
        OWNER_SCENE_SETS.forEach(k => this.load.image('oscene_src_' + k, `assets/bedroom/owner_scene_${k}.webp`));
      }
    }
    const IN = window.SUNLIGHT_BEDROOM_INLINE, base = 'assets/bedroom/';
    if (!this.textures.exists('room')) {
      this.load.image('room', IN ? IN.images.bedroom_full : base + 'bedroom_full.webp');
      ROOM_OVERLAYS.forEach(n => this.load.image('ov_' + n, IN ? IN.images['overlay_' + n] : base + `overlay_${n}.webp`));
    }
    if (!IN) {
      this.load.json('bedroomCfg', base + 'scene_config.json');
      this.load.json('bedroomOv', base + 'overlays.json');
    }
  }

  create() {
    createSunLightAnimations(this);
    const IN = window.SUNLIGHT_BEDROOM_INLINE;
    const cfg = this.cfg = IN ? IN.config : this.cache.json.get('bedroomCfg');
    const ovMeta = IN ? IN.overlays : this.cache.json.get('bedroomOv');
    // 公開版（play.html 設定 window.SUNLIGHT_MODE = 'play'）：不套用編輯草稿、沒有 Debug／編輯模式
    this.play = window.SUNLIGHT_MODE === 'play';
    // 觸控模式（手機「點哪走哪」）：window.SUNLIGHT_TOUCH = true 強制開、'auto' 手機自動開；網址加 ?touch=1 可以在電腦上用滑鼠測
    const T = window.SUNLIGHT_TOUCH, q = new URLSearchParams(location.search).get('touch');
    this.touch = typeof TapNav !== 'undefined' && (q === '1' || T === true || (T === 'auto' && q !== '0' && window.matchMedia && matchMedia('(pointer: coarse)').matches));
    // 直式手機版：畫布是直的（dev.html 依螢幕決定），房間用主鏡頭放大、跟著阿光左右捲動；介面用另一個鏡頭畫在上下兩條
    this.portrait = this.touch && this.scale.height > this.scale.width;
    this.UIZ = this.portrait ? 1.5 : 1;                         // 介面放大倍率（直式時字才看得清楚）
    this.VW = this.scale.width / this.UIZ; this.VH = this.scale.height / this.UIZ;   // 介面座標的寬高
    this.draftApplied = !this.play && typeof LayoutEditor !== 'undefined' && LayoutEditor.applyDraft(cfg);   // 編輯模式存下來、還沒匯出的草稿

    this.level = 'floor';
    this.busy = false;
    this.clicks = [];

    this.add.image(0, 0, 'room').setOrigin(0).setDepth(0);

    /* ---- 碰撞 ---- */
    this.polys = cfg.blockedFloorPolygons.map(p =>
      p.ellipse ? ellipsePoints(p.ellipse, 28) : p.map(([x, y]) => ({ x, y })));
    this.wallLines = cfg.walkArea.wallLines.map(([a, b]) => ({ x0: a[0], y0: a[1], x1: b[0], y1: b[1] }));

    /* ---- 遮擋圖層：只有阿光在家具「後面」時才顯示在阿光上方 ---- */
    this.occluders = cfg.occluders.map(o => {
      const m = ovMeta[o.overlay];
      const img = this.add.image(m.x, m.y, 'ov_' + o.overlay).setOrigin(0).setDepth(5000).setVisible(false);
      if (o.mask) {
        const e = cfg.masks[o.mask];
        const g = this.make.graphics({ add: false });
        g.fillStyle(0xffffff).fillEllipse(e.x, e.y, e.rx * 2, e.ry * 2);
        img.setMask(g.createGeometryMask());
      }
      return { ...o, img, rect: new Phaser.Geom.Rectangle(m.x, m.y, m.w, m.h), polyPts: convexHull(this.polys[o.poly]) };
    });

    // 坐進貓窩時：只把「窩的前緣」畫在阿光前面
    {
      const m = ovMeta.pet_bed, o = cfg.masks.petBedOuter, i = cfg.masks.petBedInner;
      this.petRim = this.add.image(m.x, m.y, 'ov_pet_bed').setOrigin(0).setDepth(5000).setVisible(false);
      const g = this.make.graphics({ add: false });
      const outer = ellipsePoints(o, 40, 'lower');
      const inner = ellipsePoints(i, 40, 'lower').reverse();
      g.fillStyle(0xffffff).fillPoints(outer.concat(inner), true);
      this.petRim.setMask(g.createGeometryMask());
    }
    // 鑽進一樓時：阿光只從熊頭洞口露出來
    {
      const h = cfg.masks.caveHole, g = this.make.graphics({ add: false });
      g.fillStyle(0xffffff).fillEllipse(h.ellipse.x, h.ellipse.y, h.ellipse.rx * 2, h.ellipse.ry * 2);
      h.ears.forEach(e => g.fillCircle(e.x, e.y, e.r));
      this.caveMask = g.createGeometryMask();
    }

    /* ---- 阿光 ---- */
    const P = cfg.player, wa = cfg.walkArea;
    this.cat = new SunLightCat(this, P.spawn.x, P.spawn.y, {
      speed: P.speed, baseScale: P.baseScale, depthFactor: 0.8,
      perspective: P.perspective, foot: P.foot,
      bounds: { x0: wa.minX, y0: 0, x1: wa.maxX, y1: wa.maxY },
      collide: r => this.blockedRect(r),
    });
    // 被家具擋住時的半透明剪影
    this.sil = this.add.sprite(0, 0, 'sunlight', 'idle_0').setOrigin(0.5, 1)
      .setTintFill(0x5b3a48).setAlpha(0.42).setDepth(6000).setVisible(false);

    /* ---- 互動提示 ---- */
    this.ring = this.add.ellipse(0, 0, 70, 26).setStrokeStyle(3, 0xfff3d6, 0.9).setDepth(4000).setVisible(false);
    this.tweens.add({ targets: this.ring, scaleX: 1.25, scaleY: 1.25, alpha: 0.35, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.bubble = this.add.container(0, 0).setDepth(8000).setVisible(false);
    this.bubbleBg = this.add.graphics();
    this.bubbleText = this.add.text(0, 0, '', { fontFamily: UI_FONT, fontSize: '24px', color: '#4a3328', fontStyle: '700' }).setOrigin(0.5);
    this.bubble.add([this.bubbleBg, this.bubbleText]);

    /* ---- HUD ---- */
    const pill = (y, w) => this.add.graphics().setDepth(9000).fillStyle(0xfffaf3, 0.92).fillRoundedRect(24, y, w, 48, 24);
    this.statusBg = pill(22, 300);
    this.status = this.add.text(48, 34, '', { fontFamily: UI_FONT, fontSize: '24px', color: '#4a3328', fontStyle: '700' }).setDepth(9001);
    this.barBg = this.add.graphics().setDepth(9000);
    this.barY = this.portrait ? this.VH - 150 : this.VH - 72;
    this.bar = this.add.text(this.VW / 2, this.barY + 26, '', { fontFamily: UI_FONT, fontSize: '23px', color: '#fff8ee' }).setOrigin(0.5).setDepth(9001);
    this.toast = this.add.text(this.VW / 2, this.portrait ? 300 : 92, '', {
      fontFamily: UI_FONT, fontSize: '24px', color: '#fff8ee', backgroundColor: '#5a3a2ecc', padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(9002).setAlpha(0);

    /* ---- 輸入 ---- */
    this.keys = this.input.keyboard.addKeys('SPACE,E,W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT');
    if (!this.play) this.input.keyboard.on('keydown-B', () => this.registry.set('debug', !this.registry.get('debug')));
    this.input.on('pointerdown', p => {
      if (!this.registry.get('debug')) return;
      this.clicks.unshift(`(${Math.round(p.worldX)}, ${Math.round(p.worldY)})`);
      this.clicks.length = Math.min(this.clicks.length, 5);
      console.log('[SunLight] click', Math.round(p.worldX), Math.round(p.worldY));
    });

    this.debug = this.add.graphics().setDepth(9500);
    this.debugText = this.add.text(24, ROOM_H - 96, '', {
      fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '15px', color: '#ffffff', backgroundColor: '#1d1420cc',
      padding: { x: 12, y: 10 }, align: 'left', lineSpacing: 4,
    }).setOrigin(0, 1).setDepth(9600);

    this.setupMission();
    this.refreshStatus();
    if (!this.play && !this.touch && typeof LayoutEditor !== 'undefined') this.editor = new LayoutEditor(this);
    if (this.touch) this.tapNav = new TapNav(this);
    if (this.portrait) this.setupPortrait();
    if (this.draftApplied) this.showToast('已套用編輯草稿（按 M 進入編輯模式可匯出或清除）');
  }

  /** 編輯模式改了形狀之後，重新整理碰撞與任務判定用的資料 */
  rebuildGeometry() {
    const cfg = this.cfg;
    this.polys = cfg.blockedFloorPolygons.map(p => p.ellipse ? ellipsePoints(p.ellipse, 28) : p.map(([x, y]) => ({ x, y })));
    this.wallLines = cfg.walkArea.wallLines.map(([a, b]) => ({ x0: a[0], y0: a[1], x1: b[0], y1: b[1] }));
    this.occluders.forEach(o => { o.polyPts = convexHull(this.polys[o.poly]); });
    Object.values(cfg.levels).forEach(l => { if (l.walk) { delete l.walk.pts; delete l.walk.blockedPts; } });
    if (this.alertParams && cfg.ownerMission) {
      if (cfg.ownerMission.face) Object.assign(this.alertParams.face, cfg.ownerMission.face);
      if (cfg.ownerMission.nearOwnerRadius) this.alertParams.nearOwnerRadius = cfg.ownerMission.nearOwnerRadius;
    }
    if (this.tapNav) this.tapNav.invalidate();
    if (this.missionMgr) this.missionMgr.def = cfg.missions[0];
  }

  /* ---------- 第一關：任務 + 警覺值（規則在 MissionManager／AlertSystem，畫面在 MissionHUD） ---------- */
  setupMission() {
    createOwnerAnimations(this);
    const d = OWNER_MISSION_DEFAULTS, c = this.cfg.ownerMission || {};
    const P = this.alertParams = { ...d, ...c, gain: { ...d.gain, ...(c.gain || {}) }, decay: { ...d.decay, ...(c.decay || {}) },
      face: { ...d.face, ...(c.face || {}) }, lens: { ...d.lens, ...(c.lens || {}) } };
    this.ended = false; this.endReady = false;
    this.ownerArt = OWNER_ART[this.cfg.ownerArt] ? this.cfg.ownerArt : 'v1';
    this.owner = new OwnerSprite(this, P.lens.x, P.lens.y, { scale: 2, art: this.ownerArt, breath: true });
    this.setupBreathing();
    this.setupNap();
    this.setupCup();
    this.alertSys = new AlertSystem(P, this.owner);
    this.missionMgr = new MissionManager(this.cfg.missions[0]);
    this.hud = new MissionHUD(this, { mission: this.missionMgr, alert: this.alertSys, params: P, W: this.VW, H: this.VH, portrait: this.portrait });

    // 走動時的聲響：在阿光頭上冒一個小字，讓玩家知道是自己吵到主人
    this.alertSys.on('bump', (amt, reason) => {
      if (reason !== 'creakBed' && reason !== 'creakFloor') return;
      const s = this.cat.sprite;
      this.hud.float(s.x + Phaser.Math.Between(-14, 14), s.y - s.displayHeight - 6, reason === 'creakBed' ? '吱…' : '嘎吱', '#fff3e6', reason === 'creakBed' ? 24 : 20);
    });
    this.alertSys.on('stage', (st, prev) => {
      if (st === 'stir' && prev === 'calm') this.showToast('主人好像有點動靜……');
      if (st === 'peek') this.showToast('👀 主人在偷看！先別動');
    });
    this.alertSys.on('fail', () => {
      this.missionMgr.fail(this.alertSys);
      this.endMission();
      this.hud.showWakeCloseup(({ y }) => { this.hud.showFail(this.missionMgr.result(this.alertSys), y); this.endReady = true; });
    });
    this.missionMgr.on('step', st => {
      const s = this.cat.sprite;
      if (st.id === 'onBed') this.hud.float(s.x, s.y - 110, '✓ 跳上床了');
      if (st.id === 'reachFeet') { this.hud.float(s.x, s.y - 110, '✓ 到腳邊了，安靜待著'); }
    });
    this.missionMgr.on('napReset', () => this.hud.float(this.cat.sprite.x, this.cat.sprite.y - 110, '動了一下，重來', '#ffd9c2', 22));
    this.missionMgr.on('success', r => {
      this.endMission();
      this.time.delayedCall(500, () => { this.hud.showSuccess(r); this.endReady = true; });
    });
  }

  /* ---------- 床上的主人：全景圖層（Sleeping 交叉淡化呼吸／Restless／Awake）＋近景 Sleeping，同一個呼吸時鐘 ---------- */
  setupBreathing() {
    const BIN = window.SUNLIGHT_BEDROOM_INLINE;
    const M = this.sceneMeta = (BIN && BIN.ownerScene) || this.cache.json.get('osceneMeta');
    this.breathT = 0;
    if (!M) return;
    OWNER_SCENE_SETS.forEach(k => {
      if (!this.textures.exists('oscene_' + k) && this.textures.exists('oscene_src_' + k))
        this.textures.addSpriteSheet('oscene_' + k, this.textures.get('oscene_src_' + k).getSourceImage(), { frameWidth: M.frameWidth, frameHeight: M.frameHeight });
    });
    const os = this.cfg.ownerScene || {};
    this.sceneOpt = { restlessFps: os.restlessFps || 3, awakeFps: os.awakeFps || 4, crossfade: os.crossfade !== false, use: os.use || {} };
    // 深度 0.5／0.51：在臥室背景之上、阿光與腳邊標記之下。B 疊在 A 上面，用透明度做兩幀之間的交叉淡化
    this.ownerA = this.add.image(M.x, M.y, 'oscene_sleeping', 0).setOrigin(0).setDepth(0.5);
    this.ownerB = this.add.image(M.x, M.y, 'oscene_sleeping', 1).setOrigin(0).setDepth(0.51).setAlpha(0);
    this.sceneState = 'sleeping'; this.sceneT = 0;
    this.owner.on('state', st => {
      // Peek 只有近景會瞇眼；全景維持熟睡
      const next = st === 'restless' || st === 'awake' ? st : 'sleeping';
      if (next === this.sceneState && next === 'sleeping') return;
      // 播放清單（[貼圖, 幀]）：第一格是「現在畫面上那一格」→ 和新動作之間用淡化接起來
      const cur = [this.ownerA.texture.key, Number(this.ownerA.frame.name)];
      const use = next === 'sleeping' ? [] : (this.sceneOpt.use[next] || [...Array(M.frames[next]).keys()]);
      this.sceneSeq = [cur, ...use.map(i => ['oscene_' + next, i])];
      this.sceneState = next; this.sceneT = 0;
    });
  }

  updateBreathing(dt) {
    const awake = this.alertSys && this.alertSys.failed;
    if (!awake) this.breathT += dt;
    const phase = awake ? 0 : (this.breathT % BREATH_CYCLE_MS) / BREATH_CYCLE_MS;
    this.owner.setBreathPhase(phase);
    const M = this.sceneMeta; if (!M || !this.ownerA) return;
    const st = this.sceneState, A = this.ownerA, B = this.ownerB;
    if (st === 'sleeping') {
      const n = M.frames.sleeping, f = phase * n, i = Math.floor(f) % n;
      A.setTexture('oscene_sleeping', i);
      if (this.sceneOpt.crossfade) B.setTexture('oscene_sleeping', (i + 1) % n).setAlpha(f - Math.floor(f));
      else B.setAlpha(0);
    } else {
      this.sceneT += dt;
      const seq = this.sceneSeq, n = seq.length, fps = st === 'awake' ? this.sceneOpt.awakeFps : this.sceneOpt.restlessFps;
      const f = Math.min(n - 1, this.sceneT / 1000 * fps), i = Math.floor(f);
      A.setTexture(...seq[i]);
      // 翻身／驚醒也做淡化，減少整張重畫造成的跳動；播到最後一格就停住（等近景播完再回 Sleeping）
      if (this.sceneOpt.crossfade && i < n - 1) B.setTexture(...seq[i + 1]).setAlpha(f - i); else B.setAlpha(0);
    }
  }

  endMission() {
    this.ended = true;
    if (!this.busy) this.cat.frozen = true;
  }

  knockCup() {
    if (!this.missionMgr.completeBonus('cup')) { this.showToast('水杯已經倒了'); return; }
    this.alertSys.bump(this.alertParams.gain.cup, 'cup');
    const C = this.cfg.cup, cup = this.cup;
    if (!cup) { this.hud.float(C ? C.stand.x : 1495, 440, '喀啷！', '#fffaf3', 34); this.cameras.main.shake(180, 0.004); return; }
    // 倒下（逐格）＋往前掉到床頭櫃前的地板（拋物線），落地才「喀啷」
    cup.play('cup_fall');
    const x0 = cup.x, y0 = cup.y, x1 = C.floor.x, y1 = C.floor.y;
    this.tweens.addCounter({ from: 0, to: 1, duration: 620, ease: 'Linear',
      onUpdate: tw => { const t = tw.getValue(); cup.setPosition(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t * t - 30 * Math.sin(Math.PI * t)).setDepth(cup.y); },
      onComplete: () => {
        cup.stop().setFrame(7).setDepth(y1);
        this.spill.setPosition(x1 - 34, y1 + 2).setAlpha(0).setScale(C.spillScale * 0.5).setVisible(true);
        this.tweens.add({ targets: this.spill, alpha: 0.9, scale: C.spillScale, duration: 700, ease: 'Quad.Out' });
        this.hud.float(x1, y1 - 70, '喀啷！', '#fffaf3', 34);
        this.cameras.main.shake(180, 0.004);
      } });
  }

  setupCup() {
    const C = this.cfg.cup;
    if (!C || !this.textures.exists('cup')) return;
    if (!this.anims.exists('cup_fall')) this.anims.create({ key: 'cup_fall', frames: this.anims.generateFrameNumbers('cup', { start: 1, end: 6 }), frameRate: 10, repeat: 0 });
    this.cup = this.add.sprite(C.stand.x, C.stand.y, 'cup', 0).setOrigin(0.5, 112 / 128).setDepth(C.stand.y);
    this.spill = this.add.image(0, 0, 'water_spill').setOrigin(0.5, 0.5).setDepth(C.floor.y - 2).setVisible(false);
  }

  /* ---------- 腳邊睡覺：安靜待著時換成 D 包的趴下＋呼吸動畫，一動就換回原本的阿光 ---------- */
  setupNap() {
    if (!this.textures.exists('sun_nap')) return;
    if (!this.anims.exists('sun_curl')) {
      this.anims.create({ key: 'sun_curl', frames: this.anims.generateFrameNumbers('sun_nap', { start: 0, end: 5 }), frameRate: 6, repeat: 0 });
      this.anims.create({ key: 'sun_sleep', frames: this.anims.generateFrameNumbers('sun_nap', { start: 6, end: 9 }), frameRate: 2.5, repeat: -1 });
    }
    this.napSprite = this.add.sprite(0, 0, 'sun_nap', 0).setOrigin(0.5, 241 / 256).setVisible(false);
    this.napSprite.on('animationcomplete', a => { if (a.key === 'sun_curl') this.napSprite.play('sun_sleep'); });
  }
  updateNap() {
    const n = this.napSprite; if (!n) return;
    const s = this.cat.sprite, m = this.missionMgr;
    const on = (m.napping || m.state === 'success') && !this.busy;
    if (on && !n.visible) {
      // 原本的阿光坐姿約 79px 高（atlas idle），D 包坐姿約 100px → 乘 0.79 讓大小一致
      n.setScale(s.scaleY * 0.79).setPosition(s.x, s.y).setDepth(s.depth).setFlipX(false).setVisible(true).play('sun_curl');
      s.setVisible(false);
    } else if (!on && n.visible) {
      n.setVisible(false).stop(); s.setVisible(true);
    }
  }

  updateMission(dt) {
    const cat = this.cat, s = cat.sprite, P = this.alertParams;
    const onBed = this.level === 'bed' && !this.busy;
    this.missionMgr.update(dt, { level: this.level, x: s.x, y: s.y, moving: cat.moving, busy: this.busy, alert: this.alertSys });
    this.alertSys.update(dt, {
      onBed, moving: cat.moving, sneak: this.isSneaking(),
      distFace: Phaser.Math.Distance.Between(s.x, s.y, P.face.x, P.face.y),
      sleeping: this.missionMgr.napping, busy: this.busy,
    });
    this.updateBreathing(dt);
    this.updateNap();
    const lensVisible = !this.ended && (this.level === 'bed' || this.alertSys.value > 0.5);
    this.hud.update(dt, cat, lensVisible, this.levelLabel(this.level));
  }

  /* ---------- 碰撞 ---------- */
  blockedPoint(x, y) {
    for (const w of this.wallLines) {
      if (x >= w.x0 && x <= w.x1) {
        const wy = w.y0 + (w.y1 - w.y0) * (x - w.x0) / (w.x1 - w.x0);
        if (y < wy) return true;
      }
    }
    return this.polys.some(p => pointInPoly(p, x, y));
  }
  blockedRect(r) {
    const walk = this.walkOf(this.level);
    if (walk) {
      // 可行走平台：腳底那一條線必須整條在平台範圍內、且不碰到平台上的障礙物（例：主人的臉、筆電）
      const yb = r.y + r.h;
      return [r.x + 4, r.x + r.w / 2, r.x + r.w - 4].some(x =>
        !pointInPoly(walk.pts, x, yb) || walk.blockedPts.some(b => pointInPoly(b, x, yb)));
    }
    const xs = [r.x, r.x + r.w / 2, r.x + r.w], ys = [r.y, r.y + r.h];
    return xs.some(x => ys.some(y => this.blockedPoint(x, y)));
  }

  /** 平台的可行走範圍（沒有 walk 設定的平台 = 固定落點，不能走動） */
  walkOf(level) {
    const w = (this.cfg.levels[level] || {}).walk;
    if (!w) return null;
    if (!w.pts) {
      w.pts = w.polygon.map(([x, y]) => ({ x, y }));
      w.blockedPts = (w.blocked || []).map(p => p.map(([x, y]) => ({ x, y })));
    }
    return w;
  }

  /** 可行走平台上：在觸發範圍內才算數；固定落點平台：一律可用 */
  inReach(ap) {
    if (!ap || !this.walkOf(this.level)) return true;
    const s = this.cat.sprite;
    return Phaser.Math.Distance.Between(s.x, s.y, ap.x, ap.y) < ap.radius;
  }

  /** land 可以是一個點或多個點；多個時取離阿光最近的 */
  nearestLand(land) {
    if (!Array.isArray(land)) return land;
    const s = this.cat.sprite;
    return land.reduce((a, b) => Phaser.Math.Distance.Between(s.x, s.y, a.x, a.y) <= Phaser.Math.Distance.Between(s.x, s.y, b.x, b.y) ? a : b);
  }

  /* ---------- 規則：目前可以做的動作 ---------- */
  levelLabel(l) { return (this.cfg.levels[l] || {}).label || l; }
  zoneForLevel(l) { return this.cfg.zones.find(z => z.level === l); }

  /**
   * 目前可以「跳去」的地方（全部用 Space）。
   *   up   = 往上：zones 裡 requires 包含目前平台的（例：在二樓 → 三樓）
   *   down = 往下：platforms[目前].exits 裡剩下的（例：在二樓 → 一樓、地板）
   * 物品互動（type: interact，例如水杯）另外回傳，用 E。
   */
  jumpOptions() {
    const cfg = this.cfg, lv = this.level, s = this.cat.sprite;
    const up = [], down = [], items = [];
    if (lv === 'floor') {
      // 地板：依腳底距離找最近、且規則允許從地板出發的家具
      let best = null;
      for (const z of cfg.zones) {
        if (!(z.requires || ['floor']).includes('floor') || !z.approach) continue;
        const d = Math.min(...[].concat(z.approach).map(a => Phaser.Math.Distance.Between(s.x, s.y, a.x, a.y) / a.radius));
        if (d < 1 && (!best || d < best.d)) best = { z, d };
      }
      if (best) up.push({ label: best.z.label, zone: best.z, to: best.z.level, target: this.nearestLand(best.z.target), kind: best.z.type });
      return { up, down, items };
    }
    const L = cfg.levels[lv] || {};
    for (const z of cfg.zones.filter(z => (z.requires || []).includes(lv))) {
      if (!this.inReach((z.approachFrom || {})[lv])) continue;
      const target = (z.targetFrom || {})[lv] || z.target;
      if (z.type === 'interact') items.push({ label: z.label, zone: z, kind: 'interact' });
      else up.push({ label: z.label, zone: z, to: z.level, target, kind: z.type });
    }
    for (const ex of (cfg.platforms[lv] || { exits: [] }).exits) {
      if (cfg.zones.some(z => z.level === ex && (z.requires || []).includes(lv))) continue;   // 已經算在往上
      if (!this.inReach((L.exitApproach || {})[ex])) continue;
      if (ex === 'floor') {
        const label = lv === 'pet_bed' ? '爬出貓窩' : lv === 'tower_1' ? '從洞口鑽出來' : '跳回地板';
        down.push({ label, to: 'floor', target: this.nearestLand(L.land), kind: lv === 'pet_bed' || lv === 'tower_1' ? 'enter' : 'down' });
      } else {
        const z = this.zoneForLevel(ex);
        const target = (L.exitTarget || {})[ex] || (z.targetFrom || {})[lv] || z.target;
        down.push({ label: cfg.levels[ex].jumpLabel || ('回到' + this.levelLabel(ex)), to: ex, target, kind: ex === 'tower_1' ? 'enter' : 'down' });
      }
    }
    return { up, down, items };
  }

  /**
   * 依方向鍵挑出 Space 要跳去哪裡。
   *   沒按方向：能往上就往上，否則往下（二樓 → 三樓、三樓 → 二樓）
   *   ↑（含斜上）：往上
   *   ↓ ← →：在「往下」的出口裡，挑落點方向最接近的（二樓：↓ 一樓、→ 地板）
   *   選不到就退回預設，不會有按了沒反應的鍵
   */
  pickJump(opts, dir) {
    const all = opts.up.concat(opts.down);
    if (!all.length) return null;
    const fallback = opts.up[0] || opts.down[0];
    // 地板與可行走平台：方向鍵是用來走路的，Space 直接跳向範圍內的那一個
    if (this.level === 'floor' || this.walkOf(this.level) || (!dir.x && !dir.y)) return fallback;
    if (dir.y < 0) return opts.up[0] || fallback;
    const pool = opts.down.length ? opts.down : opts.up;
    const s = this.cat.sprite, len = Math.hypot(dir.x, dir.y);
    let best = null;
    for (const o of pool) {
      const vx = o.target.x - s.x, vy = o.target.y - s.y, vl = Math.hypot(vx, vy) || 1;
      const cos = (vx * dir.x + vy * dir.y) / (vl * len);
      if (!best || cos > best.cos) best = { o, cos };
    }
    return best ? best.o : fallback;
  }

  heldDir() {
    const k = this.keys;
    return {
      x: (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0),
      y: (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0),
    };
  }

  /** 每個選項要按什麼：「Space」或「↓ + Space」，給畫面下方的提示列用 */
  hintFor(opts, o) {
    if (this.pickJump(opts, { x: 0, y: 0 }) === o) return 'Space';
    for (const [arrow, d] of [['↓', { x: 0, y: 1 }], ['→', { x: 1, y: 0 }], ['←', { x: -1, y: 0 }], ['↑', { x: 0, y: -1 }]]) {
      if (this.pickJump(opts, d) === o) return arrow + ' + Space';
    }
    return 'Space';
  }

  /** 附近沒有家具時按 Space：原地小跳，不改變平台 */
  hop() {
    const cat = this.cat, s = cat.sprite, y0 = s.y;
    this.busy = true; cat.manual = true;
    this.tweens.addCounter({
      from: 0, to: 1, duration: 340, ease: 'Sine.InOut',
      onUpdate: tw => { const t = tw.getValue(); s.setY(y0 - 26 * 4 * t * (1 - t)); },
      onComplete: () => { s.setY(y0); cat.manual = false; this.busy = false; },
    });
  }

  lockedHint() {
    if (this.level !== 'floor') return null;
    const s = this.cat.sprite;   // 只在地板提示
    const h = (this.cfg.lockedHints || []).find(h => Phaser.Math.Distance.Between(s.x, s.y, h.x, h.y) < h.radius);
    return h ? h.text : null;
  }

  /* ---------- 跳躍／爬進去（目前沒有跳躍 sprite → 位置弧線過渡） ---------- */
  perform(act) {
    if (act.kind === 'interact') {
      if (act.zone && act.zone.id === 'water') this.knockCup();
      else this.showToast('🐾 ' + act.label);
      return;
    }
    if (this.level === 'bed' && act.to !== 'bed') this.alertSys.bump(this.alertParams.gain.leave, 'leave');   // 從床上跳下去
    const cat = this.cat, s = cat.sprite, cfg = this.cfg;
    const from = { x: s.x, y: s.y }, to = act.target;
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
    const enter = act.kind === 'enter';
    const arc = enter ? 16 : (dy < 0 ? 46 + Math.abs(dy) * 0.32 : 30 + dist * 0.06);
    const dur = Phaser.Math.Clamp((enter ? 380 : 320) + dist * 0.8, 380, 820);

    const dir = Math.abs(dx) > 14 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    if (dir === 'left') cat.facingLeft = true;
    if (dir === 'right') cat.facingLeft = false;

    const s0 = s.scaleX;
    const walkTo = this.walkOf(act.to);
    const refTo = act.to === 'floor' || walkTo ? null : (cfg.levels[act.to] || {}).refY;
    const offTo = walkTo ? walkTo.refOffset || 0 : 0;
    const s1 = (() => {
      const k1 = cat.scaleRefY, k2 = cat.scaleOffset;
      cat.scaleRefY = refTo; cat.scaleOffset = offTo;
      const v = cat.scaleAt(to.y);
      cat.scaleRefY = k1; cat.scaleOffset = k2;
      return v;
    })();

    this.busy = true; cat.frozen = true; cat.manual = true;
    s.clearMask(); cat.shadow.setVisible(true);
    this.petRim.setVisible(false);

    const jumpKey = this.anims.exists('sun_jump_' + dir) ? 'sun_jump_' + dir : (this.anims.exists('sun_jump') ? 'sun_jump' : null);
    if (jumpKey) { s.setFlipX(false); s.play(jumpKey); }
    else { s.setFlipX(false); s.play('sun_walk_' + dir); s.anims.timeScale = enter ? 1.1 : 1.6; }
    s.setDepth(Math.max(from.y, to.y) + 1);

    this.tweens.addCounter({
      from: 0, to: 1, duration: dur, ease: 'Sine.InOut',
      onUpdate: tw => {
        const t = tw.getValue();
        const x = Phaser.Math.Linear(from.x, to.x, t), gy = Phaser.Math.Linear(from.y, to.y, t);
        const sc = Phaser.Math.Linear(s0, s1, t);
        s.setPosition(x, gy - arc * 4 * t * (1 - t)).setScale(sc);
        cat.shadow.setPosition(x, gy - 2).setSize(40 * sc * (1 - 0.35 * Math.sin(Math.PI * t)), 12 * sc);
      },
      onComplete: () => {
        s.anims.timeScale = 1;
        this.level = act.to;
        cat.scaleRefY = refTo;
        cat.scaleOffset = offTo;
        cat.manual = false;
        cat.frozen = (act.to !== 'floor' && !walkTo) || this.ended;      // 書桌、床、書櫃頂端可以走
        this.busy = false;
        this.onLanded(act);
      },
    });
  }

  onLanded(act) {
    const s = this.cat.sprite;
    if (act.to === 'bed') this.alertSys.bump(this.alertParams.gain.land, 'land');   // 跳上床的震動
    const inCave = this.level === 'tower_1', inBed = this.level === 'pet_bed';
    if (inCave) s.setMask(this.caveMask); else s.clearMask();
    this.petRim.setVisible(inBed);
    this.cat.shadow.setVisible(!inCave && !inBed);
    if (act.kind !== 'enter') {           // 落地的小煙塵
      const puff = this.add.ellipse(s.x, s.y - 2, 60, 14, 0xfff3e0, 0.55).setDepth(s.depth - 1);
      this.tweens.add({ targets: puff, scaleX: 1.8, scaleY: 1.4, alpha: 0, duration: 380, onComplete: () => puff.destroy() });
    }
    this.refreshStatus();
  }

  refreshStatus() {
    // 位置改由 MissionHUD 的任務膠囊顯示（📍 位置　🐾 目前步驟）
    this.statusBg.clear(); this.status.setText('');
  }

  showToast(msg) {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1800, duration: 500 });
  }

  /* ---------- 直式手機版：兩個鏡頭 ---------- */
  setupPortrait() {
    const W = this.scale.width, H = this.scale.height, Z = this.UIZ;
    const top = 160 * Z, bottom = 176 * Z;                 // 上面放任務膠囊＋警覺值，下面放提示列＋潛行鈕
    const cam = this.cameras.main;
    cam.setViewport(0, top, W, H - top - bottom).setBounds(0, 0, ROOM_W, ROOM_H).setZoom((H - top - bottom) / ROOM_H);
    cam.setBackgroundColor('#2a2238');
    cam.startFollow(this.cat.sprite, true, 0.12, 0.12);
    this.uiCam = this.cameras.add(0, 0, W, H).setZoom(Z).setOrigin(0, 0);
    // 介面鏡頭最後畫、沒有底色 → 上下兩條是畫布底色，任務卡、近景圓可以疊在房間上
    // 每次畫面前分配：depth ≥ 8400 的是介面（除了跟著房間位置的飄字）
    this.events.on('prerender', () => {
      const ui = this.uiCam.id, main = cam.id;
      for (const o of this.children.list) o.cameraFilter = (o.depth >= 8400 && !o.worldUI) ? main : ui;
    });
  }
  /** 螢幕座標 → 房間座標、介面座標 */
  worldPoint(p) { const v = this.cameras.main.getWorldPoint(p.x, p.y); return { x: v.x, y: v.y }; }
  uiPoint(p) { return { x: p.x / this.UIZ, y: p.y / this.UIZ }; }

  isSneaking() { return this.keys.SHIFT.isDown || !!(this.tapNav && this.tapNav.sneak); }

  /* ---------- 每幀 ---------- */
  update(_, dt) {
    const cat = this.cat, s = cat.sprite, k = this.keys;
    if (this.editor && this.editor.active) {       // 編輯模式：遊戲暫停，只畫形狀
      this.editor.update();
      this.hud.cardParts.forEach(o => o.setVisible(false));   // 任務卡收起來，不擋住書櫃、貓爬架
      this.hud.pillParts.forEach(o => o.setAlpha(0.25));
      this.bubble.setVisible(false); this.ring.setVisible(false);
      this.bar.setText('✏️ 編輯模式　·　1–8 切換圖層　·　Ctrl+Z 復原　·　M 離開');
      const bw1 = this.bar.width + 56;
      this.barBg.clear().fillStyle(0x3b2620, 0.72).fillRoundedRect(this.VW / 2 - bw1 / 2, this.barY, bw1, 52, 26);
      this.drawDebug([]);
      return;
    }

    // 平台上 A/D 可以轉向（不移動）
    if (cat.frozen && !this.busy) {
      if (Phaser.Input.Keyboard.JustDown(k.A) || Phaser.Input.Keyboard.JustDown(k.LEFT)) cat.facingLeft = true;
      if (Phaser.Input.Keyboard.JustDown(k.D) || Phaser.Input.Keyboard.JustDown(k.RIGHT)) cat.facingLeft = false;
    }
    // Shift 潛行（手機：右下的潛行鈕）：走得比較慢，在床上讓警覺值上升得比較少
    const sneak = this.isSneaking();
    if (this.tapNav) this.tapNav.update(dt);
    cat.speedMul = sneak ? 0.45 : 1;
    cat.update(dt);
    if (!this.busy) s.anims.timeScale = sneak && cat.moving ? 0.6 : 1;
    if (this.level === 'pet_bed' || this.level === 'tower_1') cat.shadow.setVisible(false);
    this.updateMission(dt);
    if (this.ended) {
      if (this.endReady && Phaser.Input.Keyboard.JustDown(k.SPACE)) { this.scene.restart(); return; }
      this.bubble.setVisible(false); this.ring.setVisible(false);
      this.bar.setText(this.touch && this.endReady ? '點一下畫面重新開始' : this.missionMgr.state === 'success' ? '任務完成' : '主人醒來了…'); const bw0 = this.bar.width + 56;
      this.barBg.clear().fillStyle(0x3b2620, 0.72).fillRoundedRect(this.VW / 2 - bw0 / 2, this.barY, bw0, 52, 26);
      this.drawDebug([]);
      return;
    }

    // 動作：Space = 跳（方向鍵瞄準），E = 物品互動
    const opts = this.busy ? { up: [], down: [], items: [] } : this.jumpOptions();
    const dir = this.heldDir();
    const jump = this.busy ? null : this.pickJump(opts, dir);
    const item = opts.items[0] || null;
    if (!this.busy) {
      if (Phaser.Input.Keyboard.JustDown(k.SPACE)) {
        if (jump) this.perform(jump);
        else if (this.level === 'floor' || this.walkOf(this.level)) this.hop();
      } else if (item && Phaser.Input.Keyboard.JustDown(k.E)) {
        this.perform(item);
      }
    }
    const acts = jump ? [jump] : [];   // 給 Debug 標示目前瞄準的互動點
    const primary = jump ? { key: 'Space', label: jump.label, target: jump.target, kind: jump.kind }
      : item ? { key: 'E', label: item.label, kind: 'interact' } : null;
    const locked = !primary && this.lockedHint();
    this.primaryAct = jump || item || null;
    if (primary && !this.busy) {
      this.bubbleText.setText(this.touch ? `👆 ${primary.label}` : `${primary.key}  ${primary.label}`);
      const w = this.bubbleText.width + 36, h = 44, by = s.y - s.displayHeight - 30;
      this.bubbleBg.clear().fillStyle(0xfffaf3, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 22)
        .fillTriangle(-9, h / 2 - 1, 9, h / 2 - 1, 0, h / 2 + 10);
      this.bubble.setPosition(Phaser.Math.Clamp(s.x, w / 2 + 10, ROOM_W - w / 2 - 10), Math.max(30, by)).setVisible(true);
      this.bubbleRect = new Phaser.Geom.Rectangle(this.bubble.x - w / 2 - 10, this.bubble.y - h / 2 - 10, w + 20, h + 20);
      if (primary.target && primary.kind !== 'interact') this.ring.setPosition(primary.target.x, primary.target.y).setVisible(true);
      else this.ring.setVisible(false);
    } else { this.bubble.setVisible(false); this.ring.setVisible(false); }

    // 提示列：列出每個去處要按什麼（平台上才會有多個）
    const parts = opts.up.concat(opts.down).map(o => `${this.hintFor(opts, o)}  ${o.label}`);
    if (item) parts.push(`E  ${item.label}`);
    let barStr = this.touch
      ? (locked ? '🔒 ' + locked : this.portrait ? '點地板走過去・點家具跳上去・點阿光停下' : '點地板＝走過去　·　點家具＝跳上去　·　點阿光＝停下　·　點泡泡＝馬上跳')
      : parts.length ? parts.join('　　')
      : (locked ? '🔒 ' + locked : (this.play ? 'WASD／方向鍵 移動　·　Shift 潛行　·　Space 跳躍　·　E 互動　·　Tab 任務' : 'WASD／方向鍵 移動　·　Shift 潛行　·　Space 跳躍　·　E 互動　·　Tab 任務　·　B Debug　·　M 編輯'));
    if (this.level === 'bed' && parts.length && !this.touch) barStr += '　　（Shift 潛行比較不會吵醒主人）';
    if (this.level === 'bed' && this.touch && !this.tapNav.sneak) barStr = this.portrait ? '在床上記得開「潛行」，比較不會吵醒主人' : '在床上記得開右下的「潛行」，比較不會吵醒主人';
    if (this.busy) barStr = '…';
    this.bar.setText(barStr);
    const bw = this.bar.width + 56;
    this.barBg.clear().fillStyle(0x3b2620, 0.72).fillRoundedRect(this.VW / 2 - bw / 2, this.barY, bw, 52, 26);

    // 前後遮擋：腳底在家具前緣「上方」= 在家具後面
    let hidden = false;
    const b = s.getBounds();
    for (const o of this.occluders) {
      let behind = false;
      if (this.level === 'floor' && !this.busy && Phaser.Geom.Intersects.RectangleToRectangle(b, o.rect)) {
        const fy = frontEdgeY(o.polyPts, s.x);
        behind = fy !== null && s.y < fy;
      }
      o.img.setVisible(behind);
      hidden = hidden || behind;
    }
    this.sil.setVisible(hidden);
    if (hidden) this.sil.setFrame(s.frame.name).setPosition(s.x, s.y).setScale(s.scaleX).setFlipX(s.flipX);

    this.drawDebug(acts);
  }

  drawDebug(acts) {
    const g = this.debug.clear(), on = !!this.registry.get('debug');
    const editing = this.editor && this.editor.active;
    // 編輯模式不顯示資訊框（編輯器有自己的座標提示）；平常放在阿光的另一側，不擋住要看的地方
    this.debugText.setVisible(on && !editing);
    if (on && !editing) {
      const left = this.cat.sprite.x > ROOM_W / 2;   // Debug 資訊框（開發用，橫式）
      this.debugText.setOrigin(left ? 0 : 1, 1).setPosition(left ? 24 : ROOM_W - 24, ROOM_H - 96);
    }
    if (!on) return;
    const cfg = this.cfg, s = this.cat.sprite;
    // 牆線
    g.lineStyle(3, 0x6fe08a, 1);
    this.wallLines.forEach(w => g.lineBetween(w.x0, w.y0, w.x1, w.y1));
    // 碰撞多邊形
    this.polys.forEach(p => { g.fillStyle(0xff5a4a, 0.22).fillPoints(p, true); g.lineStyle(2, 0xff5a4a, 0.95).strokePoints(p, true); });
    // 可行走平台（目前所在的平台亮綠、其他淡綠）與平台上的障礙物
    Object.keys(cfg.levels).forEach(l => {
      const w = this.walkOf(l); if (!w) return;
      const here = l === this.level;
      g.fillStyle(0x6fe08a, here ? 0.3 : 0.12).fillPoints(w.pts, true);
      g.lineStyle(here ? 2.5 : 1, 0x6fe08a, here ? 1 : 0.6).strokePoints(w.pts, true);
      w.blockedPts.forEach(b => { g.fillStyle(0xff5a4a, here ? 0.35 : 0.15).fillPoints(b, true); g.lineStyle(1.5, 0xff5a4a, 0.9).strokePoints(b, true); });
      Object.values(cfg.levels[l].exitApproach || {}).forEach(ap => g.lineStyle(here ? 2.5 : 1, 0xff6ad5, here ? 1 : 0.5).strokeCircle(ap.x, ap.y, ap.radius));
    });
    cfg.zones.forEach(z => Object.entries(z.approachFrom || {}).forEach(([l, ap]) =>
      g.lineStyle(l === this.level ? 2.5 : 1, 0x7ff7ff, l === this.level ? 1 : 0.5).strokeCircle(ap.x, ap.y, ap.radius)));
    // 遮擋圖範圍
    this.occluders.forEach(o => g.lineStyle(o.img.visible ? 3 : 1, 0xffa23a, o.img.visible ? 1 : 0.45).strokeRectShape(o.rect));
    // 互動點
    const activeIds = acts.map(a => a.zone && a.zone.id);
    cfg.zones.forEach(z => {
      const allowed = (z.requires || ['floor']).includes(this.level);
      const col = activeIds.includes(z.id) ? 0x7ff7ff : allowed ? 0x3fb6c8 : 0x8c8c9c;
      [].concat(z.approach || []).forEach(a => {
        g.lineStyle(activeIds.includes(z.id) ? 4 : 2, col, 0.95).strokeCircle(a.x, a.y, a.radius);
        { const t = this.nearestLand(z.target || z.point); g.lineStyle(1.5, col, 0.6).lineBetween(a.x, a.y, t.x, t.y); }
      });
      g.lineStyle(1, 0xcfcfcf, 0.6).strokeCircle(z.point.x, z.point.y, 6);   // 原始 point（參考）
      [].concat(z.target || []).forEach(t => g.fillStyle(0xffe14a, 1).fillCircle(t.x, t.y, 7));
    });
    (cfg.lockedHints || []).forEach(h => g.lineStyle(1.5, 0xb9a6ff, 0.7).strokeCircle(h.x, h.y, h.radius));
    Object.values(cfg.levels).forEach(l => l.land && [].concat(l.land).forEach(p => g.fillStyle(0xff6ad5, 1).fillCircle(p.x, p.y, 6)));
    // 主人臉部附近（在這裡走動，警覺值上升較快）
    if (this.alertParams) {
      const P = this.alertParams, z = this.missionMgr.def.feetZone;
      g.lineStyle(2, 0xffd36a, 0.9).strokeCircle(P.face.x, P.face.y, P.face.radius);
      g.lineStyle(1.5, 0xffd36a, 0.5).strokeCircle(P.face.x, P.face.y, P.nearOwnerRadius);
      g.lineStyle(2, 0x9fe0ff, 0.9).strokeEllipse(z.x, z.y, z.rx * 2, z.ry * 2);
    }
    // 腳底
    const f = this.cat.footRect();
    g.lineStyle(2, 0x5ab0ff, 1).strokeRect(f.x, f.y, f.w, f.h);
    g.lineStyle(1, 0x5ab0ff, 0.6).strokeRectShape(s.getBounds());
    g.lineStyle(2, 0xffffff, 1).lineBetween(s.x - 10, s.y, s.x + 10, s.y).lineBetween(s.x, s.y - 10, s.x, s.y + 10);

    const p = this.input.activePointer;
    this.debugText.setText([
      'DEBUG（B 關閉）',
      `平台   ${this.level}${this.busy ? '  (跳躍中)' : ''}`,
      `腳底   (${s.x.toFixed(0)}, ${s.y.toFixed(0)})  scale ${s.scaleX.toFixed(2)}`,
      `動畫   ${s.anims.currentAnim ? s.anims.currentAnim.key : '-'}`,
      `警覺值 ${this.alertSys.value.toFixed(1)}% (${(this.alertSys.rate || 0).toFixed(0)}/秒) ${this.alertSys.stage}  主人 ${this.owner.state}`,
      `任務   ${this.missionMgr.state}  目前：${this.missionMgr.current ? this.missionMgr.current.id : '-'}  睡 ${(this.missionMgr.napT / 1000).toFixed(1)}s`,
      `瞄準   ${acts.map(a => 'Space→' + a.to).join('  ') || '-'}`,
      `滑鼠   (${Math.round(p.worldX)}, ${Math.round(p.worldY)})`,
      `點擊   ${this.clicks.join(' ') || '點畫面記錄座標'}`,
      '',
      '紅=碰撞  綠線=牆  綠面=平台可走範圍',
      '青=往上觸發  粉圈=往下觸發  黃=落點  粉點=落地點  橘=遮擋圖',
    ].join('\n'));
  }
}
