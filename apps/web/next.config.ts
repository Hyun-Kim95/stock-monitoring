import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** API·Prisma와 동일하게 루트 `.env` 한 곳에서 `NEXT_PUBLIC_*`까지 읽습니다. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local"), override: true });

const nextConfig: NextConfig = {
  transpilePackages: ["@stock-monitoring/shared"],
  /** 개발 모드 좌하단 N 인디케이터 숨김 */
  devIndicators: false,
};

export default nextConfig;
