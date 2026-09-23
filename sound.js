let context, ready, enabled = true, generation = 0;
const voices = new Set();
try { enabled = localStorage.getItem('finish-and-win-sound') !== 'off'; } catch {}
export const soundEnabled = () => enabled;
// 在点击处理器中先解锁音频，再等待保存；播放失败不影响任务。
export function unlockSound() {
  if (!enabled) return Promise.resolve(false);
  if (ready) return ready;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw Error('此浏览器不支持操作音效，请使用下方播放器试听。');
    if (!context || context.state === 'closed') context = new Audio();
    if (context.state === 'running') return Promise.resolve(true);
    const resumed = context.resume();
    ready = new Promise(resolve => {
      const timer = setTimeout(() => {
        report('浏览器尚未允许播放声音。请点「试听声音」，或使用下方播放器。');
        resolve(false);
      }, 2500);
      Promise.resolve(resumed).then(() => {
        clearTimeout(timer);
        const running = context.state === 'running';
        if (!running) report('音频仍被暂停，请使用下方播放器试听。');
        resolve(running);
      }, () => {
        clearTimeout(timer);
        report('浏览器拒绝播放音效，请使用下方播放器试听。');
        resolve(false);
      });
    }).finally(() => { ready = null; });
    return ready;
  } catch (error) {
    report(error.message || '无法启用音效，请使用下方播放器试听。');
    return Promise.resolve(false);
  }
}
function report(message) {
  window.dispatchEvent(new CustomEvent('app-sound-error', { detail: message }));
}
export function setSound(value) {
  enabled = value;
  generation++;
  try { localStorage.setItem('finish-and-win-sound', value ? 'on' : 'off'); } catch {}
  if (!value) for (const voice of voices) { try { voice.stop(); } catch {} }
}
export async function playSound(kind, coins = 3) {
  const requestedGeneration = generation;
  if (!enabled || !await unlockSound() || !enabled || requestedGeneration !== generation) return false;
  const notes = kind === 'start' ? [523.25,659.25] : kind === 'redeem' ? [783.99,659.25,1046.5] : coins >= 12 ? [523.25,659.25,783.99,1046.5,1318.51,1567.98] : [523.25,659.25,783.99,1046.5];
  try {
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const at = context.currentTime + .03 + index * .16;
      oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.18, at + .012);
      gain.gain.exponentialRampToValueAtTime(.001, at + .36);
      oscillator.connect(gain); gain.connect(context.destination); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + .4);
    });
    return true;
  } catch {
    report('音效播放失败，请使用下方播放器试听。');
    return false;
  }
}
