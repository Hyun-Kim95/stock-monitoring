# Stitch 운영 표준 호출 순서 (SOP)

Cursor에 연결된 **Stitch MCP**(`user-stitch`)로 화면·디자인 시스템을 만들 때의 권장 호출 순서다.  
`.cursor/rules/60-delivery-gates.mdc`의 **Gate 1**(목업·화면 스펙) 산출물로 사용할 수 있다.

## 전제

- MCP 서버가 Cursor에서 활성화되어 있고, Stitch 계정/권한이 유효하다.
- 도구 이름·인자는 MCP 스키마(`mcps/user-stitch/tools/*.json`)를 우선한다.

---

## 표준 호출 순서

### 0) 시작

1. `list_projects` — 기존 프로젝트 확인
2. 없으면 `create_project` (`title` 지정)
3. `get_project` — `projects/{id}` 및 `screenInstances` 확인

### 1) 디자인 시스템 고정 (Gate 1 핵심)

4. `create_design_system`  
   - `projectId`, `designSystem.displayName`, `theme`(colorMode, headlineFont, bodyFont, roundness, customColor 등)
5. **즉시** `update_design_system`  
   - MCP 설명에 따라 생성 직후 한 번 더 호출해 프로젝트에 반영하는 흐름을 권장한다.
6. `list_design_systems` — `assets/{asset_id}` 확인

### 2) 화면 생성

7. `generate_screen_from_text`  
   - `projectId`, `prompt`(아래 템플릿 참고), `deviceType`(`MOBILE` / `DESKTOP` 등), 필요 시 `modelId`
8. 생성 직후 `list_screens` 또는 `get_screen`으로 결과 확인

**주의:** 생성은 수 분 걸릴 수 있다. 스키마에 **재시도 금지** 안내가 있으면 따른다. 응답이 불완전하면 나중에 `get_screen`으로 다시 조회한다.

### 3) 변형·수정

9. 대안 탐색: `generate_variants` (`selectedScreenIds`, `variantOptions`)
10. 세부 수정: `edit_screens`
11. 스타일 통일: `apply_design_system`  
    - `assetId`, `projectId`, `selectedScreenInstances`는 `get_project`의 `screenInstances` 기준

### 4) 확정 및 개발 이관

12. `get_screen`으로 최종 `screenshot` / `htmlCode` / `figmaExport` 등 확인
13. PRD 또는 동등 문서에 아래를 남긴다.
    - `projectId`
    - 디자인 시스템 `assetId` (`assets/...`)
    - 확정한 화면 `screen` 리소스 이름 또는 ID
    - 최종 프롬프트·수정 요약

---

## 프롬프트 템플릿 (복붙용)

```text
목표: [화면 목적]
사용자: [타깃 사용자]
플랫폼: [web / mobile / desktop]
필수 상태: 기본, 로딩, 빈 데이터, 오류, 권한 제한
핵심 컴포넌트: [테이블, 필터, 페이지네이션, 폼 등]
스타일: [브랜드 톤], 다크모드 지원, 접근성 대비
제약: 디자인 시스템 토큰 준수, 과도한 장식 금지
```

---

## 작업마다 체크리스트

- [ ] `projectId` 확정
- [ ] 디자인 시스템 `assetId` 확정
- [ ] 상태 UI(기본·로딩·빈·오류·권한) 반영 여부
- [ ] 다크모드·반응형 요구 반영 여부
- [ ] 최종 화면 ID·프롬프트·변경 요약을 문서에 기록

---

## 전역 스타일(CSS)과의 관계

Stitch는 **화면·디자인 시스템의 근거**로 쓰고, 실제 코드베이스에는 보통 `globals.css`·`index.css`·프레임워크 전역 스타일 등 **별도 진입점**이 있다.  
둘 중 어느 것이 “최종 기준”인지 프로젝트에서 정하면 되며, 상세는 `.cursor/rules/50-index-css-contract.mdc`를 따른다.

---

## 관련 규칙·스킬

- 게이트: `.cursor/rules/60-delivery-gates.mdc`
- 전역 스타일·디자인 기준: `.cursor/rules/50-index-css-contract.mdc`
- 기획 정리: `.cursor/skills/plan-feature/SKILL.md`
- 디자인 일관성 에이전트: `.cursor/agents/design-system-agent.md`
