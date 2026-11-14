/* =========================================================
 * 阿光 SunLight — 角色載入 + 移動控制器 (Phaser 3)
 * - 素材：assets/sunlight_atlas.png / .json（由原 Sprite Pack 重新切格、腳底對齊）
 * - 定位點：腳底 (origin 0.5, 1)，sprite.y = 腳踩在地板上的位置
 * - 深度：depth = 腳底 y（2.5D 前後遮擋）
 * ========================================================= */

const SUN_ANIMS = {
  idle:       { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3', 'idle_2', 'idle_1'], frameRate: 5, repeat: -1 },
  walk_down:  { frames: ['walk_down_0', 'walk_down_1', 'walk_down_2', 'walk_down_3'], frameRate: 8, repeat: -1 },
  walk_up:    { frames: ['walk_up_0', 'walk_up_1', 'walk_up_2'], frameRate: 7, repeat: -1 },
  walk_left:  { frames: ['walk_left_0', 'walk_left_1', 'walk_left_2'], frameRate: 8, repeat: -1 },
  walk_right: { frames: ['walk_right_0', 'walk_right_1', 'walk_right_2'], frameRate: 8, repeat: -1 },
};

function preloadSunLight(scene, base = 'assets/') {
  if (scene.textures.exists('sunlight')) return;
  const inline = window.SUNLIGHT_INLINE; // 單檔版會把圖與 JSON 內嵌
  if (inline) scene.load.atlas('sunlight', inline.png, inline.json);
  else scene.load.atlas('sunlight', base + 'sunlight_atlas.png', base + 'sunlight_atlas.json');
}

function createSunLightAnimations(scene) {
  Object.entries(SUN_ANIMS).forEach(([name, a]) => {
    const key = 'sun_' + name;
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: a.frames.map(f => ({ key: 'sunlight', frame: f })),
      frameRate: a.frameRate,
      repeat: a.repeat,
    });
  });
}

class SunLightCat {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x 腳底 x
   * @param {number} y 腳底 y
   * @param {object} opt
   *   speed        水平移動速度 px/s
   *   depthFactor  垂直速度倍率（斜俯視下 y 方向看起來比較短）
   *   baseScale    基準縮放（等比）
   *   perspective  {yNear, yFar, near, far} 依 y 做等比遠近縮放
   *   bounds       {x0, y0, x1, y1} 腳底可走範圍
   *   blockers     [{x, y, w, h}] 地板上的障礙物 footprint
   *   foot         {w, h} 腳底碰撞框
   *   collide      (rect) => bool  自訂碰撞（例如多邊形）；有給就和 bounds/blockers 一起判斷
   */
  constructor(scene, x, y, opt = {}) {
    this.scene = scene;
    this.opt = Object.assign({
      speed: 150, depthFactor: 0.78, baseScale: 1,
      perspective: null, bounds: null, blockers: [], foot: { w: 34, h: 10 },
    }, opt);

    this.shadow = scene.add.ellipse(x, y, 44, 12, 0x1a1020, 0.28);
    this.sprite = scene.add.sprite(x, y, 'sunlight', 'idle_0').setOrigin(0.5, 1);
    this.sprite.play('sun_idle');

    this.frozen = false;      // true：不吃移動輸入（跳躍中、在平台上）
    this.speedMul = 1;        // 速度倍率（例：Shift 潛行 = 0.45）
    this.manual = false;      // true：位置／縮放／影子由外部控制（跳躍 tween）
    this.scaleRefY = null;    // 在平台上時，用平台的地面 y 算遠近縮放
    this.scaleOffset = 0;     // 在可行走平台上：用 (腳底 y + offset) 算遠近縮放
    this.dir = 'down';
    this.facingLeft = false;
    this.moving = false;

    const kb = scene.input.keyboard;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D');
    this._apply();
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  footRect(x = this.sprite.x, y = this.sprite.y) {
    const { w, h } = this.opt.foot;
    return { x: x - w / 2, y: y - h, w, h };
  }

  _blocked(x, y) {
    const r = this.footRect(x, y);
    const b = this.opt.bounds;
    if (b && (r.x < b.x0 || r.x + r.w > b.x1 || r.y < b.y0 || r.y + r.h > b.y1)) return true;
    if (this.opt.collide && this.opt.collide(r)) return true;
    return this.opt.blockers.some(o =>
      r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
  }

  update(dtMs) {
    if (this.manual) return;
    if (this.frozen) {
      this.moving = false;
      this.sprite.play('sun_idle', true);
      this.sprite.setFlipX(this.facingLeft);
      this._apply();
      return;
    }
    const dt = Math.min(dtMs, 50) / 1000;
    const c = this.cursors, k = this.wasd;
    let ix = (c.right.isDown || k.D.isDown ? 1 : 0) - (c.left.isDown || k.A.isDown ? 1 : 0);
    let iy = (c.down.isDown || k.S.isDown ? 1 : 0) - (c.up.isDown || k.W.isDown ? 1 : 0);
    const len = Math.hypot(ix, iy) || 1;
    const vx = (ix / len) * this.opt.speed * this.speedMul;
    const vy = (iy / len) * this.opt.speed * this.opt.depthFactor * this.speedMul;

    // 軸分離移動：撞到東西時可以沿著邊滑動
    const ox = this.sprite.x, oy = this.sprite.y;
    let nx = ox + vx * dt, ny = oy + vy * dt;
    if (this._blocked(nx, oy)) nx = ox;
    if (this._blocked(nx, ny)) ny = oy;
    this.sprite.setPosition(nx, ny);

    // 動畫依「實際位移」決定，避免頂牆時原地踏步
    const dx = nx - ox, dy = ny - oy;
    this.moving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
    if (this.moving) {
      if (Math.abs(dx) > 0.01) this.dir = dx < 0 ? 'left' : 'right';   // 斜走時用側面動畫
      else this.dir = dy < 0 ? 'up' : 'down';
      if (this.dir === 'left') this.facingLeft = true;
      if (this.dir === 'right') this.facingLeft = false;
      this.sprite.setFlipX(false);
      this.sprite.play('sun_walk_' + this.dir, true);
    } else {
      this.sprite.play('sun_idle', true);
      this.sprite.setFlipX(this.facingLeft); // 待機圖朝右，往左走後鏡像
    }
    this._apply();
  }

  scaleAt(y) {
    if (this.scaleRefY != null) y = this.scaleRefY;
    else y += this.scaleOffset;
    const p = this.opt.perspective;
    if (!p) return this.opt.baseScale;
    const t = Phaser.Math.Clamp((y - p.yFar) / (p.yNear - p.yFar), 0, 1);
    return this.opt.baseScale * Phaser.Math.Linear(p.far, p.near, t);
  }

  _apply() {
    const s = this.scaleAt(this.sprite.y);
    this.sprite.setScale(s);                       // 等比縮放，不拉伸
    this.sprite.setDepth(this.sprite.y);
    const side = this.dir === 'left' || this.dir === 'right';
    this.shadow.setPosition(this.sprite.x, this.sprite.y - 2 * s);
    this.shadow.setSize((side ? 70 : 40) * s, 12 * s);
    this.shadow.setDepth(this.sprite.y - 0.5);
  }
}
