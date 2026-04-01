import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

let clientPromise: Promise<RedisClient | null> | null = null;
let disabled = false;

function redisUrl(): string | null {
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

async function getClient(): Promise<RedisClient | null> {
  if (disabled) return null;
  if (clientPromise) return clientPromise;
  const url = redisUrl();
  if (!url) return null;
  clientPromise = (async () => {
    try {
      const client = createClient({ url });
      client.on("error", () => undefined);
      await client.connect();
      return client;
    } catch {
      disabled = true;
      return null;
    }
  })();
  return clientPromise;
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const c = await getClient();
  if (!c) return null;
  const raw = await c.get(fullKey(key));
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
  await c.set(fullKey(key), JSON.stringify(value), { PX: ttlMs });
}

export async function redisAcquireLock(key: string, ttlMs: number): Promise<boolean> {
  const c = await getClient();
  if (!c) return true;
  const ok = await c.set(fullKey(key), "1", { NX: true, PX: ttlMs });
  return ok === "OK";
}

export async function redisReleaseLock(key: string): Promise<void> {
  const c = await getClient();
  if (!c) return;
  await c.del(fullKey(key));
}

export async function redisWaitUntilUnlocked(key: string, timeoutMs: number, pollMs: number): Promise<void> {
  const c = await getClient();
  if (!c) return;
  const deadline = Date.now() + timeoutMs;
  const k = fullKey(key);
  while (Date.now() < deadline) {
    const n = await c.exists(k);
    if (!n) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export async function redisDeleteByPrefix(prefix: string): Promise<void> {
  const c = await getClient();
  if (!c) return;
  const p = fullKey(prefix);
  for await (const item of c.scanIterator({ MATCH: `${p}*`, COUNT: 100 })) {
    const keys = (Array.isArray(item) ? item : [item]).filter(
      (k): k is string => typeof k === "string" && k.length > 0,
    );
    if (keys.length === 0) continue;
    await c.del(keys);
  }
}

