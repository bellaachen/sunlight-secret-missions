/* =========================================================
 * 主人動畫 — 載入、動畫、狀態控制（Sleeping / Restless / Peek / Awake）
 *
 * 兩組美術（scene_config.json 的 ownerArt 選擇遊戲用哪一組）：
 *   v1  assets/owner/     Owner Animation Pack v1（256×192／幀），Peek 借用 Awake 前段
 *   v2  assets/owner_v2/  ChatGPT 38 格概念總表切出（512×512／幀），四組都有自己的動畫
 *   v4  assets/owner_v4/  A 包更新版＋過渡幀 11 格：直髮、熊熊印花棉被（tools/build_owner_v4.py 組裝）
 *   v5  assets/owner_v5/  A2 Q 版 49 格（目前使用，tools/build_owner_v5.py 組裝）
 *   v3  assets/owner_v3/  A 包 38 格 + 過渡幀 9 格（512×512／幀，4 欄格狀 sheet），tools/build_owner_v3.py 組裝
 * 每組都有 owner_{state}.webp（對齊後）與 owner_raw_{state}.webp（未對齊，測試比對用）
 * 所有幀同尺寸、臉部對齊到同一點 → 切換狀態時不會跳動
 * ========================================================= */
const OWNER_ART = {
  v1: {
    label: 'v1（Owner Animation Pack）',
    tex: 'owner', dir: 'assets/owner/', inline: 'SUNLIGHT_OWNER_INLINE',
    frame: { w: 256, h: 192 },
    anims: {
      sleeping: { frames: 8,  frameRate: 4, repeat: -1 },
      restless: { frames: 12, frameRate: 6, repeat: 0 },
      awake:    { frames: 10, frameRate: 8, repeat: 0 },
    },
    // Peek（瞇眼偷看）：Awake 的第 1、3 幀閉眼、第 4 幀半睜
    peek: { texture: 'awake', frames: [0, 2, 3, 3, 3, 3, 2, 0], frameRate: 6 },
    anchor: { x: 155, y: 110 },            // 對齊時臉部中心
    lens: { cx: 150, cy: 120, r: 44 },     // 圓形近景取景：所有幀的卡片邊緣都在圓外
    closeup: { x: 84, y: 66, w: 112, h: 96 },
  },
  v2: {
    label: 'v2（38 格概念總表）',
    tex: 'owner2', dir: 'assets/owner_v2/', inline: 'SUNLIGHT_OWNER_V2_INLINE',
    frame: { w: 512, h: 512 },
    anims: {
      sleeping: { frames: 8,  frameRate: 8 / 3.6, repeat: -1 },   // 3.6 秒一次呼吸，和臥室大圖同步
      restless: { frames: 12, frameRate: 6, repeat: 0 },
      peek:     { frames: 8,  frameRate: 5, repeat: 0 },
      awake:    { frames: 10, frameRate: 8, repeat: 0 },
    },
    peek: null,
    anchor: { x: 256, y: 300 },
    lens: { cx: 310, cy: 288, r: 140 },    // 圓形近景只會播 Sleeping／Restless／Peek（驚醒改用大特寫）→ 這三組的卡片邊緣都在圓外
    closeup: { x: 140, y: 103, w: 304, h: 258 },
    breathSync: true,                      // Sleeping 由場景的呼吸時鐘逐幀驅動
  },
  v3: {
    label: 'v3（A 包＋過渡幀）',
    tex: 'owner3', dir: 'assets/owner_v3/', inline: 'SUNLIGHT_OWNER_V3_INLINE',
    frame: { w: 512, h: 512 },
    anims: {
      sleeping: { frames: 10, frameRate: 10 / 3.6, repeat: -1 },  // 由呼吸時鐘驅動
      restless: { frames: 16, frameRate: 8, repeat: 0 },
      peek:     { frames: 8,  frameRate: 5, repeat: 0 },
      awake:    { frames: 13, frameRate: 9, repeat: 0 },
    },
    peek: null,
    anchor: { x: 256, y: 256 },
    lens: { cx: 232, cy: 250, r: 100 },
    closeup: { x: 120, y: 90, w: 300, h: 256 },
    breathSync: true,
  },
  v4: {
    label: 'v4（直髮・熊熊棉被）',
    tex: 'owner4', dir: 'assets/owner_v4/', inline: 'SUNLIGHT_OWNER_V4_INLINE',
    frame: { w: 512, h: 512 },
    anims: {
      sleeping: { frames: 8,  frameRate: 8 / 3.6, repeat: -1 },   // 由呼吸時鐘驅動
      restless: { frames: 16, frameRate: 8, repeat: 0 },
      peek:     { frames: 12, frameRate: 7, repeat: 0 },
      awake:    { frames: 13, frameRate: 9, repeat: 0 },
    },
    peek: null,
    anchor: { x: 256, y: 256 },
    lens: { cx: 240, cy: 258, r: 115 },
    closeup: { x: 90, y: 96, w: 330, h: 282 },
    breathSync: true,
  },
  v5: {
    label: 'v5（Q 版・A2＋A3 包）',
    tex: 'owner5', dir: 'assets/owner_v5/', inline: 'SUNLIGHT_OWNER_V5_INLINE',
    frame: { w: 512, h: 512 },
    anims: {
      sleeping: { frames: 8,  frameRate: 8 / 3.6, repeat: -1 },   // 由呼吸時鐘驅動
      restless: { frames: 16, frameRate: 8, repeat: 0 },
      peek:     { frames: 12, frameRate: 7, repeat: 0 },
      awake:    { frames: 19, frameRate: 8, repeat: 0 },   // A2 0～12 ＋ A3 13～18（嚇一跳、抬頭、看向鏡頭）
    },
    peek: null,
    anchor: { x: 240, y: 252 },
    lens: { cx: 236, cy: 250, r: 140 },     // 人物左邊、下面出血 → 圓形取景避開左緣
    closeup: { x: 60, y: 92, w: 340, h: 291 },
    breathSync: true,
  },
};
// 單檔網頁版為了控制大小會拿掉部分舊美術（見 build_inline.py）
for (const k of (window.SUNLIGHT_DROP_ARTS || [])) delete OWNER_ART[k];
const OWNER_LABEL = { sleeping: 'Sleeping 熟睡', restless: 'Restless 不安', peek: 'Peek 偷看', awake: 'Awake 驚醒' };
const OWNER_STATES = ['sleeping', 'restless', 'peek', 'awake'];

function ownerAnimInfo(art, state) {
  const A = OWNER_ART[art];
  if (A.anims[state]) return A.anims[state];
  return { frames: A.peek.frames.length, frameRate: A.peek.frameRate, repeat: 0 };
}

function preloadOwner(scene, { raw = false, arts = Object.keys(OWNER_ART) } = {}) {
  for (const art of arts) {
    const A = OWNER_ART[art], IN = window[A.inline];
    for (const s of Object.keys(A.anims)) {
      for (const [prefix, file] of raw ? [[A.tex, ''], [A.tex + 'raw', 'raw_']] : [[A.tex, '']]) {
        const key = `${prefix}_${s}`;
        if (scene.textures.exists(key)) continue;
        const url = IN ? IN.images[`owner_${file}${s}`] : `${A.dir}owner_${file}${s}.webp`;
        if (url) scene.load.spritesheet(key, url, { frameWidth: A.frame.w, frameHeight: A.frame.h });
      }
    }
  }
}

function createOwnerAnimations(scene) {
  for (const A of Object.values(OWNER_ART)) {
    for (const prefix of [A.tex, A.tex + 'raw']) {
      for (const [s, a] of Object.entries(A.anims)) {
        const key = `${prefix}-${s}`, tex = `${prefix}_${s}`;
        if (scene.anims.exists(key) || !scene.textures.exists(tex)) continue;
        scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(tex, { start: 0, end: a.frames - 1 }), frameRate: a.frameRate, repeat: a.repeat });
      }
      if (A.peek) {
        const pk = `${prefix}-peek`, ptex = `${prefix}_${A.peek.texture}`;
        if (!scene.anims.exists(pk) && scene.textures.exists(ptex)) {
          scene.anims.create({ key: pk, frames: scene.anims.generateFrameNumbers(ptex, { frames: A.peek.frames }), frameRate: A.peek.frameRate, repeat: 0 });
        }
      }
    }
  }
}

/**
 * 主人 sprite + 狀態機
 *   play('sleeping' | 'restless' | 'peek' | 'awake')
 *   Restless／Peek 播完自動回 Sleeping；Awake 播完發出 'awakeComplete'
 *   breath: true 且美術支援 breathSync → Sleeping 不自己播，由 setBreathPhase(phase) 逐幀驅動
 */
class OwnerSprite extends Phaser.Events.EventEmitter {
  constructor(scene, x, y, { scale = 1.6, art = 'v1', raw = false, breath = false } = {}) {
    super();
    this.scene = scene;
    this.artKey = art;
    this.art = OWNER_ART[art];
    this.prefix = this.art.tex + (raw ? 'raw' : '');
    this.breath = breath && !!this.art.breathSync;
    this.sprite = scene.add.sprite(x, y, `${this.prefix}_sleeping`, 0).setOrigin(0.5).setScale(scale);
    this.state = null;
    this.sprite.on('animationcomplete', anim => {
      const p = this.prefix;
      if (anim.key === `${p}-restless` && this.state === 'restless') { this.play('sleeping'); this.emit('restlessComplete'); }
      if (anim.key === `${p}-peek` && this.state === 'peek') { this.play('sleeping'); this.emit('peekComplete'); }
      if (anim.key === `${p}-awake`) this.emit('awakeComplete');
    });
    this.play('sleeping');
  }
  play(state) {
    this.state = state;
    if (state === 'sleeping' && this.breath) {
      this.sprite.anims.stop();
      this.sprite.setTexture(`${this.prefix}_sleeping`, this.breathFrame || 0);
    } else {
      this.sprite.play(`${this.prefix}-${state}`);   // 動畫 frames 帶 texture，會自動切換貼圖
    }
    this.emit('state', state);
    return this;
  }
  /** 呼吸時鐘：phase 0～1，和臥室大圖的呼吸圖層用同一個時鐘（幀數不同也能同步） */
  setBreathPhase(phase) {
    const n = this.art.anims.sleeping.frames;
    this.breathFrame = Math.min(n - 1, Math.floor(phase * n));
    if (this.breath && this.state === 'sleeping') this.sprite.setFrame(this.breathFrame);
  }
  get frameIndex() {
    if (this.breath && this.state === 'sleeping') return this.breathFrame || 0;
    return this.sprite.anims.currentFrame ? this.sprite.anims.currentFrame.index - 1 : 0;
  }
  /** 目前顯示的是哪一組貼圖的第幾幀（v1 的 Peek 借用 Awake 的幀） */
  get textureFrame() { return { set: this.sprite.texture.key.split('_')[1], index: Number(this.sprite.frame.name) }; }
}

/* 主人警覺值的預設參數（scene_config.json 的 ownerMission 可覆寫） */
const OWNER_MISSION_DEFAULTS = {
  warnAt: 25,              // ≥ 這個值：近景的 Zzz 停止、近景輕微晃動（預兆）
  restlessAt: 35,          // ≥ 這個值：播放 Restless（翻身）
  peekAt: 70,              // ≥ 這個值：播放 Peek（瞇眼偷看），偷看時移動會大幅增加警覺值
  failAt: 100,             // ≥ 這個值：播放 Awake，任務失敗
  restlessCooldown: 2.2,   // 秒
  peekCooldown: 4,         // 秒
  gain: { walk: 14, walkNearFace: 38, land: 20, leave: 6, cup: 35, peekWatch: 40, floorWalk: 1 },
  sneakFactor: 0.3,        // Shift 潛行時，移動造成的上升倍率
  decay: { nearOwnerIdle: 0, onBedIdle: 3, sleeping: 4, offBed: 12 },   // 每秒下降
  face: { x: 1292, y: 342, radius: 175 },   // 主人臉部附近：走動上升更快
  nearOwnerRadius: 300,    // 在這個範圍內停下來，警覺值不會下降（避免「停下來就歸零」）
  lens: { x: 1500, y: 170, rCalm: 74, rAlert: 116 },
};
