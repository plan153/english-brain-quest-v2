# Claude 리뷰·개발 이어가기용 브리프

> English Brain Quest v2 — Obsidian「제2의 영어뇌」연동 학습 PWA  
> 작성 기준: **v0.2.28** (2026-08-01) · 로컬 `/Users/mini/Projects/english-brain-quest-v2`  
> 라이브: https://plan153.github.io/english-brain-quest-v2/

이 문서는 Claude(또는 다른 에이전트)가 **계획·아키텍처·옵시디언 선순환**을 빠르게 파악하고, 리뷰 후 개발을 이어가기 위한 핸드오프입니다.

---

## 0. Claude에게 붙일 시작 프롬프트 (복사용)

```text
당신은 English Brain Quest v2 코드베이스를 리뷰하고 개발을 이어갑니다.

필수 읽기:
1. docs/CLAUDE-REVIEW-BRIEF.md (이 브리프)
2. docs/vault-schema.md (볼트 스키마·선순환)
3. docs/PLAN.md (마스터 플랜·Phase)
4. src/adapters/cloud-sync.ts, src/domain/vault-projection.ts, src/domain/vault-gap-import.ts
5. src/state/store.ts (saveGapClue / absorbVaultGaps / syncNow)
6. src/components/today/GapReasonCard.tsx, TodayScreen.tsx
7. src/components/brain/VaultSyncCard.tsx, BrainScreen.tsx

제품 북극성:
- 앱 = 출제·SRS·세션
- Obsidian 볼트 = 간극·성찰·다음 힌트의 원천 (제2의 영어뇌)
- 틀린 순간 AI/자동 해설을 주지 않는다. 학습자가 단서를 남기고 옵시디언에서 메운다.
- 메움·단서가 다시 앱 힌트·패턴 약점·출제에 반영되는 선순환이 목표다.

리뷰 산출물:
A) 현재 선순환이 실제로 닫히는지 (앱→볼트→앱) 끊긴 고리
B) 옵시디언을 더 쓰게 만드는 UX/데이터 기회
C) 아키텍처 리스크 (동기화, 모바일, 레거시 상태)
D) 다음 2주 구현 우선순위 Top 5 (영향×노력)

수정 시: 요청 범위만, 한국어 응답, 배포는 사용자가 말할 때만.
```

---

## 1. 제품 한 줄 / 북극성

**한 줄:** 말하기·타이핑으로 연습하고, 틀린 곳은 **스스로 단서→옵시디언에서 메움→다시 앱 힌트**로 쌓아 「내 영어뇌」를 키우는 게임형 PWA.

**역할 분담**

| 층 | 역할 |
|----|------|
| 앱 | 출제, 채점(관대 fuzzy), SRS, XP/콤보, 패턴 약점 큐 |
| Obsidian Vault | Gaps/Brain/Progress/Patterns Markdown = 성찰·그래프·다음 힌트 원천 |
| 학습자 | 틀린 직후 AI 해설 없이 「어디가 달랐는지」단서 작성 → 볼트에서 영어식 사고로 메움 |

---

## 2. 선순환 (반드시 이 그림으로 리뷰)

```text
Today 연습 (힌트 있을 수 있음)
  → 답변 맞음/다름
  → 다름: 정답 잠금 · 즉시 AI 해설 없음
  → 「내 단서」저장 (clued) → gapNotes + (가능하면) 즉시 vault sync
  → Obsidian Gaps/*.md 에서 ## 옵시디언 메움 작성
  → 앱「메움 완료」또는 볼트 import (reviewed) + 힌트 재료
  → 다음 연습: 내 단서 힌트 · 패턴 약점(slots) · 약점/복습 큐
       └──────────────── 선순환 ────────────────┘
```

**원칙 위반으로 보지 말 것**
- `buildGapReport` / `analyzeGapSlots`는 **출제·패턴 슬롯용 백그라운드**만. UI에 자동 해설로 올리면 안 됨 (v0.2.27에서 차단).
- 오답마다 Gap 자동 생성하지 않음 — `saveGapClue` 할 때만 생성 (노이즈 방지).

---

## 3. 아키텍처 맵

### 3.1 스택

- Vite + React 19 + TypeScript + Zustand
- PWA (SW, `version.json`, cache-bust → `__APP_VERSION__`)
- GitHub Pages: `.github/workflows/deploy-pages.yml`
- 테스트: `vitest` (`src/__tests__/domain.test.ts`)

### 3.2 레이어

```text
components/   Today | Brain | Dictionary | layout | ui
hooks/        useSpeech
state/        store.ts (단일 Zustand 스토어)
domain/       세션·SRS·보상·간극·볼트 투영·콘텐츠
adapters/     storage, cloud-sync, filesystem, indexeddb, speech, zip
interfaces/   StorageAdapter, SessionMode, ContentItem, …
data/         JSON 콘텐츠 (canon / packs)
```

### 3.3 옵시디언 동기화 아키텍처

```text
                    ┌─────────────────────┐
                    │   StorageAdapter    │
                    │  read/write/list    │
                    └─────────┬───────────┘
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     File System Access   IndexedDB      (향후 API)
     (데스크톱 Vault)     (모바일 가상볼트)
              │               │
              └───────┬───────┘
                      ▼
              cloud-sync.ts
         syncToVault / importVaultGaps
         exportVaultBundle (ZIP)
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
  vault-projection  vault-gap-   vault-library
  (앱→MD 투영)      import       (Library wiki)
                    (MD→앱)
```

**볼트 트리 (`Learners/<userId>/`, ZIP·Mac은 보통 `me`)**

```text
Learners/me/
  English Brain Index.md
  Learning/Brain.md
  Learning/Progress.md
  Gaps/_Index.md
  Gaps/gap_*.md
  Patterns/{subject,verb,noun,modifier,tense,agreement}.md
```

원문 링크: `Library/Patterns/기본동사 100.md` ↔ `quiz-verbs` 등 (`vault-library.ts`).

**Mac 보조:** `scripts/import-ebq-vault-zip.sh` + `com.plan153.ebq-vault-import.plist` (ZIP → 볼트 `_Inbox/EBQ`).

### 3.4 앱 내 간극 상태

| reasonStatus | 의미 |
|--------------|------|
| `draft` | 단서 전 (가급적 노트 미생성) |
| `clued` | 학습자 단서 저장 · 옵시디언 메움 대기 |
| `reviewed` | 메움 완료 · 힌트 재료 |
| `pending`/`confirmed`/`edited` | 구버전 호환 (sanitize·필터에서 흡수) |

핵심 API (`store.ts`):

- `saveGapClue` — 단서만으로 Gap 생성, 슬롯 계산(UI 비노출), `syncGapsSoon`
- `markGapReviewed` — reviewed + sync
- `getLearnerClueHint` / `learnerFacingClue` — 자동 리포트 문구 제외
- `absorbVaultGaps` — 볼트 Gaps → memories + gapNotes (단서·메움·슬롯)
- `syncNow` — Brain/Progress/Index/Gaps/Patterns 일괄 투영

UI:

- `GapClueCard` — ①스스로 찾기 → ②옵시디언 메움 → ③나중 힌트 + 저장 확인 메시지
- `VaultSyncCard` — 연결 / 지금 동기화 / 볼트→힌트·간극 선순환 / ZIP 보내기
- Today 오답 시 정답 듣기·한→영 잠금 (`answerLocked`)

---

## 4. 「옵시디언을 최대한 쓰게」하는 현재 연계 포인트

이미 있는 것:

1. **Gaps 노트** — 추측/정답/내 단서/옵시디언 메움/다음 연습/패턴 wiki
2. **Patterns 허브** — Dataview로 슬롯별 Gap 모음 → 앱「패턴 약점」과 대응
3. **Brain/Progress** — 숙련도·약점 거울 (출제 SoT는 앱)
4. **Library wiki** — 볼트 원문과 팩 문장 연결
5. **ZIP ↔ Mac launchd** — 모바일에서 쌓고 Mac 볼트로 합류
6. **Import** — `## 옵시디언 메움` 내용 → reviewed + 힌트 후보

의도적으로 Obsidian에 맡기는 일:

- 그래프·백링크·Dataview로 약점 지도 보기
- 긴 성찰·영어식 사고 정리 (앱은 한 줄 단서)
- Library 원문과 Gap 교차 읽기

---

## 5. 알려진 끊긴 고리 / 리뷰 시 집중할 부족분

리뷰어가 **증거 기반으로** 확인할 항목 (대화·코드에서 드러난 것):

| 우선 | 이슈 | 관련 |
|------|------|------|
| P0 | FSA 핸들 새로고침 후 재연결 필요 · 24h 자동 sync 미완 | `cloud-sync.ts` `restoreSyncSession` |
| P0 | 모바일↔Mac 경로가 ZIP/수동에 의존, 양방향 Local REST 없음 | VaultSyncCard, scripts/ |
| P1 | 옵시디언에서 `reasonStatus` 직접 수정해도 앱이 항상 감지하지 않음 — import/메움 완료에 의존 | `vault-gap-import.ts` |
| P1 | 슬롯 분석이 힌트 품질을 충분히 돕지 못함 (형용사·복수 등) — 단서는 학습자 몫이지만 패턴 큐 정확도 | `gap-reason.ts` |
| P1 | `docs/PLAN.md` Phase 4 문구가 구버전(오답마다 Gap 등)과 어긋남 — 스키마 문서가 진실에 더 가까움 | PLAN vs vault-schema |
| P2 | 볼트가 SoT가 아니라 **거울+성찰**; 앱 localStorage가 세션 SoT — 충돌/머지 정책 부재 | store + sync |
| P2 | README가 Vite 템플릿 그대로 — 온보딩 문서 약함 | README.md |

최근 수정으로 **완화된** 것 (회귀 주의):

- v0.2.26 — 단서→즉시 sync, import 선순환, 정답 잠금
- v0.2.27 — `have + adj + noun` 파싱, 자동 리포트≠단서
- v0.2.28 — `gapNotes` 구독 + 저장 확인 UI

---

## 6. 핵심 파일 체크리스트

| 파일 | 볼 것 |
|------|--------|
| `docs/vault-schema.md` | 선순환·스키마 진실원 |
| `docs/PLAN.md` | 장기 Phase (일부 stale) |
| `src/adapters/cloud-sync.ts` | 연결·sync·import·ZIP |
| `src/domain/vault-projection.ts` | MD 투영 |
| `src/domain/vault-gap-import.ts` | MD→앱 |
| `src/domain/gap-reason.ts` | 슬롯·자동 리포트 감지 |
| `src/domain/pattern-queue.ts` | 패턴 약점 출제 |
| `src/domain/srs-engine.ts` | 복습·약점 |
| `src/state/store.ts` | 상태·간극·동기화 오케스트레이션 |
| `src/components/today/*` | 학습 UX·단서·잠금 |
| `src/components/brain/*` | 영어뇌 UI·VaultSync |
| `scripts/*` | Mac ZIP import |
| `.github/workflows/deploy-pages.yml` | 배포·태그 |

---

## 7. 개발 이어갈 때 권장 순서 (초안)

1. **선순환 닫기** — import 품질, reviewed 자동 감지, sync 신뢰성(핸들·주기 sync)
2. **옵시디언 유인** — Gaps 템플릿·Dataview·앱에서「볼트에서 열기/다음에 메울 것」CTA
3. **출제 반영** — clued/reviewed·슬롯이 복습/패턴 큐에 더 선명히 반영
4. **문서 정합** — PLAN Phase 4/간극 철학을 vault-schema와 맞춤, README 교체
5. **모바일 경로** — ZIP UX 단순화 또는 클라우드 폴더 가이드

(리뷰 후 Top 5로 재정렬할 것.)

---

## 8. 작업 규칙 (이 레포)

- 응답·문서는 **한국어**, 코드/경로는 영어
- 비자명 변경은 짧은 계획 + 승인 후
- 요청 범위만 수정, 드라이브바이 리팩터 금지
- 커밋/배포는 사용자가 요청할 때만
- 버전 올리면 PWA cache-bust (`package.json` version → `__APP_VERSION__`)
- 일회용 스크립트는 `tmp/` only

---

## 9. 빠른 검증 명령

```bash
cd /Users/mini/Projects/english-brain-quest-v2
npm test
npm run build
# 로컬: npm run dev
# 라이브 버전: curl -sL https://plan153.github.io/english-brain-quest-v2/version.json
```

---

## 10. 리뷰 질문 예시 (Claude가 답해야 할 것)

1. 학습자가 옵시디언을 **안 열어도** 앱만으로 루프가 끝나는가, 열면 **얼마나 더** 이득인가?
2. `absorbVaultGaps`가 메움 텍스트를 힌트에 충분히 쓰는가?
3. Patterns MD와 Today「패턴 약점」이 같은 약지를 가리키는가?
4. 모바일 IndexedDB 볼트와 Mac 실제 Vault가 하나의 「영어뇌」로 합쳐지는 경로는?
5. 「제2의 영어뇌」를 위해 다음으로 볼트에 넣어야 할 노트 타입은? (예: 성공 표현, 발화 녹음 링크, 주간 회고)

끝.
