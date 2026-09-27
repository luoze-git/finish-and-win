import { REWARDS } from './config.js';
import { DEFAULT_REWARDS } from './defaults.js';
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
  next.schemaVersion = 2;
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
    case 'start':
      if (next.active) throw Error('先完成当前任务吧');
      next.tasks.push({ id, name: nameOf(action.name), repeatable: !!action.repeatable });
      next.active = { id, taskId: id, name: nameOf(action.name), repeatable: !!action.repeatable, startedAt: now }; break;
    case 'startTask': {
      if (next.active) throw Error('先完成当前任务吧');
      const task = next.tasks.find(t => t.id === action.taskId);
      if (!task) throw Error('任务不存在');
      next.active = { ...task, id, taskId: task.id, startedAt: now };
      break;
    }
    case 'editTask': {
      const task = next.tasks.find(t => t.id === action.taskId);
      if (!task) throw Error('任务已完成或不存在');
      task.name = nameOf(action.name); task.repeatable = !!action.repeatable;
      if (next.active?.taskId === task.id) {
        next.active.name = task.name; next.active.repeatable = task.repeatable;
      }
      break;
    }
    case 'finish': {
      if (!next.active || next.active.id !== action.id) throw Error('这个任务已经开奖，无需重复操作');
      const coins = draw(random);
      if (!Number.isSafeInteger(next.balance + coins)) throw Error('余额已达到上限');
      next.balance += coins;
      next.history.unshift({ id: next.active.id, taskId: next.active.taskId, type: 'finish', name: next.active.name, repeatable: next.active.repeatable, coins, at: now });
      if (!next.active.repeatable) next.tasks = next.tasks.filter(t => t.id !== next.active.taskId);
      next.active = null; break;
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
