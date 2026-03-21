import type { FastifyInstance } from "fastify";

/** GET/HEAD/OPTIONS 제외. IP별 윈도우 내 최대 요청 수. */
export function registerWriteRateLimit(
  app: FastifyInstance,
  opts?: { max?: number; windowMs?: number },
) {
  const max = opts?.max ?? 120;
  const windowMs = opts?.windowMs ?? 60_000;
  const buckets = new Map<string, { count: number; windowStart: number }>();

  app.addHook("preHandler", async (request, reply) => {
    const m = request.method;
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return;

    const key = request.ip;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now - b.windowStart >= windowMs) {
      b = { count: 0, windowStart: now };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      return reply.status(429).send({
        error: { code: "RATE_LIMIT", message: "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요." },
      });
    }
  });
}
