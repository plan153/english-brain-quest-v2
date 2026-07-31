# Vault Markdown Schema (EBQ → Obsidian)

앱이 동기화할 때 만드는 제2영어뇌 구조입니다.
**앱 = 출제·SRS**, **볼트 = 간극·성찰·다음 힌트의 원천** (선순환).

## 피드백 루프 (선순환 목표)

**목표:** 힌트·답변 결과로 **간극을 스스로 만드는 과정**에서 영어식 사고로 전환하고,
그 메움을 옵시디언에 쌓아 **다음 학습의 힌트·간극 생성**에 다시 쓰인다.

```text
연습 (힌트 있을 수 있음)
  → 답변 결과 (맞음 / 다름)
  → 다름이면: 즉시 AI 해설 없음 · 「어디가 달랐는지」단서로 간극 생성(clued)
  → Obsidian Gaps에서 메움 · 영어식 사고 정리
  → 앱「메움 완료」(reviewed) + 볼트 반영
  → 다음 연습: 내 단서·메움이 힌트로 재등장
  → 같은 약점이면 간극이 다시 잡히거나, 메웠으면 약해짐
       └──────────── 선순환 ─────────────────────┘
```

**원칙**
- 틀린 순간마다 AI/자동 해설을 받지 않는다. 간극 **생성 과정** 자체가 학습이다.
- 도움이 된 단서·옵시디언 메움 → 나중 힌트 재료.
- 앱 = 출제·SRS · 볼트 = 간극·성찰·다음 힌트의 원천.

정답은 단서 저장 후(또는 명시적「그래도 정답 보기」)에만 공개합니다.

## 폴더

```text
Learners/<learnerId>/
  English Brain Index.md      # MOC
  Learning/
    Brain.md                  # 숙련도 · 약점 · 복습 대기
    Progress.md               # 수치 대시보드 (Progress.md 관례)
  Gaps/
    _Index.md                 # Gaps MOC + Dataview 쿼리
    gap_<expr>_<date>_<hash>.md
  Patterns/
    subject.md | verb.md | noun.md | modifier.md | tense.md | agreement.md
```

ZIP 내보내기·Mac import는 `Learners/me/` 경로를 사용합니다.

## Gap frontmatter

| 필드 | 설명 |
|------|------|
| `type` | `gap` |
| `expressionId` | 문장 ID |
| `en` / `ko` / `guess` | 정답 · 뜻 · 내 추측 |
| `match` | `wrong` \| `skipped` |
| `cueMode` | `blind` \| `after_listen` \| `after_reveal` |
| `inputMode` | `speak` \| `type` |
| `slots` | 문제 슬롯 배열 예: `[noun, modifier]` |
| `primarySlot` | Focus-on-Form 핵심 슬롯 (패턴 훈련 우선) |
| `packId` | 출처 팩 (`quiz-verbs` …) → Library wiki |
| `reasonStatus` | `draft` \| `clued` \| `reviewed` (+ 구버전 `pending`/`confirmed`/`edited`) |
| `learnerClue` | 학습자 단서 (다음 힌트) |
| `tags` | `ebq`, `gap`, `pattern/<slot>`, `focus/<slot>`, `pack/<id>`, `loop/...` |

본문: `## 내 추측` / `## 정답` / `## 내 단서` / `## 옵시디언 메움` / `## 다음 연습`.
옵시디언에서 `## 옵시디언 메움`에 내용을 쓰면 앱 import 시 `reviewed` + 힌트 재료가 됩니다.

## Patterns

- `primarySlot` Gap → Patterns 허브 「핵심으로 잡힌 Gap」 Dataview
- `slots` / 태그 `pattern/subject` 등 → 「관련 Gap」
- 앱 Today **패턴 약점**은 `primarySlot`에 가중치를 둠

### Library 원문 (Project_English 볼트)

앱 Today 팩과 **같은 문장**을 볼트에서 읽을 때 사용합니다. 출제는 앱 JSON, 읽기·링크는 볼트 MD.

| 볼트 경로 | 앱 팩 ID |
|-----------|----------|
| `Library/Patterns/기본동사 100.md` | `quiz-verbs` |
| `Library/Patterns/영어회화 100.md` | `conversation-100` |

매핑 코드: `src/domain/vault-library.ts`. Brain/Index/Gap/Pattern 동기화 시 wiki 링크로 노출됩니다.

## 동기화

`syncToVault` → Brain, Progress, Index, Gaps/_Index, Patterns/*, 세션 Gap 노트.

## 앱 패턴 약점 팩

`gapNotes.primarySlot` + `slots` → Today **패턴 약점** 팩 / Brain CTA.
슬롯 칩(주어·동사·목적어·수식·시제·3sg) 또는 자동(가장 많은 슬롯부터).
