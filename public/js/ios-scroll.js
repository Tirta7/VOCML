// Mencegah efek "tarik / bounce" iOS (termasuk PWA mode standalone & iOS < 16 yang mengabaikan
// overscroll-behavior). Header tetap diam; hanya area yang memang bisa di-scroll yang bergerak,
// dan itupun tidak melewati batas atas / bawah.
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function scrollableAncestor(el, axis) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    const ov = axis === 'y' ? s.overflowY : s.overflowX;
    if (!/(auto|scroll)/.test(ov)) continue;
    const can = axis === 'y' ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1;
    if (can) return n;
  }
  return null;
}

if (isTouch) {
  let sx = 0;
  let sy = 0;

  document.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 || !e.cancelable) return; // pinch-zoom dibiarkan
    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    const axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
    const d = axis === 'y' ? dy : dx;
    const el = scrollableAncestor(e.target, axis);
    if (!el) return e.preventDefault(); // tidak ada yang bisa di-scroll -> jangan gerakkan halaman

    const pos = axis === 'y' ? el.scrollTop : el.scrollLeft;
    const max = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    const atStart = pos <= 0 && d > 0;
    const atEnd = pos >= max - 1 && d < 0;
    if (atStart || atEnd) e.preventDefault(); // sudah mentok: cegah bounce
  }, { passive: false });
}
