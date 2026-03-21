/** 외부 시세 WS 등 재연결 간격(ms). 시도 횟수는 0부터. */
export function nextReconnectDelayMs(attempt: number, opts?: { baseMs?: number; maxMs?: number }): number {
  const base = opts?.baseMs ?? 1000;
  const max = opts?.maxMs ?? 60_000;
  const exp = Math.min(max, base * 2 ** Math.min(attempt, 16));
  const jitter = Math.floor(Math.random() * 0.25 * exp);
  return exp + jitter;
}
