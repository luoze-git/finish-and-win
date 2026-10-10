import { REWARDS } from './config.js';
import { transaction } from './store.js?v=quick12';
import { sessionContext } from './core.js?v=quick12';
import { soundEnabled, setSound, unlockSound, playSound } from './sound.js?v=quick12';
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
let state, busy = false, arriving = false, limit = 10, pending, editing, taskTab = 'normal', sessionFormId, quickActiveId, detailTaskId;
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
function renderQuickStart() {
  const activeId = state.active?.id ?? null;
  if (quickActiveId !== activeId) {
    $('quick-start').open = !state.active;
    quickActiveId = activeId;
  }
  $('quick-summary').hidden = !state.active;
  $('quick-active-hint').hidden = !state.active;
  $('quick-save').disabled = busy;
  $('quick-go').disabled = busy || !!state.active;
  $('quick-bar').classList.toggle('has-active', !!state.active);
  $('quick-bar-label').textContent = state.active ? '＋ 记下下一件事' : '＋ 现在要做什么？';
  $('quick-bar-action').textContent = state.active ? '保存' : '开始 ▶';
}
function showStartedTask() {
  resetJourney(); $('result').hidden = true;
  $('quick-feedback').hidden = true;
  if (state.active.kind === 'ongoing') {
    selectTab('ongoing'); $('session-goal').focus();
  } else { playSound('start'); $('finish').focus(); }
  $('task-title').scrollIntoView({ block: 'start', behavior: 'instant' });
}
$('quick-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state || busy || arriving) return;
  // 键盘回车默认立即开始；有当前任务时则只保存，绝不替换它。
  const startNow = event.submitter ? event.submitter.value === 'start' : !state.active;
  if (startNow && state.active) return;
  const taskId = uid();
  const add = { type: 'addTask', taskId, name: $('quick-name').value, kind: 'oneoff' };
  if (startNow) unlockSound();
  if (await act(startNow ? [add, { type: 'startTask', taskId }] : add)) {
    $('quick-form').reset();
    if (startNow) showStartedTask();
    else {
      selectTab('normal');
      $('quick-feedback').textContent = '已保存到普通任务';
      $('quick-feedback').hidden = false;
      $('quick-name').focus({ preventScroll: true });
    }
  }
});
$('quick-name').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    if (state && !busy && !arriving) $('quick-form').requestSubmit(state.active ? $('quick-save') : $('quick-go'));
  }
});
$('quick-bar-open').addEventListener('click', () => {
  $('quick-start').open = true;
  $('quick-start').scrollIntoView({ block: 'center', behavior: 'instant' });
  $('quick-name').focus({ preventScroll: true });
});
function updateQuickBar() {
  const rect = $('quick-start').getBoundingClientRect();
  const viewport = window.visualViewport;
  const keyboard = viewport && viewport.height < window.innerHeight * .75;
  $('quick-bar').hidden = !state || arriving || rect.bottom > 0 || !!keyboard;
}
new IntersectionObserver(updateQuickBar).observe($('quick-start'));
window.addEventListener('scroll', updateQuickBar, { passive: true });
window.addEventListener('resize', updateQuickBar);
window.visualViewport?.addEventListener('resize', updateQuickBar);
function openTaskDetail(taskId) {
  if (busy || arriving) return;
  detailTaskId = taskId; renderTaskDetail(); $('task-detail').showModal();
}
function renderTaskDetail() {
  const task = state.tasks.find(t => t.id === detailTaskId);
  if (!task) { $('task-detail').close(); return; }
  $('detail-title').textContent = task.name;
  const content = $('detail-content'); content.replaceChildren();
  content.append(node('p', taskKindLabel(task.kind), 'muted'));
  if (task.kind === 'ongoing') {
    const { latest, count } = sessionContext(state.history, task.id);
    content.append(node('p', `已推进 ${count} 次${latest ? ' · 上次：' + ago(latest.at) : ' · 尚未开始'}`, 'muted'));
    for (const record of state.history.filter(r => r.type === 'progress' && r.taskId === task.id)) {
      const section = node('section', undefined, 'detail-session');
      section.append(node('small', new Date(record.at).toLocaleString('zh-CN') + (record.outcome === 'paused' ? ' · 暂停' : ' · 推进')));
      for (const [key, label] of [['goal', '小目标'], ['note', '做到哪里'], ['nextStep', '下一步']]) {
        if (record[key]) section.append(node('p', label + '：' + record[key], 'session-note'));
      }
      content.append(section);
    }
  }
  $('detail-edit').disabled = busy;
  $('detail-complete').hidden = task.kind !== 'ongoing';
  $('detail-complete').disabled = busy || state.active?.taskId === task.id;
}
$('detail-close').addEventListener('click', () => $('task-detail').close());
$('detail-edit').addEventListener('click', () => {
  const task = state.tasks.find(t => t.id === detailTaskId);
  if (task && !busy && !arriving) { $('task-detail').close(); openEditor('task', task); }
});
$('detail-complete').addEventListener('click', async () => {
  if (busy || arriving || !confirm('确认整件事情已经完成？此操作会归档任务，不额外开奖。')) return;
  if (await act({ type: 'completeTask', taskId: detailTaskId })) $('task-detail').close();
});
function render() {
  if (arriving) { $('finish').disabled = true; $('finish-session').disabled = true; $('pause-session').disabled = true; return; }
  $('balance').textContent = state.balance.toLocaleString('zh-CN');
  $('active-task').hidden = !state.active;
  renderQuickStart();
  updateQuickBar();
  $('task-title').textContent = state.active ? '现在正在做' : '现在，做一件小事';
  const ongoing = state.active?.kind === 'ongoing';
  const preparing = ongoing && state.active.status === 'preparing';
  $('task-status').textContent = preparing ? '准备这次推进' : state.active ? '进行中' : '准备开始';
  $('task-status').hidden = true;
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
    const title = node('strong', task.name);
    copy.append(title);
    if (task.kind === 'repeatable') {
      const repeat = node('span', ' ↻', 'repeat-mark');
      repeat.setAttribute('role', 'img'); repeat.setAttribute('aria-label', '可重复'); title.append(repeat);
    }
    if (task.kind === 'ongoing') {
      const { latest } = sessionContext(state.history, task.id);
      copy.append(node('p', latest ? (latest.nextStep ? '→ ' + latest.nextStep : '→ 接着上次的小目标') : '尚未开始', 'task-next'));
    }
    const actions = node('div', undefined, 'row-actions');
    const start = node('button', '▶', 'secondary task-play');
    start.setAttribute('aria-label', (task.kind === 'ongoing' && sessionContext(state.history, task.id).latest ? '继续：' : '开始：') + task.name);
    start.type = 'button'; start.disabled = busy || !!state.active;
    start.addEventListener('click', async () => {
      unlockSound();
      if (await act({ type: 'startTask', taskId: task.id })) {
        showStartedTask();
      }
    });
    const more = node('button', '•••', 'text-button task-more');
    more.type = 'button'; more.disabled = busy;
    more.setAttribute('aria-label', '详情与更多操作：' + task.name);
    more.addEventListener('click', () => openTaskDetail(task.id));
    actions.append(start, more);
    row.append(copy, actions); $('task-list').append(row);
  }
  $('reward-balance').textContent = state.balance + ' ✦ 可用';
  $('rewards').replaceChildren();
  if (!state.rewards.length) $('rewards').append(node('p', '还没有奖励。添一件你期待的小事吧。', 'empty'));
  for (const reward of state.rewards) {
    const affordable = state.balance >= reward.cost;
    const row = node('div', undefined, 'reward-row reward-card ' + (affordable ? 'can-redeem' : 'not-yet'));
    const copy = node('div', undefined, 'row-copy');
    copy.append(node('strong', reward.name), node('small', reward.cost + ' ✦'));
    const button = node('button', affordable ? '兑换 ✦' : '还差 ' + (reward.cost - state.balance) + ' ✦', 'secondary');
    button.setAttribute('aria-label', affordable ? '兑换：' + reward.name + '，花费 ' + reward.cost + ' 金币' : reward.name + '，还差 ' + (reward.cost - state.balance) + ' 金币');
    button.disabled = busy || state.balance < reward.cost;
    button.addEventListener('click', () => {
      pending = { type: 'redeem', id: reward.id, revision: reward.revision, requestId: uid() };
      $('redeem-description').textContent = `${reward.name} · ${reward.cost} 金币`;
      $('redeem-dialog').showModal(); $('cancel-redeem').focus();
    });
    const actions = node('div', undefined, 'row-actions');
    const edit = node('button', '•••', 'text-button');
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
  if ($('task-detail').open) renderTaskDetail();
}
async function refresh() { if (busy || arriving) return; try { state = await transaction(); render(); } catch (error) { message(error.message); } }
async function act(action) {
  if (busy || (arriving && !['finish','progress'].includes(action.type))) return false;
  busy = true; message(''); if (state) render(); $('confirm-redeem').disabled = true;
  try {
    state = await transaction(action); channel?.postMessage('changed');
    return true;
  } catch (error) {
    // 另一标签页可能已修改任务或奖励；失败后重新读取，下一次操作使用最新版本。
    try { state = await transaction(); } catch { /* 保留原始错误。 */ }
    message(error.message); return false;
  }
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
  arriving = true; updateQuickBar();
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
$('wallet-rewards').addEventListener('click', () => {
  $('reward-title').focus({ preventScroll: true });
  $('reward-section').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
$('confirm-redeem').addEventListener('click', async () => {
  if (!pending || busy || arriving) return;
  unlockSound();
  const request = pending;
  const success = await act(request);
  $('redeem-dialog').close();
  if (!success) return;
  void playSound('redeem');
  const record = state.history.find(r => r.id === request.requestId);
  const before = state.balance - record.coins;
  const feedback = $('redeem-result');
  feedback.replaceChildren(node('span', '✦ 兑换成功', 'redeem-heading'), node('strong', record.name),
    node('p', record.coins + ' ✦ · 余额 ' + before + ' → ' + state.balance + ' ✦', 'redeem-cost'), node('p', '去享受你的奖励吧。'));
  feedback.hidden = false;
  feedback.classList.remove('redeemed'); void feedback.offsetWidth; feedback.classList.add('redeemed');
  $('balance').classList.remove('spent'); void $('balance').offsetWidth; $('balance').classList.add('spent');
  feedback.focus({ preventScroll: true });
  feedback.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
$('more').addEventListener('click', () => { limit += 10; render(); });
for (const r of REWARDS) { const el = node('div', undefined, 'odds-list-item'); el.append(node('strong', `${r.coins} 金币`), node('div', `${r.weight}%`)); $('odds-list').append(el); }
channel?.addEventListener('message', refresh); window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
await refresh();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => { $('offline-status').textContent = '离线已就绪 · 可通过浏览器菜单添加到主屏幕'; }).catch(() => { $('offline-status').textContent = '离线缓存未就绪，请联网刷新后重试'; });
} else { $('offline-status').textContent = '当前地址不支持离线安装；请使用 HTTPS 或本机 localhost'; }
