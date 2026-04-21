---
type: doc
project: stockMonitoring
doc_lane: requirements
updated_at: 2026-04-15T01:04:56
tags: [docs, vault-sync]
---
# Obsidian Local Automation (B + C + 활용 고도화)

이 문서는 GitHub 없이 로컬 Windows 환경에서 다음 흐름을 만드는 방법을 정리한다.

- B: 프로젝트 문서(`docs`)를 Obsidian 볼트로 동기화
- C: 커밋마다 저널 노트를 자동 생성
- 활용: 템플릿/Dataview/데일리 로그/백링크 기반 지식 탐색

기본 볼트 경로는 `D:\Obsidian\projects` 이다.

## 1) 필수 구성

프로젝트에 아래 폴더/파일이 있어야 한다.

- `scripts/obsidian/sync-docs.ps1`
- `scripts/obsidian/write-commit-journal.ps1`
- `.cursor/hooks.json`
- `.cursor/hooks/sync-docs-on-doc-change.ps1`
- `docs/obsidian/` (템플릿/대시보드 킷)

## 2) Obsidian 플러그인 설정

### Core plugins
- Daily notes: 켜기
- Templates: 켜기

### Community plugins
- Dataview: 필수
- Templater: 권장

권장 경로:
- 템플릿 폴더: `docs/obsidian/templates`
- 데일리 노트 폴더: `daily`

## 3) 문서 동기화 실행

프로젝트 루트에서:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\obsidian\sync-docs.ps1"
```

결과:
- `D:\Obsidian\projects\<slug>\docs\` 로 복제
- `D:\Obsidian\projects\<slug>\docs\<stem>.md` 프로젝트 허브 자동 생성(`<stem>` = `hubFileStem` > 살균된 `displayName` > `<slug>-docs-hub`; 예전 `_project-doc-index.md`는 새 스템과 다를 때 제거)
- 기본 동기화 모드는 `safe`이며, Vault 대상에만 있는 파일은 삭제하지 않는다.

자동 생성되는 프로젝트 인덱스는 아래 frontmatter를 가진다.
- `type: project-doc`
- `hub: true`
- `project`
- `source_repo`
- `updated_at`
- `tags`
- `links`

여러 레포를 한 번에 동기화하려면:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\obsidian\sync-docs.ps1" -ConfigPath ".\_config\obsidian-repos.json"
```

동기화 모드:
- `safe`(기본): 재귀 복사만 수행, Vault 측 단독 파일은 유지
- `mirror`: 소스 기준 완전 미러링(대상 단독 파일 삭제 가능)
- 1회 실행 시 모드 지정: `-SyncMode mirror`
- 레포별 고정은 `.obsidian-ingest.json`의 `syncMode`(`safe|mirror`)로 설정

## 4) 커밋 저널 자동 생성

커밋 훅 설치:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\obsidian\install-hook.ps1" -TargetRepo "."
```

이후 커밋마다 `D:\Obsidian\projects\<slug>\journal\`에 노트가 생성된다.

커밋 저널 frontmatter:
- `type: commit-journal`
- `project`
- `source_repo`
- `updated_at`
- `tags`
- `links`

## 5) Cursor 에이전트 편집 시 자동 동기화

Cursor의 `afterFileEdit` 훅(파일 쓰기 이벤트, matcher: `Write|TabWrite`)이 `docs` 경로 또는 `.md` 변경을 감지하면 `sync-docs.ps1`를 호출한다.

운영 포인트:
- 훅은 fail-open으로 동작해서 개발 흐름을 막지 않는다.
- 경로 해석은 `$PSScriptRoot` 기준이다(작업 디렉터리 의존 제거).
- 문서 편집 자동 동기화는 기본 15초 쿨다운으로 과도한 반복 실행을 줄인다.

## 5.5) 새 프로젝트 최초 1회 자동 부트스트랩

`sessionStart` 훅이 아래 작업을 프로젝트마다 최초 1회 실행한다.

- `sync-docs.ps1` 1회 실행(실행 시 `.obsidian-ingest.json`이 없으면 생성·`slug` 보정 포함)
- Git 저장소인 경우 `install-hook.ps1`로 커밋 저널 훅 설치

설정 갱신 정책(구현: `scripts/obsidian/sync-docs.ps1`의 `Ensure-ObsidianIngestConfig`):

- 파일이 없거나 깨졌으면 기본 `vaultRoot`·`docsPaths`로 새로 쓴다.
- 파일이 있으면 `vaultRoot`·`docsPaths`는 유지한다.
- 기본적으로 `slug`는 Git 최상위 폴더명으로 보정한다(템플릿에 남은 잘못된 `slug` 방지).
- 예외: `.obsidian-ingest.json`에 `lockSlug: true`가 있으면 기존 `slug`를 유지한다.
- `syncMode`가 없으면 기본값 `safe`를 기록/사용한다.

부트스트랩이 이미 끝난 뒤에도 `.obsidian-ingest.json`만 없으면, 다음 Cursor 세션 시작 시 `bootstrap-obsidian-once.ps1`가 `sync-docs.ps1`만 한 번 더 돌려 복구한다.

재실행 방지 마커:

- `.cursor/state/obsidian-bootstrap.done`

레포에는 `.obsidian-ingest.json`을 올리지 않는 것을 권장한다(`.gitignore`). 예시는 `docs/obsidian/obsidian-ingest.example.json`을 본다.

관련 파일:
- `.cursor/hooks/bootstrap-obsidian-once.ps1`
- `.cursor/hooks.json` (`sessionStart` 훅 등록)

## 6) 템플릿/대시보드 사용법

### 템플릿
- 프로젝트 문서: `docs/obsidian/templates/project-doc-template.md`
- 데일리 로그: `docs/obsidian/templates/daily-log-template.md`

### 대시보드
- `docs/obsidian/dashboards/projects-overview.md`
- `docs/obsidian/dashboards/commit-journal-overview.md`
- `docs/obsidian/dashboards/daily-log-overview.md`

Dataview가 켜져 있으면 `type/project/updated_at` 기준으로 자동 집계된다.

## 6.5) 요구·QA·디자인 등 일반 문서에 공통 frontmatter 넣기

`docs/obsidian`을 제외한 `docs/requirements`, `docs/qa`, `docs/design`, `docs/decisions`, `docs/changelog`의 마크다운을 점검해 YAML frontmatter(`type: doc`, `project`, `doc_lane`, `updated_at`, `tags`)와 하단 `## Vault` 위키링크(허브·프로젝트 대시보드·**커밋 저널은 `commit-journal-overview`**) 정합성을 관리한다. `[[slug/journal]]` 형태는 쓰지 않는다(옵시디언이 `journal.md` 유령 노트를 만들기 쉬움).

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\obsidian\normalize-doc-frontmatter.ps1"
```

점검 전용(파일 미변경):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\obsidian\normalize-doc-frontmatter.ps1" -CheckOnly
```

기존 PRD/문서의 `project` 또는 Vault 링크 불일치 자동 보정:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\obsidian\normalize-doc-frontmatter.ps1" -FixMismatch
```

`project` 슬러그는 `.obsidian-ingest.json`의 `slug`가 있으면 그 값을, 없으면 Git 루트 폴더명을 쓴다. `lockSlug: true`면 자동 보정 중에도 기존 `slug`를 유지한다. **선택 필드 `displayName`·`hubFileStem`**은 허브 파일명·제목·`display_name`·커밋 저널·lane 문서의 Vault 링크에 반영된다(규칙: `scripts/obsidian/Resolve-HubIndexStem.ps1`). `syncMode`(`safe|mirror`)로 레포별 동기화 정책을 고정할 수 있다. Vault 링크 표시 텍스트는 Windows 콘솔 인코딩 호환을 위해 ASCII로 둔다.

운영 권장: 타 프로젝트 문서를 이관한 직후 `-CheckOnly`를 1회 실행하고, 불일치가 나오면 `-FixMismatch`를 실행해 그래프 연결을 프로젝트 슬러그 기준으로 정렬한다.

## 7) 문제 발생 시 점검 순서

1. 수동 동기화 명령 실행이 되는지 확인
2. `.cursor/hooks.json`이 새 프로젝트에 복사됐는지 확인
3. `.cursor/hooks/bootstrap-obsidian-once.ps1` 존재 확인
4. `.cursor/state/obsidian-bootstrap.done` 생성 여부 확인
5. `.cursor/hooks/sync-docs-on-doc-change.ps1` 존재 및 실행 권한 확인
6. 문서가 `docs` 또는 `.md` 변경으로 생성되는지 확인
7. Obsidian에서 Dataview 플러그인 활성화 확인
8. `.cursor/state/obsidian-hook-warnings.log` 경고 누적 여부 확인

## 8) 운영 메모

- 단방향 원칙: 레포 -> Obsidian
- 시크릿이 포함될 수 있는 원문 diff 전문은 저장하지 않는다.
- 프로젝트 허브는 `[[<project>/docs/<stem>]]`를 기준으로 링크한다(`<stem>`은 ingest 규칙과 동일).

## 9) 공통 납품 게이트 메모 (디자인 선택 이후)

아래 항목은 고객사 납품 흐름에서 디자인 선택 이후(3단계) 착수 전에 확인한다.

### 9.1 3단계 진입 전 체크리스트 문서화

- `docs/qa/stage3-entry-checklist.md` 또는 동등 문서를 작성한다.
- 최소 기록 항목:
  - 확정 PRD 문서 경로/버전(또는 최종 수정 시각)
  - 선택된 디자인 기준(자체 목업 또는 Stitch)과 근거 링크/ID
  - Gate 2 고정 대상(API 계약, 상태 UI: 기본/로딩/빈/오류/권한)
  - 미확정/리스크/오픈 이슈 및 담당자
- 체크리스트가 비어 있거나 승인 근거가 없으면 3단계를 시작하지 않는다.

### 9.2 라이트/다크 모드 전환 요구

- 디자인 단계에서 다크모드 지원만이 아니라 **라이트/다크 전환 기능**(토글/스위치)을 포함해야 한다.
- 전환 상태는 재방문 시에도 유지되도록 저장 전략(예: 로컬 저장소/사용자 설정)을 반영한다.

### 9.3 웹 필터 초기화 버튼 규칙

- 웹 화면에서 필터 검색 UI에 검색 버튼이 있는 경우, 검색 버튼 **오른쪽**에 초기화 버튼을 배치한다.
- 초기화 버튼은 현재 필터/검색 입력을 기본값으로 복원하고, 복원 결과가 즉시 반영되어야 한다.
## Vault

- [[stockMonitoring/docs/stockMonitoring-docs-hub|Hub]]
- [[stockMonitoring/docs/obsidian/dashboards/projects-overview|Dashboards]]
- [[stockMonitoring/docs/obsidian/dashboards/commit-journal-overview|Commit journals (Dataview)]]

