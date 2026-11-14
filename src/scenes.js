/* =========================================================
 * Scene 1: MovementTest  — 角色移動測試（淺色格線 + Debug）
 * Scene 2: BedroomScene  — 見 src/BedroomScene.js（使用核准的臥室美術）
 * ========================================================= */
const W = 960, H = 600;
const FONT = '"Zen Maru Gothic", "Noto Sans TC", sans-serif';

function radialTexture(scene, key, size, rgb, stops = [[0, 0.9], [0.4, 0.35], [1, 0]]) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, size, size);
  const ctx = t.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, a]) => g.addColorStop(o, `rgba(${rgb},${a})`));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  t.refresh();
}

function hudText(scene, x, y, str, size = 14, color = '#4a3f3a') {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', color }).setDepth(10000);
}

/* ---------------- Scene 1 ---------------- */
class MovementTest extends Phaser.Scene {
  constructor() { super('MovementTest'); }
  preload() { preloadSunLight(this); }
  create() {
    createSunLightAnimations(this);
    // 遊戲畫布是 1672×941（臥室原圖尺寸），測試場景維持 960×600 的世界座標，用鏡頭縮放置中
    this.cameras.main.setZoom(Math.min(1672 / W, 941 / H)).centerOn(W / 2, H / 2);
    this.cameras.main.setBackgroundColor('#f4efe8');
    const g = this.add.graphics().setDepth(0);
    // 斜俯視地板：橫線越遠越密、縱線向消失點收斂
    const top = 120, bot = 570, vpX = W / 2, vpY = -900;
    g.fillStyle(0xece4d8, 1).fillRect(0, top, W, bot - top);
    g.lineStyle(1, 0xd6cbbb, 1);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, y = top + (bot - top) * (t * t * 0.35 + t * 0.65);
      g.lineBetween(0, y, W, y);
    }
    for (let x = -600; x <= W + 600; x += 80) {
      const k = (top - vpY) / (bot - vpY);
      g.lineBetween(vpX + (x - vpX) * k, top, x, bot);
    }
    g.fillStyle(0xe2d6c6, 1).fillRect(0, 0, W, top);
    g.fillStyle(0xcdbfae, 1).fillRect(0, top - 6, W, 6);

    // 深度測試用的柱子（底座 y = depth）
    this.blockers = [];
    [[300, 330], [640, 300], [480, 470]].forEach(([x, y], i) => {
      const p = this.add.graphics().setDepth(y);
      p.fillStyle(0x000000, 0.08).fillEllipse(x, y, 74, 18);
      p.fillStyle(i === 1 ? 0xc7d3c4 : 0xd9c3b0, 1).fillRect(x - 26, y - 110, 52, 110);
      p.fillStyle(i === 1 ? 0xdbe5d8 : 0xe8d6c6, 1).fillEllipse(x, y - 110, 52, 16);
      p.fillStyle(0x000000, 0.06).fillRect(x + 10, y - 110, 16, 110);
      this.add.text(x, y - 60, '柱 ' + (i + 1), { fontFamily: FONT, fontSize: '13px', color: '#7a6a5e' })
        .setOrigin(0.5).setDepth(y + 0.1);
      this.blockers.push({ x: x - 26, y: y - 10, w: 52, h: 10 });
    });

    this.cat = new SunLightCat(this, 620, 520, {
      speed: 160, baseScale: 1,
      perspective: { yNear: 570, yFar: 140, near: 1.0, far: 0.82 },
      bounds: { x0: 16, y0: top + 14, x1: W - 16, y1: bot - 2 },
      blockers: this.blockers,
    });

    this.debug = this.add.graphics().setDepth(9999);
    this.input.keyboard.on('keydown-B', () => this.registry.set('debug', !this.registry.get('debug')));

    hudText(this, 24, 22, '① 角色移動測試', 20, '#3d332e');
    hudText(this, 24, 52, 'WASD／方向鍵 移動　·　B 切換 Debug（腳底錨點／碰撞框）', 13, '#8a7a6e');
    this.info = hudText(this, W - 24, 22, '', 13, '#5a4d45').setOrigin(1, 0).setAlign('right').setLineSpacing(4);
  }
  update(_, dt) {
    const c = this.cat;
    c.update(dt);
    const s = c.sprite;
    this.info.setText([
      `動畫  ${s.anims.currentAnim ? s.anims.currentAnim.key.replace('sun_', '') : '-'}`,
      `影格  ${s.frame.name}${s.flipX ? ' (flipX)' : ''}`,
      `腳底  (${s.x.toFixed(0)}, ${s.y.toFixed(0)})`,
      `depth ${s.depth.toFixed(0)}　scale ${s.scaleX.toFixed(2)}`,
    ].join('\n'));
    const d = this.debug.clear();
    if (!this.registry.get('debug')) return;
    const b = s.getBounds();
    d.lineStyle(1, 0x7fa7c9, 0.8).strokeRect(b.x, b.y, b.width, b.height);
    const f = c.footRect();
    d.lineStyle(1.5, 0xd2694f, 1).strokeRect(f.x, f.y, f.w, f.h);
    d.lineStyle(2, 0xd2694f, 1).lineBetween(s.x - 8, s.y, s.x + 8, s.y).lineBetween(s.x, s.y - 8, s.x, s.y + 8);
    this.blockers.forEach(o => d.lineStyle(1, 0xd2694f, 0.5).strokeRect(o.x, o.y, o.w, o.h));
  }
}
