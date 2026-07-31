# Vault Markdown Schema (EBQ → Obsidian)

앱이 동기화할 때 만드는 제2영어뇌 구조입니다. **앱 = SRS·출제**, **볼트 = 거울·그래프·성찰**.

## 피드백 루프

```text
오답 → GapReport(핵심 슬롯 1개) → GapNote
  → sync → Gaps/*.md + Patterns/* + Dataview
  → 사용자 확인/수정(reason)
  → 앱 패턴 약점(primarySlot 우선) → 재연습
  → Library 원문 wiki로 의미 재입력
```

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
| `reasonStatus` | `pending` \| `confirmed` \| `edited` |
| `tags` | `ebq`, `gap`, `pattern/<slot>`, `focus/<slot>`, `pack/<id>` |

본문 섹션 `## 내 추측` / `## 정답` / `## 간극이 생긴 이유` / `## 다음 연습` 는 유지하세요.

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
