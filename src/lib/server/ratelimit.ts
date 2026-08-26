import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Configurable via environment variables — no redeploy needed to adjust.
//
// RATELIMIT_NORMAL_REQUESTS  — max requests in the normal window   (default: 5)
// RATELIMIT_NORMAL_WINDOW    — window duration string              (default: "5 s")
// RATELIMIT_SENSITIVE_REQUESTS — max requests in sensitive window  (default: 3)
// RATELIMIT_SENSITIVE_WINDOW   — window duration string            (default: "10 s")
//
// Valid window strings: "5 s", "1 m", "1 h", "1 d"  (number + space + unit)

const normalRequests  = parseInt(process.env.RATELIMIT_NORMAL_REQUESTS   ?? '5');
const normalWindow    =          process.env.RATELIMIT_NORMAL_WINDOW      ?? '5 s';
const sensitiveRequests = parseInt(process.env.RATELIMIT_SENSITIVE_REQUESTS ?? '3');
const sensitiveWindow   =          process.env.RATELIMIT_SENSITIVE_WINDOW   ?? '10 s';

// Normal endpoints: feed, search, notifications, etc.
export const normalRatelimit = new Ratelimit({
	redis: Redis.fromEnv(),
	limiter: Ratelimit.slidingWindow(normalRequests, normalWindow as any),
	analytics: false
});

// Sensitive endpoints: posting a lynt, uploading avatar, editing, bookmarking
export const sensitiveRatelimit = new Ratelimit({
	redis: Redis.fromEnv(),
	limiter: Ratelimit.slidingWindow(sensitiveRequests, sensitiveWindow as any),
	analytics: false
});
