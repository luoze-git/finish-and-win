import { REWARDS } from './config.js';
import { DEFAULT_REWARDS } from './defaults.js';
export const SCHEMA_VERSION = 3;
const kindOf = (kind, repeatable) => {
  const value = kind ?? (repeatable ? 'repeatable' : 'oneoff');
  if (!['oneoff', 'repeatable', 'ongoing'].includes(value)) throw Error('任务类型无效');
  return value;
};
const contextText = (value = '', required = false) => {
  if (typeof value !== 'string' || value.trim().length > 500 || (required && !value.trim())) throw Error(required ? '请填写这次具体的小目标（最多 500 字）' : '推进内容最多 500 字');
  return value.trim();
};
export function sessionContext(history, taskId) {
  const sessions = history.filter(r => r.type === 'progress' && r.taskId === taskId);
  return { latest: sessions[0] ?? null, count: sessions.filter(r => r.outcome !== 'paused').length };
}
export function migrate(state) {
  const next = structuredClone(state);
  next.tasks ??= [];
  for (const r of next.rewards) { r.repeatable ??= true; r.revision ??= 0; }
  if (next.active && !next.active.taskId) {
    next.active.taskId = next.active.id;
    next.active.repeatable = false;
    next.tasks.push({ id: next.active.taskId, name: next.active.name, repeatable: false });
  }
  if (!next.defaultsVersion) {
    DEFAULT_REWARDS.forEach(([cost, name], i) => {
      if (!next.rewards.some(r => r.name === name && r.cost === cost))
        next.rewards.push({ id: 'default-reward-' + i, name, cost, repeatable: true, revision: 0 });
    });
    next.defaultsVersion = 1;
  }
  for (const task of next.tasks) {
    task.kind = kindOf(task.kind, task.repeatable);
    delete task.repeatable;
  }
  if (next.active) {
    next.active.kind = kindOf(next.active.kind ?? next.tasks.find(t => t.id === next.active.taskId)?.kind, next.active.repeatable);
    next.active.status ??= 'running';
    delete next.active.repeatable;
  }
  next.schemaVersion = SCHEMA_VERSION;
  return next;
}
export const initialState = () => migrate({ balance: 0, active: null, rewards: [], history: [] });
export function draw(random = Math.random) {
  if (REWARDS.reduce((sum, x) => sum + x.weight, 0) !== 100 || REWARDS.some(x => !Number.isSafeInteger(x.coins) || x.coins <= 0 || !Number.isFinite(x.weight) || x.weight <= 0)) throw Error('奖励配置无效');
  const value = random();
  if (!(value >= 0 && value < 1)) throw Error('随机数无效');
  let threshold = 0;
  for (const reward of REWARDS) { threshold += reward.weight; if (value * 100 < threshold) return reward.coins; }
}
const nameOf = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw Error('请输入 1–100 字的名称');
  return value.trim();
};
export function change(state, action, { id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, now = new Date().toISOString(), random = Math.random } = {}) {
  const next = migrate(state);
  switch (action.type) {
    case 'start': {
      if (next.active) throw Error('先完成当前任务吧');
      const kind = kindOf(action.kind, action.repeatable);
      const taskId = kind === 'ongoing' ? id + '-task' : id;
      next.tasks.push({ id: taskId, name: nameOf(action.name), kind });
      next.active = { id, taskId, name: nameOf(action.name), kind, status: kind === 'ongoing' ? 'preparing' : 'running', startedAt: kind === 'ongoing' ? null : now };
      break;
    }
    case 'startTask': {
      if (next.active) throw Error('先完成当前任务吧');
      const task = next.tasks.find(t => t.id === action.taskId);
      if (!task) throw Error('任务不存在');
      next.active = { ...task, id, taskId: task.id, status: task.kind === 'ongoing' ? 'preparing' : 'running', startedAt: task.kind === 'ongoing' ? null : now };
      break;
    }
    case 'editTask': {
      const task = next.tasks.find(t => t.id === action.taskId);
      if (!task) throw Error('任务已完成或不存在');
      const kind = kindOf(action.kind, action.repeatable);
      if (next.active?.taskId === task.id && task.kind !== kind && [task.kind, kind].includes('ongoing')) throw Error('请先保存这次执行，再修改为其他任务类型');
      task.name = nameOf(action.name); task.kind = kind;
      if (next.active?.taskId === task.id) {
        next.active.name = task.name; next.active.kind = task.kind;
      }
      break;
    }
    case 'finish': {
      if (!next.active || next.active.id !== action.id) throw Error('这个任务已经开奖，无需重复操作');
      if (next.active.kind === 'ongoing') throw Error('请使用完成这次推进');
      const coins = draw(random);
      if (!Number.isSafeInteger(next.balance + coins)) throw Error('余额已达到上限');
      next.balance += coins;
      next.history.unshift({ id: next.active.id, taskId: next.active.taskId, type: 'finish', name: next.active.name, kind: next.active.kind, coins, startedAt: next.active.startedAt, at: now });
      if (next.active.kind === 'oneoff') next.tasks = next.tasks.filter(t => t.id !== next.active.taskId);
      next.active = null; break;
    }
    case 'beginSession':
    case 'cancelSession':
    case 'progress':
    case 'pauseSession': {
      const active = next.active;
      if (!active || active.id !== action.id || active.kind !== 'ongoing') throw Error('这次推进已结束或发生变化，请刷新后重试');
      if (action.type === 'beginSession') {
        if (active.status !== 'preparing') throw Error('这次推进已经开始');
        active.goal = contextText(action.goal, true); active.status = 'running'; active.startedAt = now;
        break;
      }
      if (action.type === 'cancelSession') {
        if (active.status !== 'preparing') throw Error('请使用先停在这里保存上下文');
        next.active = null; break;
      }
      if (active.status !== 'running') throw Error('请先填写小目标并开始');
      const note = contextText(action.note), nextStep = contextText(action.nextStep);
      const coins = action.type === 'progress' ? draw(random) : 0;
      if (!Number.isSafeInteger(next.balance + coins)) throw Error('余额已达到上限');
      next.balance += coins;
      next.history.unshift({ id: active.id, taskId: active.taskId, type: 'progress',
        name: active.name, goal: active.goal, note, nextStep, coins,
        outcome: action.type === 'progress' ? 'advanced' : 'paused', startedAt: active.startedAt, at: now });
      next.active = null; break;
    }
    case 'completeTask': {
      const task = next.tasks.find(t => t.id === action.taskId);
      if (!task || task.kind !== 'ongoing') throw Error('这件事情已完成或不存在');
      if (next.active?.taskId === task.id) throw Error('请先保存这次推进，再完成整个任务');
      next.history.unshift({ id, taskId: task.id, type: 'complete', name: task.name, at: now });
      next.tasks = next.tasks.filter(t => t.id !== task.id);
      break;
    }
    case 'add':
      if (!Number.isSafeInteger(action.cost) || action.cost <= 0) throw Error('金币数必须是正整数');
      next.rewards.push({ id, name: nameOf(action.name), cost: action.cost, repeatable: action.repeatable ?? true, revision: 0 }); break;
    case 'editReward': {
      const reward = next.rewards.find(r => r.id === action.id);
      if (!reward) throw Error('奖励已兑换或删除');
      if (!Number.isSafeInteger(action.cost) || action.cost <= 0) throw Error('金币数必须是正整数');
      reward.name = nameOf(action.name); reward.cost = action.cost;
      reward.repeatable = !!action.repeatable; reward.revision++;
      break;
    }
    case 'deleteReward':
      if (!next.rewards.some(r => r.id === action.id)) throw Error('奖励已兑换或删除');
      next.rewards = next.rewards.filter(r => r.id !== action.id); break;
    case 'redeem': {
      if (next.history.some(x => x.id === action.requestId)) throw Error('本次兑换已完成');
      if (!action.requestId) throw Error('兑换标识缺失');
      const reward = next.rewards.find(x => x.id === action.id);
      if (!reward) throw Error('奖励不存在');
      if (action.revision !== undefined && action.revision !== reward.revision) throw Error('奖励已修改，请重新确认兑换');
      if (next.balance < reward.cost) throw Error('金币还不够，再完成一个任务吧');
      next.balance -= reward.cost;
      next.history.unshift({ id: action.requestId, rewardId: reward.id, type: 'redeem', name: reward.name, repeatable: reward.repeatable, coins: -reward.cost, at: now });
      if (!reward.repeatable) next.rewards = next.rewards.filter(r => r.id !== reward.id);
      break;
    }
    default: throw Error('未知操作');
  }
  return next;
}
