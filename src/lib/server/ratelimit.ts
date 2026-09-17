import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const normalRequests  = parseInt(process.env.RATELIMIT_NORMAL_REQUESTS   ?? '5');
const normalWindow    =          process.env.RATELIMIT_NORMAL_WINDOW      ?? '5 s';
const sensitiveRequests = parseInt(process.env.RATELIMIT_SENSITIVE_REQUESTS ?? '3');
const sensitiveWindow   =          process.env.RATELIMIT_SENSITIVE_WINDOW   ?? '10 s';

export const normalRatelimit = new Ratelimit({
	redis: Redis.fromEnv(),
	limiter: Ratelimit.slidingWindow(normalRequests, normalWindow as any),
	analytics: false
});

export const sensitiveRatelimit = new Ratelimit({
	redis: Redis.fromEnv(),
	limiter: Ratelimit.slidingWindow(sensitiveRequests, sensitiveWindow as any),
	analytics: false
});

// /bang bsky — one Bluesky post per user per 30 minutes.
export const bangBskyRatelimit = new Ratelimit({
	redis: Redis.fromEnv(),
	limiter: Ratelimit.fixedWindow(1, '30 m'),
	analytics: false,
	prefix: 'ratelimit:bang:bsky'
});

export const bangCcRatelimit = new Ratelimit({
	redis: Redis.fromEnv(),
	limiter: Ratelimit.fixedWindow(1, '5 m'),
	analytics: false,
	prefix: 'ratelimit:bang:cc'
});