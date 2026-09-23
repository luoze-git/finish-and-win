import { REWARDS } from './config.js';
export const initialState = () => ({ balance: 0, active: null, rewards: [], history: [] });
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
  const next = structuredClone(state);
  switch (action.type) {
    case 'start':
      if (next.active) throw Error('先完成当前任务吧');
      next.active = { id, name: nameOf(action.name), startedAt: now }; break;
    case 'finish': {
      if (!next.active || next.active.id !== action.id) throw Error('这个任务已经开奖，无需重复操作');
      const coins = draw(random);
      if (!Number.isSafeInteger(next.balance + coins)) throw Error('余额已达到上限');
      next.balance += coins;
      next.history.unshift({ id: next.active.id, type: 'finish', name: next.active.name, coins, at: now });
      next.active = null; break;
    }
    case 'add':
      if (!Number.isSafeInteger(action.cost) || action.cost <= 0) throw Error('金币数必须是正整数');
      next.rewards.push({ id, name: nameOf(action.name), cost: action.cost }); break;
    case 'redeem': {
      if (next.history.some(x => x.id === action.requestId)) throw Error('本次兑换已完成');
      if (!action.requestId) throw Error('兑换标识缺失');
      const reward = next.rewards.find(x => x.id === action.id);
      if (!reward) throw Error('奖励不存在');
      if (next.balance < reward.cost) throw Error('金币还不够，再完成一个任务吧');
      next.balance -= reward.cost;
      next.history.unshift({ id: action.requestId, type: 'redeem', name: reward.name, coins: -reward.cost, at: now }); break;
    }
    default: throw Error('未知操作');
  }
  return next;
}
