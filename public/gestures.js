// PWA（加入主畫面後以獨立視窗開啟）專用的手機操作：
//   1. 禁止雙指縮放與雙擊放大，操作感接近原生 App
//   2. 從螢幕左緣往右滑 → 送出 'edge-back' 事件，由各頁決定「上一頁」要做什麼
// 一般瀏覽器分頁不啟用：保留縮放（無障礙），也避免跟瀏覽器本身的返回手勢衝突。
(() => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (!standalone) return;

  document.documentElement.classList.add('is-standalone');

  // ── 禁止縮放 ────────────────────────────────────────────
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
  }
  // iOS Safari 的雙指縮放事件
  const block = e => e.preventDefault();
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
    document.addEventListener(type, block, { passive: false });
  });
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // ── 左緣右滑返回 ────────────────────────────────────────
  const EDGE_PX = 28;      // 起點必須在螢幕最左側這麼寬的範圍內
  const TRIGGER_PX = 80;   // 往右滑超過這個距離就算返回
  const MAX_SHIFT = 56;    // 提示圓鈕最多滑出多少

  const hint = document.createElement('div');
  hint.className = 'edge-back';
  hint.setAttribute('aria-hidden', 'true');
  hint.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
  if (document.body) document.body.appendChild(hint);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(hint));

  let drag = null;

  function reset() {
    drag = null;
    hint.classList.remove('is-dragging', 'is-ready');
    hint.style.setProperty('--p', '0');
  }

  document.addEventListener('touchstart', e => {
    // 頁面可用 data-edge-back="off" 暫停（例如首頁沒有上一頁）
    if (e.touches.length !== 1 || document.body.dataset.edgeBack === 'off') return;
    const t = e.touches[0];
    if (t.clientX > EDGE_PX) return;
    drag = { x: t.clientX, y: t.clientY, active: false, dx: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!drag || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.x;
    const dy = Math.abs(t.clientY - drag.y);

    if (!drag.active) {
      if (dy > 12 && dy > dx) { reset(); return; }   // 其實是上下捲動
      if (dx < 10) return;
      drag.active = true;
      hint.classList.add('is-dragging');
    }

    e.preventDefault();  // 滑動返回時不要同時捲動頁面
    drag.dx = dx;
    const progress = Math.max(0, Math.min(dx / TRIGGER_PX, 1));
    hint.style.setProperty('--p', String(progress));
    hint.style.setProperty('--y', `${t.clientY}px`);
    hint.style.setProperty('--shift', `${Math.min(dx, MAX_SHIFT)}px`);
    hint.classList.toggle('is-ready', progress >= 1);
  }, { passive: false });

  function end() {
    const fire = drag?.active && drag.dx >= TRIGGER_PX;
    reset();
    if (fire) document.dispatchEvent(new CustomEvent('edge-back'));
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
})();
