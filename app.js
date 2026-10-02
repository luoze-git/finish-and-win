import { REWARDS } from './config.js';
import { transaction } from './store.js?v=lists11';
import { sessionContext } from './core.js?v=lists11';
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
let state, busy = false, arriving = false, limit = 10, pending, editing, taskTab = 'normal', sessionFormId;
const taskKindLabel = kind => ({ oneoff: '一次完成', repeatable: '可重复', ongoing: '进行中任务' }[kind]);
function selectTab(tab) {
  taskTab = tab;
  for (const name of ['normal', 'ongoing']) {
    $('tab-' + name).setAttribute('aria-selected', String(name === tab));
    $('tab-' + name).tabIndex = name === tab ? 0 : -1;
  }
  $('task-list').setAttribute('aria-labelledby', 'tab-' + tab);
  if (state) render();
}
for (const tab of ['normal', 'ongoing']) {
  $('tab-' + tab).addEventListener('click', () => selectTab(tab));
  $('tab-' + tab).addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 'normal' : event.key === 'End' ? 'ongoing' : tab === 'normal' ? 'ongoing' : 'normal';
      selectTab(next); $('tab-' + next).focus();
    }
  });
}
function ago(at) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 86400000));
  return days === 0 ? '今天' : days === 1 ? '昨天' : days + ' 天前';
}
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
  $('edit-repeatable').closest('label').hidden = kind === 'task';
  $('edit-kind-field').hidden = kind !== 'task';
  $('edit-kind').value = item.kind ?? 'oneoff';
  $('edit-kind').disabled = kind === 'task' && state.active?.taskId === item.id && item.kind === 'ongoing';
  $('edit-kind').querySelector('[value="ongoing"]').disabled = kind === 'task' && state.active?.taskId === item.id && item.kind !== 'ongoing';
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
    cost: Number($('edit-cost').value), repeatable: $('edit-repeatable').checked, kind: $('edit-kind').value };
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
  if (arriving) { $('finish').disabled = true; $('finish-session').disabled = true; $('pause-session').disabled = true; return; }
  $('balance').textContent = state.balance.toLocaleString('zh-CN');
  $('list-tip').hidden = !!state.active; $('active-task').hidden = !state.active;
  $('task-title').textContent = state.active ? '就做这一件' : '下一件小事';
  const ongoing = state.active?.kind === 'ongoing';
  const preparing = ongoing && state.active.status === 'preparing';
  $('task-status').textContent = preparing ? '准备这次推进' : state.active ? '进行中' : '准备开始';
  $('active-name').textContent = state.active?.name ?? '';
  $('first-tip').hidden = !!state.active || state.history.some(x => x.type === 'finish');
  $('finish').disabled = busy;
  for (const tab of ['normal', 'ongoing']) {
    $('add-' + tab + '-details').hidden = taskTab !== tab;
    $('add-' + tab + '-save').disabled = busy;
  }
  $('active-edit').hidden = !state.active;
  $('active-repeat-state').textContent = taskKindLabel(state.active?.kind) ?? '';
  $('finish').hidden = ongoing;
  $('session-area').hidden = !ongoing;
  $('session-start-form').hidden = !preparing;
  $('session-finish-form').hidden = !ongoing || preparing;
  for (const control of ['begin-session', 'cancel-session', 'finish-session', 'pause-session']) $(control).disabled = busy;
  if (ongoing) {
    const { latest } = sessionContext(state.history, state.active.taskId);
    $('session-context').textContent = latest ? `上次停在：${latest.note || '未填写'}\n下一步：${latest.nextStep || '未填写'}` : '第一次推进，先选一个小目标。';
    $('active-goal').textContent = '这次我先做到：' + (state.active.goal ?? '');
    if (sessionFormId !== state.active.id) {
      sessionFormId = state.active.id;
      $('session-goal').value = '';
      $('session-note').value = '';
      $('session-next').value = '';
    }
  } else sessionFormId = null;
  $('edit-active').disabled = busy;
  $('task-list').replaceChildren();
  const tasks = state.tasks.filter(t => t.id !== state.active?.taskId && (taskTab === 'ongoing' ? t.kind === 'ongoing' : t.kind !== 'ongoing'));
  if (!tasks.length) $('task-list').append(node('p', taskTab === 'ongoing' ? '把需要分多次推进的事情，先记在这里。' : '暂无待开始的普通任务。', 'empty'));
  for (const task of tasks) {
    const row = node('div', undefined, 'reward-row');
    const copy = node('div', undefined, 'row-copy');
    copy.append(node('strong', task.name), node('small', taskKindLabel(task.kind)));
    if (task.kind === 'ongoing') {
      const { latest, count } = sessionContext(state.history, task.id);
      copy.append(node('p', '下一步：' + (latest?.nextStep || '继续时，先定一个小目标'), 'next-step'));
      if (latest?.note) copy.append(node('p', '上次停在：' + latest.note, 'session-note'));
      copy.append(node('small', `${latest ? '上次' + (latest.outcome === 'paused' ? '停下' : '推进') + '：' + ago(latest.at) : '尚未开始'} · 已推进 ${count} 次`));
    }
    const actions = node('div', undefined, 'row-actions');
    const start = node('button', task.kind === 'ongoing' && sessionContext(state.history, task.id).latest ? '继续' : '开始', 'secondary');
    start.type = 'button'; start.disabled = busy || !!state.active;
    start.addEventListener('click', async () => {
      unlockSound();
      if (await act({ type: 'startTask', taskId: task.id })) {
        resetJourney(); $('result').hidden = true;
        if (task.kind === 'ongoing') { selectTab('ongoing'); $('session-goal').focus(); }
        else { playSound('start'); $('finish').focus(); }
      }
    });
    const edit = node('button', '编辑', 'text-button');
    edit.type = 'button'; edit.disabled = busy; edit.setAttribute('aria-label', '编辑任务：' + task.name);
    edit.addEventListener('click', () => openEditor('task', task));
    actions.append(start, edit);
    if (task.kind === 'ongoing') {
      const complete = node('button', '完成整个任务', 'text-button');
      complete.disabled = busy;
      complete.addEventListener('click', async () => {
        if (!confirm('确认整件事情已经完成？此操作会归档任务，不额外开奖。')) return;
        if (await act({ type: 'completeTask', taskId: task.id })) message('整个任务已完成，记录已保存。');
      });
      actions.append(complete);
    }
    row.append(copy, actions); $('task-list').append(row);
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
    const label = record.type === 'progress' ? (record.outcome === 'paused' ? '暂时停止' : '推进一次') : ({ finish: '完成', complete: '整个任务完成', redeem: '兑换' }[record.type] ?? '记录');
    copy.append(node('strong', record.name), node('small', `${label} · ${time}`));
    if (record.type === 'progress') {
      for (const [key, caption] of [['goal','小目标'],['note','做到哪里'],['nextStep','下一步']]) {
        if (record[key]) copy.append(node('p', caption + '：' + record[key], 'session-note'));
      }
    }
    const coins = record.coins ?? 0;
    row.append(node('span', record.type === 'redeem' ? '↗' : record.type === 'progress' ? '·' : '✓', 'history-icon'), copy, node('span', coins ? `${coins > 0 ? '+' : ''}${coins}` : '不开奖', `delta ${coins <= 0 ? 'minus' : ''}`));
    $('history').append(row);
  }
  $('more').hidden = state.history.length <= limit;
}
async function refresh() { if (busy || arriving) return; try { state = await transaction(); render(); } catch (error) { message(error.message); } }
async function act(action) {
  if (busy || (arriving && !['finish','progress'].includes(action.type))) return false;
  busy = true; message(''); if (state) render(); $('confirm-redeem').disabled = true;
  try {
    state = await transaction(action); channel?.postMessage('changed');
    return true;
  } catch (error) { message(error.message); return false; }
  finally { busy = false; $('confirm-redeem').disabled = false; if (state) render(); }
}
for (const tab of ['normal', 'ongoing']) {
  $('add-' + tab + '-form').addEventListener('submit', async event => {
    event.preventDefault();
    const kind = tab === 'ongoing' ? 'ongoing' : $('add-normal-repeatable').checked ? 'repeatable' : 'oneoff';
    if (await act({ type: 'addTask', name: $('add-' + tab + '-name').value, kind })) {
      $('add-' + tab + '-form').reset();
      $('add-' + tab + '-details').open = false;
      if (taskTab === tab) $('add-' + tab + '-details').querySelector('summary').focus();
      message('已保存到任务列表，准备好时再开始。');
    }
  });
}
async function finishExecution(type = 'finish') {
  if (busy || arriving) return;
  unlockSound();
  const id = state?.active?.id;
  if (!id) return;
  arriving = true;
  if (!(await act({ type, id, note: $('session-note').value, nextStep: $('session-next').value }))) { arriving = false; render(); return; }
  const result = state.history.find(x => x.id === id);
  try { await arrive(); } catch { /* 动画失败也必须展示已保存的奖励。 */ } finally { arriving = false; render(); }
  playSound('finish', result.coins);
  $('result').replaceChildren(node('span', result.coins === 30 ? '✦ 哇，惊喜大奖！' : result.coins === 12 ? '✦ 今天的小幸运！' : '✦ 奖励已到账！'), node('strong', `+${result.coins} 金币`), node('p', `「${result.name}」${type === 'progress' ? '已推进一次' : '已完成'}`));
  $('result').hidden = false; $('result').classList.remove('pop'); void $('result').offsetWidth; $('result').classList.add('pop');
  $('result').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  if (type === 'progress') selectTab('ongoing');
}
$('finish').addEventListener('click', () => finishExecution());
$('session-start-form').addEventListener('submit', async event => {
  event.preventDefault(); unlockSound();
  if (await act({ type: 'beginSession', id: sessionFormId, goal: $('session-goal').value })) {
    resetJourney(); playSound('start'); $('session-note').focus();
  }
});
$('cancel-session').addEventListener('click', async () => {
  if (await act({ type: 'cancelSession', id: sessionFormId })) selectTab('ongoing');
});
$('session-finish-form').addEventListener('submit', event => { event.preventDefault(); finishExecution('progress'); });
$('pause-session').addEventListener('click', async () => {
  if (await act({ type: 'pauseSession', id: sessionFormId, note: $('session-note').value, nextStep: $('session-next').value })) {
    $('result').hidden = true; selectTab('ongoing'); message('已保存停下的位置，下次可以接着做。本次不开奖。');
  }
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
