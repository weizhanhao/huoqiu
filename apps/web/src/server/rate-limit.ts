/*
 * 尝试次数限制。
 *
 * 口令用 scrypt 存，单次猜测很贵——但接口这一侧此前不限次数，攻击者可以
 * 对着同一个邮箱一直猜下去，慢也只是慢，最终仍然能撞开。仓库的安全规则
 * 本来就要求所有端点限流，这里补上其中最要紧的两处：登录与注册。
 *
 * 用滑动窗口而不是固定窗口：固定窗口在边界处会放过两倍的量（窗口末尾打满
 * 一轮，跨过边界立刻再打满一轮）。
 *
 * 状态只在内存里。进程重启即清空，多实例之间也不共享——对当前这个单进程
 * 部署够用，但它不是分布式限流，别当成那个用。
 */

type Attempt = Readonly<{ at: number }>;

/*
 * 条目数上限。
 *
 * 键里含攻击者可控的内容（邮箱），不设上限的话，用海量不同邮箱打一遍就能
 * 把这个 Map 撑爆——限流器自己成了内存耗尽的入口。
 */
const MAX_TRACKED_KEYS = 10_000;

const buckets = new Map<string, readonly Attempt[]>();

const prune = (now: number, windowMs: number): void => {
  for (const [key, attempts] of buckets) {
    const alive = attempts.filter((attempt) => now - attempt.at < windowMs);
    if (alive.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, alive);
    }
  }
};

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  retryAfterSeconds: number;
}>;

/**
 * 记一次尝试并给出是否放行。
 *
 * 达到上限时不再记录本次尝试——否则被限住的人只要持续重试，窗口就永远滑不
 * 出去，一次触发等于永久锁死。
 */
export const consumeAttempt = (
  key: string,
  options: Readonly<{ limit: number; now: number; windowMs: number }>,
): RateLimitDecision => {
  const { limit, now, windowMs } = options;

  if (buckets.size > MAX_TRACKED_KEYS) {
    prune(now, windowMs);
    /*
     * 修剪后仍然超限，说明正在被大量不同键冲击：整体清空重来。
     * 宁可短暂放宽，也不能让限流器本身把进程拖垮。
     */
    if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();
  }

  const existing = buckets.get(key) ?? [];
  const alive = existing.filter((attempt) => now - attempt.at < windowMs);

  if (alive.length >= limit) {
    const oldest = alive[0]?.at ?? now;
    buckets.set(key, alive);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowMs - (now - oldest)) / 1000),
      ),
    };
  }

  buckets.set(key, [...alive, { at: now }]);
  return { allowed: true, retryAfterSeconds: 0 };
};

/** 登录成功后清掉计数，免得正常用户打错几次就被自己的历史拖住。 */
export const clearAttempts = (key: string): void => {
  buckets.delete(key);
};

/** 仅供测试：重置全部计数，避免用例之间互相污染。 */
export const resetAllAttempts = (): void => {
  buckets.clear();
};
