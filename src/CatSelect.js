/* =========================================================
 * 選貓＋取名（遊戲開始前的 DOM 畫面）
 * - 第一次玩：選貓 → 取名 → 完成 → 開始第一關
 * - 之後打開直接進遊戲；網址加 ?pick=1 或按右上「換貓・改名」可以重選
 * - 結果存在 localStorage 'ssm_cat'：{ id, name }
 * - 遊戲讀 window.SSM_CAT 決定要載哪隻貓的圖、文字裡用什麼名字
 * ========================================================= */

const SSM_CATS = [
  { id: 'sunlight', title: '阿光', desc: '棕色虎斑，身上有條紋也有圓點。好奇心滿滿。' },
  { id: 'orange',   title: '小橘', desc: '橘色虎斑。聽到零食袋的聲音就會出現。' },
  { id: 'tuxedo',   title: 'Oreo', desc: '黑白賓士，像穿著燕尾服的小紳士。' },
  { id: 'calico',   title: '花花', desc: '三花貓，有一點小脾氣，但很會撒嬌。' },
];
const SSM_LOCKED_COUNT = 8;
const SSM_STORE_KEY = 'ssm_cat';

/** 目前選的貓（沒選過就是阿光） */
function ssmCurrentCat() {
  if (window.SSM_CAT) return window.SSM_CAT;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SSM_STORE_KEY) || 'null'); } catch (e) {}
  const def = SSM_CATS.find(c => saved && c.id === saved.id) || SSM_CATS[0];
  return { id: def.id, name: (saved && saved.name) || def.title };
}
/** 遊戲文字裡用的貓咪名字 */
function ssmCatName() { return ssmCurrentCat().name; }

const CatSelect = {
  /** 需要選貓就顯示畫面，玩家按「開始第一關」後 resolve；不需要就直接 resolve */
  run() {
    const qs = new URLSearchParams(location.search);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SSM_STORE_KEY) || 'null'); } catch (e) {}
    if (saved && saved.id && qs.get('pick') !== '1') {
      window.SSM_CAT = ssmCurrentCat();
      this.addSwitchButton();
      return Promise.resolve(window.SSM_CAT);
    }
    return new Promise(resolve => this.open(saved, resolve));
  },

  addSwitchButton() {
    if (document.getElementById('ssm-switch')) return;
    this.injectStyle();
    const b = document.createElement('button');
    b.id = 'ssm-switch'; b.type = 'button'; b.textContent = '換貓・改名';
    b.addEventListener('click', () => {
      const u = new URL(location.href); u.searchParams.set('pick', '1'); location.href = u.toString();
    });
    document.body.appendChild(b);
  },

  open(saved, resolve) {
    this.injectStyle();
    const all = SSM_CATS.map(c => Object.assign({ locked: false }, c));
    for (let k = 0; k < SSM_LOCKED_COUNT; k++) all.push({ id: 'locked' + k, title: '???', desc: '還在路上的貓咪，之後的更新會登場。', locked: true });
    const names = {};
    if (saved && saved.id) names[saved.id] = saved.name;
    const st = { screen: 'select', picked: Math.max(0, all.findIndex(c => saved && c.id === saved.id)) };

    const root = document.createElement('div');
    root.id = 'ssm-overlay';
    root.innerHTML = `
      <div class="ssm-phone">
        <section class="ssm-screen" data-screen="select">
          <div class="ssm-head">
            <div class="ssm-step">STEP 1 / 2</div>
            <h2 class="ssm-h">選一隻貓咪</h2>
            <p class="ssm-sub">牠會陪你完成今晚的秘密任務。</p>
          </div>
          <div class="ssm-row" role="listbox" aria-label="貓咪"></div>
          <div class="ssm-dots" aria-hidden="true"></div>
          <div class="ssm-info"><div class="ssm-info-t"></div><div class="ssm-info-d"></div></div>
          <div class="ssm-bottom"><button type="button" class="ssm-btn" data-act="toName"></button></div>
        </section>
        <section class="ssm-screen" data-screen="name" hidden>
          <button type="button" class="ssm-back" data-act="toSelect">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>換一隻
          </button>
          <div class="ssm-head ssm-head-tight">
            <div class="ssm-step">STEP 2 / 2</div>
            <h2 class="ssm-h">幫牠取個名字</h2>
          </div>
          <div class="ssm-card ssm-card-big"><div class="ssm-win"><img alt=""></div><img class="ssm-frame" src="assets/ui/card_frame.png" alt=""><div class="ssm-card-name"></div></div>
          <div class="ssm-field">
            <label for="ssm-name">貓咪的名字</label>
            <div class="ssm-input-wrap"><input id="ssm-name" maxlength="8" autocomplete="off" enterkeyhint="done"><span class="ssm-count"></span></div>
            <div class="ssm-help"></div>
          </div>
          <div class="ssm-bottom"><button type="button" class="ssm-btn" data-act="toDone">就是牠了！</button></div>
        </section>
        <section class="ssm-screen ssm-done" data-screen="done" hidden>
          <img class="ssm-bg" src="assets/ui/title_keyart.jpg" alt="深夜的臥室，貓咪從床尾探出頭">
          <div class="ssm-done-top">
            <div class="ssm-avatar"><img alt=""></div>
            <h2 class="ssm-done-h"><span class="ssm-done-name"></span><span>準備好出任務了！</span></h2>
          </div>
          <div class="ssm-done-shade"></div>
          <div class="ssm-done-bottom">
            <p>第一個任務：趁主人睡著，偷偷睡到他的腳邊。</p>
            <button type="button" class="ssm-btn ssm-btn-light" data-act="start">開始第一關</button>
          </div>
        </section>
      </div>`;
    document.body.appendChild(root);
    document.body.classList.add('ssm-open');

    const $ = s => root.querySelector(s);
    const row = $('.ssm-row'), dots = $('.ssm-dots'), input = $('#ssm-name');

    // 卡片
    all.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ssm-card' + (c.locked ? ' is-locked' : '');
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', c.locked ? '尚未解鎖的貓咪' : c.title);
      const img = c.locked ? 'assets/ui/portrait_locked.png' : `assets/ui/portrait_${c.id}.png`;
      b.innerHTML = `<div class="ssm-win"><img src="${img}" alt=""></div><img class="ssm-frame" src="assets/ui/card_frame.png" alt=""><div class="ssm-card-name">${c.title}</div>`;
      b.addEventListener('click', () => { pick(i, true); });
      row.appendChild(b);
      const d = document.createElement('span'); dots.appendChild(d);
    });

    const cur = () => all[st.picked];
    const nameOf = c => names[c.id] || c.title;

    function pick(i, scroll) {
      st.picked = i;
      [...row.children].forEach((el, k) => { el.classList.toggle('is-sel', k === i); el.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      [...dots.children].forEach((el, k) => { el.className = (k === i ? 'is-sel' : '') + (all[k].locked ? ' is-locked' : ''); });
      const c = cur();
      $('.ssm-info-t').textContent = c.locked ? '???' : c.title;
      $('.ssm-info-d').textContent = c.desc;
      const btn = $('[data-act="toName"]');
      btn.disabled = c.locked;
      btn.textContent = c.locked ? '即將登場，先選其他貓咪吧' : `選${c.title}`;
      if (scroll) { const el = row.children[i]; row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' }); }
    }

    // 滑動時，停在中間的那張就是選到的
    let t = null;
    row.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const mid = row.scrollLeft + row.clientWidth / 2;
        let best = 0, bd = 1e9;
        [...row.children].forEach((el, k) => { const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = k; } });
        if (best !== st.picked) pick(best, false);
      }, 80);
    });

    function show(screen) {
      st.screen = screen;
      root.querySelectorAll('.ssm-screen').forEach(s => { s.hidden = s.dataset.screen !== screen; });
    }

    function refreshName() {
      const v = input.value, n = v.trim(), c = cur();
      $('.ssm-count').textContent = `${Array.from(v).length}/8`;
      $('.ssm-card-big .ssm-card-name').textContent = n || c.title;
      const help = $('.ssm-help');
      help.textContent = n ? '1–8 個字，之後可以按右上「換貓・改名」再改。' : '名字不能空白喔';
      help.classList.toggle('is-err', !n);
      if (!n) help.setAttribute('role', 'alert'); else help.removeAttribute('role');
      $('[data-act="toDone"]').disabled = !n;
    }
    input.addEventListener('input', refreshName);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); act('toDone'); } });

    function act(a) {
      const c = cur();
      if (a === 'toName') {
        if (c.locked) return;
        $('.ssm-card-big .ssm-win img').src = `assets/ui/portrait_${c.id}.png`;
        input.value = nameOf(c);
        refreshName();
        show('name');
      } else if (a === 'toSelect') {
        show('select');
        pick(st.picked, true);
      } else if (a === 'toDone') {
        const n = input.value.trim();
        if (!n) return;
        names[c.id] = n;
        $('.ssm-avatar img').src = `assets/ui/portrait_${c.id}.png`;
        $('.ssm-done-name').textContent = n;
        show('done');
      } else if (a === 'start') {
        const chosen = { id: c.id, name: names[c.id] || c.title };
        try { localStorage.setItem(SSM_STORE_KEY, JSON.stringify(chosen)); } catch (e) {}
        window.SSM_CAT = chosen;
        // 網址拿掉 ?pick=1，重新整理才不會又跳出來
        const u = new URL(location.href);
        if (u.searchParams.has('pick')) { u.searchParams.delete('pick'); history.replaceState(null, '', u.toString()); }
        root.remove();
        document.body.classList.remove('ssm-open');
        CatSelect.addSwitchButton();
        resolve(chosen);
      }
    }
    root.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) act(b.dataset.act); });

    show('select');
    requestAnimationFrame(() => pick(st.picked, true));
  },

  injectStyle() {
    if (document.getElementById('ssm-style')) return;
    const s = document.createElement('style');
    s.id = 'ssm-style';
    s.textContent = `
#ssm-overlay{position:fixed;inset:0;z-index:100;background:#efe5d8;display:flex;align-items:center;justify-content:center;
  font-family:"Zen Maru Gothic","Noto Sans TC",system-ui,sans-serif;color:#4A2F20;-webkit-text-size-adjust:100%}
body.ssm-open{overflow:hidden}
.ssm-phone{position:relative;width:100%;height:100%;max-width:430px;max-height:932px;background:#FBF4EA;overflow:hidden}
@media (min-width:600px){.ssm-phone{border-radius:28px;box-shadow:0 10px 40px rgba(74,47,32,.18);height:min(844px,96vh)}}
.ssm-screen{position:absolute;inset:0;display:flex;flex-direction:column;box-sizing:border-box;
  padding:calc(env(safe-area-inset-top,0px) + 44px) 0 calc(env(safe-area-inset-bottom,0px) + 20px)}
.ssm-screen[hidden]{display:none}
.ssm-head{padding:0 28px;display:flex;flex-direction:column;gap:6px}
.ssm-head-tight{padding:0;margin-top:6px}
.ssm-step{font-size:13px;letter-spacing:.08em;color:#8A6A55}
.ssm-h{margin:0;font-size:28px;font-weight:700;line-height:1.3}
.ssm-sub{margin:0;font-size:15px;line-height:1.6;color:#6E5242}
.ssm-row{margin-top:clamp(12px,3vh,28px);display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;
  padding:12px calc(50% - 110px) 16px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ssm-row::-webkit-scrollbar{display:none}
.ssm-card{position:relative;flex:0 0 220px;width:220px;height:330px;padding:0;border:0;background:none;cursor:pointer;
  scroll-snap-align:center;transition:transform .2s,opacity .2s;transform:scale(.9);opacity:.75;font:inherit}
.ssm-card.is-locked{opacity:.55}
.ssm-card.is-sel{transform:scale(1);opacity:1}
.ssm-win{position:absolute;left:12.3%;top:21.2%;width:75.5%;height:55.2%;background:#FFF9F1;display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.ssm-win img{width:90%;height:92%;object-fit:contain;object-position:center bottom}
.ssm-frame{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.ssm-card-name{position:absolute;left:0;right:0;top:79.7%;text-align:center;font-size:19px;font-weight:700;color:#5A3A28;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 14%}
.ssm-dots{display:flex;justify-content:center;gap:6px;margin-top:4px}
.ssm-dots span{width:6px;height:6px;border-radius:3px;background:#C9B4A1;transition:width .2s}
.ssm-dots span.is-locked{background:#E2D6C8}
.ssm-dots span.is-sel{width:18px;background:#6B4430}
.ssm-info{margin:clamp(12px,2.5vh,22px) 28px 0;min-height:64px;display:flex;flex-direction:column;gap:4px;text-align:center}
.ssm-info-t{font-size:18px;font-weight:700}
.ssm-info-d{font-size:14px;line-height:1.6;color:#6E5242}
.ssm-bottom{margin-top:auto;padding:0 28px}
[data-screen="name"]{padding-left:28px;padding-right:28px}
[data-screen="name"] .ssm-bottom{padding:0}
.ssm-btn{width:100%;height:56px;border:0;border-radius:28px;background:#6B4430;color:#FFF8EE;font:700 17px "Zen Maru Gothic","Noto Sans TC",sans-serif;cursor:pointer}
.ssm-btn:disabled{background:#E7DCCF;color:#6E5242;cursor:not-allowed}
.ssm-btn-light{background:#FFF4E6;color:#4A2F20}
.ssm-btn:focus-visible,.ssm-card:focus-visible,.ssm-back:focus-visible{outline:3px solid #F2B98A;outline-offset:3px}
.ssm-back{align-self:flex-start;display:flex;align-items:center;gap:6px;min-height:44px;padding:0 4px;margin-top:-8px;border:0;background:none;color:#6B4430;font:500 15px "Zen Maru Gothic","Noto Sans TC",sans-serif;cursor:pointer}
.ssm-card-big{flex:none;width:200px;height:300px;margin:clamp(8px,2vh,20px) auto 0;cursor:default;transform:none;opacity:1}
.ssm-card-big .ssm-card-name{font-size:18px}
.ssm-field{margin-top:clamp(12px,2.5vh,24px);display:flex;flex-direction:column;gap:8px}
.ssm-field label{font-size:14px;font-weight:700}
.ssm-input-wrap{position:relative}
#ssm-name{box-sizing:border-box;width:100%;height:56px;padding:0 64px 0 18px;border:2px solid #D9C6B3;border-radius:16px;background:#fff;color:#4A2F20;
  font:500 18px "Zen Maru Gothic","Noto Sans TC",sans-serif}
#ssm-name:focus{outline:3px solid #F2B98A;outline-offset:2px}
.ssm-count{position:absolute;right:18px;top:18px;font-size:14px;color:#8A6A55}
.ssm-help{font-size:13px;color:#6E5242}
.ssm-help.is-err{color:#A3401F}
.ssm-done{padding:0}
.ssm-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ssm-done-top{position:absolute;left:44px;right:44px;top:calc(env(safe-area-inset-top,0px) + 11%);display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;color:#FFF8EE}
.ssm-avatar{width:76px;height:76px;border-radius:38px;background:#FFF4E6;border:3px solid #F2D9BF;overflow:hidden;display:flex;align-items:flex-end;justify-content:center}
.ssm-avatar img{width:66px;height:70px;object-fit:contain;object-position:center bottom}
.ssm-done-h{margin:0;display:flex;flex-direction:column;gap:2px;font-weight:700;line-height:1.35;text-shadow:0 2px 12px rgba(10,16,48,.7)}
.ssm-done-name{font-size:30px}
.ssm-done-h span:last-child{font-size:22px}
.ssm-done-shade{position:absolute;left:0;right:0;bottom:0;height:230px;background:linear-gradient(to bottom,rgba(37,24,18,0),rgba(37,24,18,.85) 40%)}
.ssm-done-bottom{position:absolute;left:28px;right:28px;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);display:flex;flex-direction:column;gap:12px}
.ssm-done-bottom p{margin:0;font-size:15px;line-height:1.7;color:#F1E3D3;text-align:center}
#ssm-switch{position:fixed;right:calc(env(safe-area-inset-right,0px) + 10px);top:calc(env(safe-area-inset-top,0px) + 10px);z-index:20;
  font:500 13px "Zen Maru Gothic","Noto Sans TC",sans-serif;padding:8px 14px;min-height:36px;border-radius:999px;border:1px solid #e6dccf;background:#fffdf9;color:#4A2F20;opacity:.9;cursor:pointer}
@media (max-height:700px){.ssm-card{flex-basis:180px;width:180px;height:270px}.ssm-row{padding-left:calc(50% - 90px);padding-right:calc(50% - 90px)}
  .ssm-card-big{width:160px;height:240px}.ssm-card-name{font-size:16px}}
`;
    document.head.appendChild(s);
  },
};
