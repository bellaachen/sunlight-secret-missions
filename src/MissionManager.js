/* =========================================================
 * MissionManager — 任務步驟、進度、成功／失敗、獎勵（只管規則，不畫任何東西）
 *
 * 任務定義在 scene_config.json 的 missions[]，第一關：
 *   feet_nap「在主人腳邊睡覺」
 *     1. onBed     跳上主人的床
 *     2. reachFeet 潛行到主人腳邊（feetZone）
 *     3. nap       在腳邊安靜待 N 秒（動了就重來）
 *     ★ cup       推倒床頭的水杯（加分，但很吵）
 *
 * 事件：'step'(step) · 'napProgress'(t, need) · 'napReset' · 'bonus'(bonus) · 'success'(result) · 'fail'(result)
 * ========================================================= */
class MissionManager extends Phaser.Events.EventEmitter {
  constructor(def) {
    super();
    this.def = def;
    this.steps = def.steps.map(s => ({ ...s, done: false }));
    this.bonus = (def.bonus || []).map(b => ({ ...b, done: false }));
    this.state = 'active';        // active | success | failed
    this.napT = 0;
    this.elapsed = 0;
  }

  get current() { return this.steps.find(s => !s.done) || null; }
  isDone(id) { const s = this.steps.find(x => x.id === id) || this.bonus.find(x => x.id === id); return !!(s && s.done); }

  complete(id) {
    const s = this.steps.find(x => x.id === id);
    if (!s || s.done || this.state !== 'active') return;
    s.done = true;
    this.emit('step', s);
  }

  completeBonus(id) {
    const b = this.bonus.find(x => x.id === id);
    if (!b || b.done || this.state !== 'active') return false;
    b.done = true;
    this.emit('bonus', b);
    return true;
  }

  inFeet(x, y) {
    const z = this.def.feetZone;
    return ((x - z.x) / z.rx) ** 2 + ((y - z.y) / z.ry) ** 2 <= 1;
  }

  /** ctx = { level, x, y, moving, busy, alert }（alert = AlertSystem，結算安靜獎勵用） */
  update(dt, ctx) {
    if (this.state !== 'active') return;
    this.elapsed += dt;
    const onBed = ctx.level === 'bed' && !ctx.busy;
    const inFeet = onBed && this.inFeet(ctx.x, ctx.y);
    if (onBed) this.complete('onBed');
    if (this.isDone('onBed') && inFeet) this.complete('reachFeet');

    const napping = this.isDone('reachFeet') && !this.isDone('nap');
    if (napping) {
      if (inFeet && !ctx.moving) {
        this.napT += dt;
        this.emit('napProgress', this.napT, this.def.napSeconds * 1000);
        if (this.napT >= this.def.napSeconds * 1000) { this.complete('nap'); this.finish('success', ctx.alert); }
      } else if (this.napT > 0) {
        this.napT = 0;
        this.emit('napReset');
      }
    }
  }

  /** 阿光正在腳邊睡覺（給 AlertSystem 讓主人放鬆用） */
  get napping() { return this.state === 'active' && this.isDone('reachFeet') && !this.isDone('nap') && this.napT > 0; }

  fail(alert) { this.finish('failed', alert); }

  finish(state, alert) {
    if (this.state !== 'active') return;
    this.state = state;
    const r = this.result(alert);
    this.emit(state === 'success' ? 'success' : 'fail', r);
  }

  /** 結算：基本分 + 安靜獎勵 + 加分任務，並給稱號 */
  result(alert) {
    const R = this.def.rewards, lines = [];
    let total = 0;
    if (this.state === 'success') {
      lines.push(['完成任務', R.base]); total += R.base;
      if (alert && !alert.everRestless) { lines.push(['主人完全沒翻身', R.quiet]); total += R.quiet; }
      else if (alert && !alert.everPeek) { lines.push(['沒被主人偷看到', R.calm]); total += R.calm; }
      for (const b of this.bonus) if (b.done) { lines.push([b.text, b.points]); total += b.points; }
    }
    const T = this.def.titles || {};
    let title = null;
    if (this.state === 'success') {
      if (this.isDone('cup')) title = T.cup;
      else if (alert && !alert.everRestless) title = T.quiet;
      else title = T.base;
    }
    return { state: this.state, lines, total, title, seconds: Math.round(this.elapsed / 1000) };
  }
}
