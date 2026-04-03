import { createClient } from "redis";
import { logWarn } from "./logger.js";

type RedisClient = ReturnType<typeof createClient>;

let clientPromise: Promise<RedisClient | null> | null = null;
/** 연결 실패·런타임 끊김 후 프로세스 동안 Redis 미사용(캐시·락 생략) */
let redisUnavailable = false;
let currentClient: RedisClient | null = null;
let redisUnavailableLogged = false;

function redisExplicitlyDisabled(): boolean {
  const v = process.env.REDIS_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function redisUrl(): string | null {
  if (redisExplicitlyDisabled()) return null;
  const raw = process.env.REDIS_URL?.trim();
  return raw ? raw : null;
}

function keyPrefix(): string {
  const raw = process.env.REDIS_KEY_PREFIX?.trim();
  return raw ? raw : "stock-monitoring:";
}

function fullKey(key: string): string {
  return `${keyPrefix()}${key}`;
}

/** Redis가 느리거나 네트워크가 멈춰도 HTTP(차트 등)가 무한 대기하지 않도록 */
const REDIS_COMMAND_TIMEOUT_MS = 8_000;

function isConnectionLikeError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException & { message?: string };
  const code = e?.code;
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ETIMEDOUT"
  ) {
    return true;
  }
  const msg = String(e?.message ?? err ?? "");
  return /connection|socket|closed|broken pipe|timed out/i.test(msg);
}

function markRedisUnavailable(reason: string, client?: RedisClient | null): void {
  const c = client ?? currentClient;
  currentClient = null;
  clientPromise = null;
  redisUnavailable = true;
  if (!redisUnavailableLogged) {
    logWarn("redis unavailable; continuing without Redis (no distributed cache/locks)", { reason });
    redisUnavailableLogged = true;
  }
  if (c) {
    try {
      c.disconnect();
    } catch {
      /* ignore */
    }
  }
}

function raceCommand<T>(p: Promise<T>, onTimeout: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(onTimeout), REDIS_COMMAND_TIMEOUT_MS);
    }),
  ]);
}

async function raceVoid(p: Promise<unknown>): Promise<void> {
  await Promise.race([
    p,
    new Promise<void>((resolve) => {
      setTimeout(resolve, REDIS_COMMAND_TIMEOUT_MS);
    }),
  ]);
}

async function getClient(): Promise<RedisClient | null> {
  if (redisExplicitlyDisabled()) return null;
  if (redisUnavailable) return null;
  if (clientPromise) return clientPromise;
  const url = redisUrl();
  if (!url) return null;
  clientPromise = (async () => {
    try {
      const client = createClient({
        url,
        socket: {
          connectTimeout: 10_000,
          socketTimeout: 25_000,
        },
      });
      client.on("error", (err) => {
        markRedisUnavailable(String(err), client);
      });
      await client.connect();
      currentClient = client;
      return client;
    } catch (e) {
      markRedisUnavailable(String(e));
      return null;
    }
  })();
  return clientPromise;
}

async function runGet<T>(c: RedisClient, fallback: T, op: () => Promise<T>): Promise<T> {
  try {
    return await raceCommand(op(), fallback);
  } catch (e) {
    if (isConnectionLikeError(e)) markRedisUnavailable(String(e), c);
    return fallback;
  }
}

async function runVoid(c: RedisClient, op: () => Promise<unknown>): Promise<void> {
  try {
    await raceVoid(op());
  } catch (e) {
    if (isConnectionLikeError(e)) markRedisUnavailable(String(e), c);
  }
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const c = await getClient();
  if (!c) return null;
  const raw = await runGet<string | null>(c, null, () => c.get(fullKey(key)));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJson(key: string, value: unknown, ttlMs: number): Promise<void> {
  const c = await getClient();
  if (!c) return;
  await runVoid(c, () => c.set(fullKey(key), JSON.stringify(value), { PX: ttlMs }));
}

export async function redisAcquireLock(key: string, ttlMs: number): Promise<boolean> {
  const c = await getClient();
  if (!c) return true;
  try {
    const ok = await raceCommand(c.set(fullKey(key), "1", { NX: true, PX: ttlMs }), null);
    return ok === "OK";
  } catch (e) {
    if (isConnectionLikeError(e)) markRedisUnavailable(String(e), c);
    return true;
  }
}

export async function redisReleaseLock(key: string): Promise<void> {
  const c = await getClient();
  if (!c) return;
  await runVoid(c, () => c.del(fullKey(key)));
}

export async function redisWaitUntilUnlocked(key: string, timeoutMs: number, pollMs: number): Promise<void> {
  const c = await getClient();
  if (!c) return;
  const deadline = Date.now() + timeoutMs;
  const k = fullKey(key);
  while (Date.now() < deadline) {
    const n = await runGet(c, 0, () => c.exists(k));
    if (!n) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export async function redisDeleteByPrefix(prefix: string): Promise<void> {
  const c = await getClient();
  if (!c) return;
  const p = fullKey(prefix);
  try {
    for await (const item of c.scanIterator({ MATCH: `${p}*`, COUNT: 100 })) {
      const keys = (Array.isArray(item) ? item : [item]).filter(
        (k): k is string => typeof k === "string" && k.length > 0,
      );
      if (keys.length === 0) continue;
      await runVoid(c, () => c.del(keys));
    }
  } catch (e) {
    if (isConnectionLikeError(e)) markRedisUnavailable(String(e), c);
  }
}
