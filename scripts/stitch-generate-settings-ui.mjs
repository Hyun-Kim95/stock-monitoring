#!/usr/bin/env node
/**
 * 안 B: @google/stitch-sdk 로 설정 UI 데스크톱 화면 1건 생성 + 결과 URL 기록.
 *
 * 필수: STITCH_API_KEY (루트 .env 권장)
 * 선택: STITCH_PROJECT_ID — 없으면 계정의 첫 번째 프로젝트 사용
 *
 *   npm run stitch:settings-ui
 *
 * 산출: docs/design/artifacts/stitch-output/run-summary.md
 */

import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
dotenv.config({ path: resolve(root, ".env") });
dotenv.config({ path: resolve(root, ".env.local"), override: true });
const outDir = join(root, "docs", "design", "artifacts", "stitch-output");

const PROMPT = [
  "Korean stock dashboard settings UI, desktop 1280px.",
  "Left sidebar: title Settings, email line, back link, nav items (Stocks, Themes, News rules, Runtime settings), logout.",
  "Main: header Stock settings, pill badge Active 12 / Max 100.",
  "Upper panel: stock search form and register fields.",
  "Lower panel: data table columns Status, Code, Name, Market, Actions.",
  "Clean finance SaaS style, light mode, high contrast, no decorative illustration.",
].join(" ");

async function main() {
  if (!process.env.STITCH_API_KEY?.trim()) {
    console.error("[stitch-generate-settings-ui] STITCH_API_KEY 가 필요합니다. 루트 .env 에 설정 후 실행하세요.");
    console.error("문서: https://github.com/google-labs-code/stitch-sdk#configuration");
    process.exitCode = 1;
    return;
  }

  const { stitch } = await import("@google/stitch-sdk");

  await mkdir(outDir, { recursive: true });

  let projectId = process.env.STITCH_PROJECT_ID?.trim();

  const projects = await stitch.projects();
  if (!projectId) {
    const first = projects?.[0];
    projectId = first?.projectId ?? first?.id;
  }

  if (!projectId) {
    console.error(
      "[stitch-generate-settings-ui] 사용 가능한 Stitch 프로젝트가 없습니다. Stitch 웹/UI에서 프로젝트를 만든 뒤 STITCH_PROJECT_ID 를 지정하거나, API로 생성 가능한지 계정을 확인하세요.",
    );
    process.exitCode = 1;
    return;
  }

  const project = stitch.project(String(projectId));
  const screen = await project.generate(PROMPT, "DESKTOP");
  const htmlUrl = await screen.getHtml();
  const imageUrl = await screen.getImage();

  const sid = screen.screenId ?? screen.id ?? "?";

  const summary = `# Stitch 생성 결과 (설정 UI · 안 B)

- 실행 시각(로컬): ${new Date().toISOString()}
- projectId: \`${projectId}\`
- screenId: \`${sid}\`
- HTML 다운로드 URL: ${htmlUrl}
- 스크린샷 URL: ${imageUrl}

프롬프트 요약:

\`\`\`text
${PROMPT}
\`\`\`

확정 시 docs/design 의 settings-ui-design-comparison.md 에 반영하세요.
`;

  await writeFile(join(outDir, "run-summary.md"), summary, "utf8");
  console.log("[stitch-generate-settings-ui] 기록됨:", join(outDir, "run-summary.md"));
}

main().catch((e) => {
  console.error("[stitch-generate-settings-ui]", e);
  process.exitCode = 1;
});
