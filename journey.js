// 纯展示层：开奖已保存后才开始动画，不参与余额或随机计算。
function placeTraveler(marker, point, fraction, direction = 1) {
  marker.style.left = `${point.x / 600 * 100}%`;
  marker.style.top = `${point.y / 360 * 100}%`;
  marker.style.setProperty('--depth', 1 - fraction * .12);
  marker.style.setProperty('--direction', direction);
}
export function resetJourney() {
  const path = document.getElementById('journey-path');
  const marker = document.getElementById('journey-marker');
  if (!path || !marker) return;
  placeTraveler(marker, path.getPointAtLength(0), 0);
  document.getElementById('journey-status').textContent = '这段小路，我们慢慢走。';
}
export function arrive() {
  const scene = document.querySelector('.journey');
  const path = document.getElementById('journey-path');
  const progress = document.getElementById('journey-progress');
  const marker = document.getElementById('journey-marker');
  const status = document.getElementById('journey-status');
  if (!scene || !path) return Promise.resolve();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const length = path.getTotalLength();
  progress.style.strokeDasharray = length;
  progress.style.strokeDashoffset = length;
  status.textContent = '沿着山径，向前一点…';
  scene.classList.add('is-moving');
  const position = fraction => {
    const point = path.getPointAtLength(length * fraction);
    const ahead = path.getPointAtLength(Math.min(length, length * fraction + 2));
    placeTraveler(marker, point, fraction, ahead.x < point.x ? -1 : 1);
    progress.style.strokeDashoffset = length * (1 - fraction);
  };
  return new Promise(resolve => {
    let frame, done = false;
    const finish = () => {
      if (done) return; done = true;
      cancelAnimationFrame(frame); clearTimeout(timer);
      position(1); scene.classList.remove('is-moving', 'is-arrived');
      status.textContent = '已抵达。下一段，慢慢来。';
      resolve();
    };
    const timer = setTimeout(finish, reduced ? 100 : 3000);
    if (reduced) { position(1); return; }
    scene.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const start = performance.now();
    const tick = now => {
      if (done) return;
      const t = Math.min((now - start) / 2150, 1);
      position(t * t * (3 - 2 * t));
      if (t === 1) {
        scene.classList.add('is-arrived'); status.textContent = '抵达了，这一步算数。';
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
}
