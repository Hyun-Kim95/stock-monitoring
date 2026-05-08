/**
 * 로컬에서 `railway run -s Postgres` 실행 시 Postgres 서비스 변수를 주입받음.
 * Railway 내부 호스트는 로컬에서 접근 불가하므로 DATABASE_PUBLIC_URL로 마이그레이션한다.
 */
import { spawnSync } from "node:child_process";

const pub = process.env.DATABASE_PUBLIC_URL?.trim();
if (pub) process.env.DATABASE_URL = pub;

const r = spawnSync("npm", ["run", "db:migrate:deploy"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(r.status ?? 1);
