export function logInfo(msg: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", msg, ...meta, t: new Date().toISOString() }));
}

export function logWarn(msg: string, meta?: Record<string, unknown>) {
  console.warn(JSON.stringify({ level: "warn", msg, ...meta, t: new Date().toISOString() }));
}

export function logError(msg: string, meta?: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", msg, ...meta, t: new Date().toISOString() }));
}
