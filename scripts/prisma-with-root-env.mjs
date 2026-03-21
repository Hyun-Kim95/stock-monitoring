/**
 * 모노레포 루트의 .env / .env.local을 읽은 뒤 packages/db 에서 Prisma CLI 실행.
 * (워크스페이스만 실행하면 DATABASE_URL을 못 찾는 문제 방지)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dbRoot = path.join(root, "packages", "db");

dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-with-root-env.mjs <prisma args...>");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error(
    "DATABASE_URL이 없습니다. 모노레포 루트에 .env 를 두고 예시는 .env.example 을 참고하세요.",
  );
  process.exit(1);
}

const r = spawnSync("npx", ["prisma", ...args], {
  cwd: dbRoot,
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(r.status ?? 1);
