/* =========================================================
 * AlertSystem — 主人警覺值（只管數值與主人反應，不畫任何東西）
 *
 *   value 0–100
 *   stage：calm（熟睡）→ stir（≥warnAt，預兆）→ restless（≥restlessAt，翻身）
 *          → peek（≥peekAt，瞇眼偷看）→ awake（≥failAt，任務失敗）
 *
 * 事件：'stage'(stage, prev) · 'bump'(amount, reason) · 'fail'
 *   reason：land／leave／cup／creakBed（床墊彈簧）／creakFloor（地板嘎吱）
 * ========================================================= */
class AlertSystem extends Phaser.Events.EventEmitter {
  constructor(params, owner) {
    super();
    this.p = params;
    this.owner = owner;
    this.value = 0;
    this.max = 0;
    this.failed = false;
    this.everRestless = false;
    this.everPeek = false;
    this.cd = { restless: 0, peek: 0 };
    this.stage = 'calm';
    this.watching = false;   // 主人正在偷看（Peek 播放中）
  }

  /** 一次性的聲響：跳上床、跳下床、推倒水杯 */
  bump(amount, reason = '') {
    if (this.failed || !amount) return;
    this.value = Phaser.Math.Clamp(this.value + amount, 0, 100);
    this.max = Math.max(this.max, this.value);
    this.emit('bump', amount, reason);
    this.react(true);
  }

  /**
   * 每幀呼叫
   * ctx = { onBed, moving, sneak, distFace, sleeping }
   *   sleeping：阿光正在腳邊睡覺（任務步驟 3）→ 讓主人慢慢放鬆
   */
  update(dt, ctx) {
    const P = this.p, sec = dt / 1000;
    this.cd.restless = Math.max(0, this.cd.restless - dt);
    this.cd.peek = Math.max(0, this.cd.peek - dt);
    this.watching = this.owner.state === 'peek';
    if (this.failed) return;

    // 走動時不定時發出聲響（床墊彈簧、地板嘎吱）：讓「一直走」比較危險，不只是線性上升
    const N = P.noise;
    if (N && ctx.moving && !ctx.busy) {
      if (this.noiseT === undefined) this.noiseT = this.nextNoise();
      this.noiseT -= sec;
      if (this.noiseT <= 0) {
        this.noiseT = this.nextNoise();
        const amt = (ctx.onBed ? N.bed : N.floor) * (ctx.sneak ? N.sneakFactor : 1);
        const room = ctx.onBed ? amt : Math.min(amt, Math.max(0, (N.floorCap ?? 100) - this.value));   // 床下最多推到 floorCap
        if (room > 0) this.bump(room, ctx.onBed ? 'creakBed' : 'creakFloor');
        if (this.failed) return;
      }
    }

    let rate;
    if (ctx.onBed && ctx.moving) {
      rate = ctx.distFace < P.face.radius ? P.gain.walkNearFace : P.gain.walk;
      if (this.watching) rate += P.gain.peekWatch;          // 被偷看時還在動 → 風險大增
      if (ctx.sneak) rate *= P.sneakFactor;
    } else if (ctx.onBed) {
      if (ctx.sleeping) rate = -P.decay.sleeping;
      else if (ctx.distFace < P.nearOwnerRadius) rate = -P.decay.nearOwnerIdle;   // 在主人身邊停下來不會下降
      else rate = -P.decay.onBedIdle;
    } else if (ctx.moving && P.gain.floorWalk) {
      rate = P.gain.floorWalk * (ctx.sneak ? P.sneakFactor : 1);   // 地板上走動也會慢慢吵到主人
      const cap = (P.noise && P.noise.floorCap) ?? 100;
      if (this.value >= cap) rate = Math.min(0, cap - this.value);   // 床下最多推到 floorCap
    } else {
      rate = -P.decay.offBed;
    }
    this.value = Phaser.Math.Clamp(this.value + rate * sec, 0, 100);
    this.max = Math.max(this.max, this.value);
    this.rate = rate;
    this.react(rate > 0);
  }

  nextNoise() { const [a, b] = this.p.noise.interval; return a + Math.random() * (b - a); }

  react(rising) {
    const P = this.p, o = this.owner, v = this.value;
    if (v >= P.failAt) { this.fail(); return; }
    if (rising && o.state === 'sleeping') {
      if (v >= P.peekAt && this.cd.peek <= 0) {
        o.play('peek'); this.everPeek = true; this.cd.peek = P.peekCooldown * 1000;
      } else if (v >= P.restlessAt && this.cd.restless <= 0) {
        o.play('restless'); this.everRestless = true; this.cd.restless = P.restlessCooldown * 1000;
      }
    }
    const st = v >= P.peekAt ? 'peek' : v >= P.restlessAt ? 'restless' : v >= P.warnAt ? 'stir' : 'calm';
    if (st !== this.stage) { const prev = this.stage; this.stage = st; this.emit('stage', st, prev); }
  }

  fail() {
    if (this.failed) return;
    this.failed = true;
    this.value = 100;
    this.max = 100;
    this.stage = 'awake';
    this.owner.play('awake');
    this.emit('stage', 'awake');
    this.emit('fail');
  }
}
