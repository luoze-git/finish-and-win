import { REWARDS } from './config.js';
import { transaction } from './store.js?v=repeat9';
import { soundEnabled, setSound, unlockSound, playSound } from './sound.js';
import { arrive, resetJourney } from './journey.js?v=traveler6';
const $ = id => document.getElementById(id);
function renderSound() {
  $('sound-toggle').textContent = soundEnabled() ? '♪ 声音开' : '♪ 声音关';
  $('sound-toggle').setAttribute('aria-pressed', String(soundEnabled()));
}
$('sound-toggle').addEventListener('click', () => {
  setSound(!soundEnabled()); renderSound();
  if (soundEnabled()) void playSound('start');
  else { $('sound-sample').pause(); $('sound-status').textContent = '操作音效已关闭。'; }
});
window.addEventListener('app-sound-error', event => {
  $('sound-check').open = true;
  $('sound-status').textContent = event.detail;
});
$('sound-test').addEventListener('click', async () => {
  setSound(true); renderSound();
  $('sound-test').disabled = true;
  $('sound-status').textContent = '正在启用声音…';
  const played = await playSound('finish', 12);
  $('sound-test').disabled = false;
  if (played) $('sound-status').textContent = '已发送试听旋律。若仍听不到，请试下方播放器；若它也无声，请检查此窗口的静音和系统音量输出。';
});
$('sound-sample').addEventListener('error', () => {
  $('sound-status').textContent = '试听文件未能加载。请确认本地服务运行后刷新页面。';
});
renderSound();
let state, busy = false, arriving = false, limit = 10, pending, editing;
// 复用已有奖励表单，只增加一个开关。
const rewardToggle = document.createElement('label');
rewardToggle.className = 'repeat-toggle';
rewardToggle.innerHTML = '<input id="reward-repeatable" type="checkbox" role="switch" checked><span>可重复</span>';
$('reward-form').insertBefore(rewardToggle, $('reward-form').querySelector('button'));
function openEditor(kind, item) {
  if (busy || arriving) return;
  editing = { kind, id: item.id };
  $('edit-title').textContent = kind === 'task' ? '编辑任务' : '编辑奖励';
  $('edit-name').value = item.name;
  $('edit-repeatable').checked = item.repeatable;
  $('edit-cost-field').hidden = kind === 'task';
  $('edit-cost').disabled = kind === 'task';
  $('edit-cost').required = kind === 'reward';
  $('edit-cost').value = item.cost ?? '';
  $('delete-reward').hidden = kind !== 'reward';
  $('edit-error').hidden = true;
  $('edit-dialog').showModal();
}
$('cancel-edit').addEventListener('click', () => $('edit-dialog').close());
$('edit-dialog').addEventListener('close', () => { editing = null; });
$('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!editing || busy || arriving) return;
  const action = { type: editing.kind === 'task' ? 'editTask' : 'editReward',
    id: editing.id, taskId: editing.id, name: $('edit-name').value,
    cost: Number($('edit-cost').value), repeatable: $('edit-repeatable').checked };
  $('save-edit').disabled = true;
  if (await act(action)) $('edit-dialog').close();
  else { $('edit-error').hidden = false; $('edit-error').textContent = $('message').textContent; }
  $('save-edit').disabled = false;
});
$('delete-reward').addEventListener('click', async () => {
  if (!editing || busy || arriving) return;
  if (!confirm('删除这个奖励？已有兑换记录会保留。')) return;
  if (await act({ type: 'deleteReward', id: editing.id })) $('edit-dialog').close();
  else { $('edit-error').hidden = false; $('edit-error').textContent = $('message').textContent; }
});
$('edit-active').addEventListener('click', () => {
  const task = state.tasks.find(t => t.id === state.active?.taskId);
  if (task) openEditor('task', task);
});
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('finish-and-win') : null;
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function message(text) { $('message').textContent = text; $('message').hidden = !text; }
function render() {
  if (arriving) { $('finish').disabled = true; return; }
  $('balance').textContent = state.balance.toLocaleString('zh-CN');
  $('task-form').hidden = !!state.active; $('active-task').hidden = !state.active;
  $('task-title').textContent = state.active ? '就做这一件' : '下一件小事';
  $('task-status').textContent = state.active ? '进行中' : '准备开始';
  $('active-name').textContent = state.active?.name ?? '';
  $('first-tip').hidden = !!state.active || state.history.some(x => x.type === 'finish');
  $('start').disabled = busy; $('finish').disabled = busy;
  $('active-edit').hidden = !state.active;
  $('active-repeat-state').textContent = state.active?.repeatable ? '可重复' : '不可重复';
  $('edit-active').disabled = busy;
  $('task-list').replaceChildren();
  const tasks = state.tasks.filter(t => t.id !== state.active?.taskId);
  $('saved-tasks').hidden = !tasks.length;
  for (const task of tasks) {
    const row = node('div', undefined, 'reward-row');
    const copy = node('div', undefined, 'row-copy');
    copy.append(node('strong', task.name), node('small', task.repeatable ? '可重复' : '不可重复'));
    const actions = node('div', undefined, 'row-actions');
    const start = node('button', '开始', 'secondary');
    start.type = 'button'; start.disabled = busy || !!state.active;
    start.addEventListener('click', async () => {
      unlockSound();
      if (await act({ type: 'startTask', taskId: task.id })) {
        resetJourney(); playSound('start'); $('result').hidden = true; $('finish').focus();
      }
    });
    const edit = node('button', '编辑', 'text-button');
    edit.type = 'button'; edit.disabled = busy; edit.setAttribute('aria-label', '编辑任务：' + task.name);
    edit.addEventListener('click', () => openEditor('task', task));
    actions.append(start, edit); row.append(copy, actions); $('task-list').append(row);
  }
  $('rewards').replaceChildren();
  if (!state.rewards.length) $('rewards').append(node('p', '还没有奖励。添一件你期待的小事吧。', 'empty'));
  for (const reward of state.rewards) {
    const row = node('div', undefined, 'reward-row'); const copy = node('div', undefined, 'row-copy');
    copy.append(node('strong', reward.name), node('small', `${reward.cost} 金币 · ${reward.repeatable ? '可重复' : '不可重复'}`));
    const button = node('button', state.balance >= reward.cost ? '兑换' : `还差 ${reward.cost - state.balance}`, 'secondary');
    button.disabled = busy || state.balance < reward.cost;
    button.addEventListener('click', () => {
      pending = { type: 'redeem', id: reward.id, revision: reward.revision, requestId: uid() };
      $('redeem-description').textContent = `${reward.name} · ${reward.cost} 金币`;
      $('redeem-dialog').showModal(); $('cancel-redeem').focus();
    });
    const actions = node('div', undefined, 'row-actions');
    const edit = node('button', '编辑', 'text-button');
    edit.disabled = busy; edit.setAttribute('aria-label', '编辑奖励：' + reward.name);
    edit.addEventListener('click', () => openEditor('reward', reward));
    actions.append(button, edit); row.append(copy, actions); $('rewards').append(row);
  }
  $('history').replaceChildren(); $('record-count').textContent = `${state.history.length} 条记录`;
  if (!state.history.length) $('history').append(node('li', '你的第一份完成记录，会出现在这里。', 'empty'));
  for (const record of state.history.slice(0, limit)) {
    const row = node('li', undefined, 'history-row'), copy = node('div', undefined, 'row-copy');
    const time = new Date(record.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    copy.append(node('strong', record.name), node('small', `${record.type === 'finish' ? '完成' : '兑换'} · ${time}`));
    row.append(node('span', record.type === 'finish' ? '✓' : '↗', 'history-icon'), copy, node('span', `${record.coins > 0 ? '+' : ''}${record.coins}`, `delta ${record.coins < 0 ? 'minus' : ''}`));
    $('history').append(row);
  }
  $('more').hidden = state.history.length <= limit;
}
async function refresh() { if (busy || arriving) return; try { state = await transaction(); render(); } catch (error) { message(error.message); } }
async function act(action) {
  if (busy || (arriving && action.type !== 'finish')) return false;
  busy = true; message(''); if (state) render(); $('confirm-redeem').disabled = true;
  try {
    state = await transaction(action); channel?.postMessage('changed');
    return true;
  } catch (error) { message(error.message); return false; }
  finally { busy = false; $('confirm-redeem').disabled = false; if (state) render(); }
}
$('task-form').addEventListener('submit', async event => {
  event.preventDefault();
  unlockSound();
  if (await act({ type: 'start', name: $('task-name').value, repeatable: $('task-repeatable').checked })) { resetJourney(); playSound('start'); $('task-form').reset(); $('result').hidden = true; $('finish').focus(); }
});
$('finish').addEventListener('click', async () => {
  if (busy || arriving) return;
  unlockSound();
  const id = state?.active?.id;
  if (!id) return;
  arriving = true;
  if (!(await act({ type: 'finish', id }))) { arriving = false; render(); return; }
  const result = state.history.find(x => x.id === id);
  try { await arrive(); } catch { /* 动画失败也必须展示已保存的奖励。 */ } finally { arriving = false; render(); }
  playSound('finish', result.coins);
  $('result').replaceChildren(node('span', result.coins === 30 ? '✦ 哇，惊喜大奖！' : result.coins === 12 ? '✦ 今天的小幸运！' : '✦ 完成啦，奖励已到账！'), node('strong', `+${result.coins} 金币`), node('p', `「${result.name}」已完成`));
  $('result').hidden = false; $('result').classList.remove('pop'); void $('result').offsetWidth; $('result').classList.add('pop');
  $('result').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
$('reward-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (await act({ type: 'add', name: $('reward-name').value, cost: Number($('reward-cost').value), repeatable: $('reward-repeatable').checked })) { $('reward-form').reset(); $('add-details').open = false; }
});
$('cancel-redeem').addEventListener('click', () => $('redeem-dialog').close());
$('redeem-dialog').addEventListener('close', () => { pending = null; });
$('confirm-redeem').addEventListener('click', async () => {
  if (!pending) return;
  unlockSound();
  const success = await act(pending);
  if (success) playSound('redeem');
  $('redeem-dialog').close();
  if (success) { $('result').hidden = false; $('result').replaceChildren(node('strong', '兑换成功'), node('p', '金币已扣除，去享受你的奖励吧。')); }
});
$('more').addEventListener('click', () => { limit += 10; render(); });
for (const r of REWARDS) { const el = node('div', undefined, 'odds-list-item'); el.append(node('strong', `${r.coins} 金币`), node('div', `${r.weight}%`)); $('odds-list').append(el); }
channel?.addEventListener('message', refresh); window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
await refresh();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => { $('offline-status').textContent = '离线已就绪 · 可通过浏览器菜单添加到主屏幕'; }).catch(() => { $('offline-status').textContent = '离线缓存未就绪，请联网刷新后重试'; });
} else { $('offline-status').textContent = '当前地址不支持离线安装；请使用 HTTPS 或本机 localhost'; }
