# English Brain Quest v2 — 마스터 플랜

> 옵시디언 볼트 기반 제2의 영어뇌 구축 게임형 학습 앱. 모바일 우선, 반복·숙달·성취 즐거움.

## 미션

- 영어 실력을 빠른 시간 안에 눈에 띄게 향상
- 반복 숙달 + 중독성 게임성 + 성취 보상
- 옵시디언 볼트와 연동해 학습 성과가 내 삶/지식망에 스며들게
- 다축 약점 분석 엔진으로 "듣고 바로 영어식으로 생각·발화" 강화

## 핵심 설계 원칙

1. **영어식 사고 안내** — 힌트는 정답 판정이 아니라 영어식 사고로 안내하는 길잡이
2. **초기 관대한 매칭** — 유치원생 수준까지 사소한 부정합 허용, 원래 표현 TTS로 안내 후 넘어감
3. **고용량 반복 + 게임 보상** — 하루 많은 문장 듣고/따라하고/반복, XP·콤보·레벨업·배지
4. **동적 난이도** — 10/80/10 도전 비율 (초보자에겐 쉬운 표현 어쩌다, 실력에 맞춰 빠른 맞춤)
5. **다축 스킬 추적** — 형태/기능/패턴/상황/뉘앙스/시간 6축 숙련도로 약점 가시화
6. **모바일 우선** — iOS Safari/Android Chrome에서 음성 인식·합성 안정 동작
7. **확장성 우선 설계** — 콘텐츠는 JSON으로 추가, 코드 변경 최소화 (인터페이스 기반)

## 아키텍처 인터페이스

- `StorageAdapter` — 클라우드 동기화 추상화 (Phase 4)
- `Evaluator` — 관대한 매칭 + 영어식 사고 안내
- `SessionMode` — 학습 세션 모드 인터페이스
- `ContentItem` — 콘텐츠 타입 (문장/대화/지문/단어/패턴)
- `CurriculumPack` — 커리큘럼 팩 + `GrammarUnitPack` (그래머인유즈 확장)
- `SpeechAdapter` — TTS/STT 추상화 (`createRecognition` 노출로 Safari/iOS 제스처 대응)
- `SpeechResult` — 음성 결과 + `audioBlob`(향후 발음 분석용)

## Phase 로드맵

### Phase 1 — MVP 기반 (완료)
- [x] Vite + React + TypeScript 스캐폴드
- [x] 3탭 UI ("Today" / "My English Brain" / "Dictionary")
- [x] 음성 어댑터 + useSpeech 훅
- [x] Zustand 글로벌 스토어
- [x] 디자인 토큰 + 글로벌 CSS
- [x] 오늘 화면: 듣기/말하기/피드백/힌트

### Phase 1b — 필수 콘텐츠 이관 (완료)
- [x] canon 데이터 (verbs, nouns, patterns, qa-matrices, learning-paths)
- [x] 표현 starter pack
- [x] 코로케이션 50개 + 구동사 50개

### Phase 1c — 확장형 아키텍처 (완료)
- [x] `data/canon/grammar/units/` 폴더 구조
- [x] `content-loader.ts` 동적 로딩 + 캐싱
- [x] `GrammarUnitPack` 인터페이스
- [x] 샘플 그래머 유닛 2개

### Phase 1d — 음성 안정화 (옵션 A 적용, 완료)
- [x] `useSpeech.startListening()` 동기화 → Safari/iOS 제스처 유지
- [x] `naturalVoiceScore` 이관 (Google US English / Samantha / Aria / Premium 우선)
- [x] TTS `cancel()` → `resume()` → `speak()` + 60ms 재시도
- [x] STT 시작 전 `stopSynthesis()`로 TTS-인식 충돌 회피
- [x] `createRecognition()` 노출로 제스처 안에서 동기 `start()`

### Phase 2 — 게임성 (완료)
- [x] `session-engine.ts` (50문장 세션, `SessionMode` 인터페이스 기반)
- [x] `difficulty-mixer.ts` (10/80/10 동적 분배 + 다축 스킬 모델)
- [x] `reward-engine.ts` (XP/콤보/레벨업/배지)
- [x] `FeedbackBar` / `SessionComplete` UI
- [x] `fuzzy-match.ts` 실제 연동 (MVP 임시 매칭 → 교체)
- [x] `store.ts` 세션/보상 상태 통합
- [x] `BrainScreen` 실데이터 연동 (레벨/스킬/배지)

### Phase 3 — 콘텐츠 확장 (완료)
- [x] 그래머인유즈 유닛 추가 (2개 → 10개)
- [x] 코로케이션 50 → 100개 확장
- [x] 프레절 동사 50 → 100개+ 확장
- [x] content-loader: 팩별 ContentItem[] 변환 API
- [x] TodayScreen 학습 팩 선택 UI
- [ ] Small Talk 팩 추가 (Phase 6으로 이관)
- [ ] OPIc 기본 표현 팩 추가 (Phase 6으로 이관)
- [ ] 비교급/가정법/절과구/시간표현/완곡표현/필러/조동사 뉘앙스 팩 (그래머 유닛으로 일부 반영)

### Phase 4 — 클라우드 동기화 (완료)
- [x] `cloud-sync.ts` (`StorageAdapter` 인터페이스)
- [x] File System Access API (데스크톱) + IndexedDB 폴백 (모바일)
- [x] `Brain.md` / `Progress.md` / `Gaps/` / `Patterns/` 폴더 구조 (`vault-projection.ts`, `docs/vault-schema.md`)
- [x] Gap 슬롯·이유 확인 + 말하기/타이핑 입력 (`gap-reason.ts`, TodayScreen)
- [x] `getUserId()` 추상화 (향후 로그인 대비) — `adapters/storage.ts`
- [x] BrainScreen `VaultSyncCard` UI (연결/동기화/다운로드)
- [x] 세션 종료 시 자동 Vault 투영 + 오답 Gap 노트
- [x] 단서(`learnerClue`)와 옵시디언 메움(`vaultFill`) 분리 저장 — 쓰기 시점 merge로 메움 보존 (`mergeGapForVaultWrite`)
- [x] FSA 디렉터리 핸들 영속화 + `queryPermission` 기반 무제스처 재연결 (`restoreSyncSession`)
- [x] sync 순서 수정(import → write) + 24h 주기 자동 동기화 (`bootstrapSync`)
- [x] 모바일 ZIP 내보내기에 `Gaps/*.md` 포함 + Mac import 스크립트 자동 배치
- [x] 옵시디언 딥링크(`obsidian://`) — GapClueCard「볼트에서 열기」 버튼
- [x] 「옵시디언 메움」 구조화 placeholder(왜 달랐나/다시 조립/내 문장 3개)
- [x] 학습자 칩 선택 vs 배경 슬롯 분석 불일치 — 다음 날 힌트에 참고 노출(즉각 해설 금지 원칙 유지)
- [ ] 기존 `obsidian-sync.js` 1,048줄 완전 대체는 v2 신규 구현으로 충분 (Local REST 양방향은 이후)

### Phase 5 — 사전 + 마무리 (완료)
- [x] `DictionaryScreen` (동사 그리드/표현/코로케이션/구동사 + 검색)
- [x] PWA 매니페스트 + 서비스 워커
- [x] 테스트 6종 (vitest: session / mixer / reward / vault / fuzzy / gapId)
- [x] GitHub Pages 배포 설정 (Actions workflow + `VITE_BASE`)
- [x] `difficulty-mixer` leftover 아이템 누락 버그 수정

### Phase 6 — 커리큘럼 확장 + 복습(SRS)
- [x] `srs-engine` — 복습 빈도(빡셈/보통/여유) + 「내 문장」 자동/수동 편입
- [x] Today **복습** 팩 + Brain 복습 대기/빈도 UI
- [x] 문장별 시도·정답률 표시 (today log)
- [x] 코로케이션 105 → 300개 (동사 41종으로 분포 균형화)
- [x] **빌드타임 TTS 사전 생성 (Azure Neural)** — `scripts/generate-tts.mjs` →
      `public/audio/<해시>.mp3`, 런타임 API 0·오프라인 재생·Web Speech 자동 폴백.
      1,534문장 ≈ 1회 $0.9 / 약 22MB. 옵션 B의 TTS 조각만 백엔드 없이 선취한 형태.
- [x] **브라우저 내장 Whisper STT (`whisper-tiny.en`) 구현 → 실사용 테스트 후 롤백** —
      `src/adapters/whisper-recognition.ts` + `stt-worker.ts`(Web Worker) + `audio-resample.ts`.
      `SpeechRecognitionLike` 계약을 그대로 구현해 `useSpeech.ts`는 무변경으로 통합 성공.
      다만 실제 브라우저 테스트에서 두 가지 문제 확인: (1) 녹음-후-일괄인식 구조라 무음
      자동종료가 없어 최대 청취시간(7~8초)까지 매번 대기, (2) 인식 정확도가 Web Speech보다
      떨어짐(오인식 확인). 추론 자체는 WebGPU로 빠름(1초 내외)이라 병목은 속도가 아니라
      녹음 UX+정확도. `speech.ts`의 `WHISPER_STT_ENABLED = false`로 기본 비활성화,
      코드는 보존 — VAD(무음 트리밍)나 base.en 이상 모델로 재도전 여지는 남김.
      기본 STT는 다시 Web Speech API.
- [x] **동사 노출 빈도 조절 (have/get/take 우선)** — `difficulty-mixer.ts`의
      `mixDifficulty`에 `priorityVerbs`/`priorityWeight` 옵션 추가. 가중 셔플
      (Efraimidis-Spirakis 방식)로 다른 동사를 배제하지 않고 노출 확률만 높임.
      코로케이션 + 기본동사 100 둘 다 적용. 기본동사 100은 이 작업을 계기로 Day
      순차 진행 → 셔플+가중치 방식으로 전환(`store.ts`). 영어회화 100은 Day 순서 유지.
      "be"는 두 팩 모두 verb+명사/particle 패턴이라 해당 항목이 없어 대상 제외.
- [ ] Stage 4-12 커리큘럼 팩 추가
- [ ] 구동사 102개 → 300개 이상
- [ ] 그래머인유즈 145단원까지 점진적 추가
- [ ] 비교급/가정법/절과구/시간표현/완곡표현/필러/조동사 뉘앙스

### Phase 7 — 확장성 구현체 (이후 별도)
- [ ] 추가 `SessionMode` 구현체 (스몰토크, OPIc, 라이팅)
- [ ] AI 피드백 통합
- [ ] 고급 발음 분석 (음소 단위)
- [ ] 다국어 확장

## 음성 처리 — 추후 고려 옵션

현재 **옵션 A**(원래 앱 기법: Web Speech API + 음성 선택 로직)를 적용 완료.
추후 품질/오프라인 요구사항에 따라 아래 옵션 점진적 도입 검토.

### 옵션 B — Cloud TTS + Whisper API (백엔드 추가, 저비용)

**목표**: TTS 품질 비약 향상, STT 정확도 향상. 백엔드 프록시 1개 추가.

| 영역 | 기술 | 비용 | 메모 |
|---|---|---|---|
| TTS | OpenAI `gpt-4o-mini-tts` 또는 `tts-1` | $0.015/1k chars | SSML 불가지만 자연음성. 캐싱 필수 |
| TTS | MS Edge TTS (Aria/Guy) | 무료 | 비공식 엔드포인트, 안정성 주의 |
| STT | OpenAI Whisper API (`whisper-1` / `gpt-4o-mini-transcribe`) | $0.006/min | mp4(Safari)/webm(Chrome) 자동 감지 |

**구현 포인트**:
- `/api/tts`, `/api/transcribe` 백엔드 프록시 — API 키는 서버에만 보관
- 응답 캐싱: `hash(text+model+voice)` → IndexedDB (동일 문장 재생성 비용 0)
- Web Speech API는 오프라인 fallback 유지
- `SpeechAdapter` 인터페이스 그대로 → `useSpeech` 변경 최소
- Phase 4 클라우드 동기화 백엔드와 함께 자연스럽게 도입 추천

**사용자당 하루 예상 비용**: 50문장 × ~40 chars = 2k chars TTS + 50회 발화 × ~5s = 4분 STT ≈ **$0.03/일/사용자**

### 옵션 C — 로컬 오프라인 PWA (transformers.js + WebGPU)

**목표**: 완전 오프라인 PWA. 첫 다운로드 후 인터넷 불필요. 다운로드 비용 1회.

| 영역 | 기술 | 크기 | 메모 |
|---|---|---|---|
| TTS | transformers.js VITS / MMS-tts-eng | ~80MB | WebGPU 가속 시 자연스러움 |
| STT | transformers.js Whisper (`whisper-base.en`) / Moonshine | ~150MB | WebGPU 1-3초, Web Worker 필수 |
| 가속 | WebGPU (지원 브라우저) | — | 미지원 시 WASM fallback (느림) |

**구현 포인트**:
- Web Worker에서 ONNX Runtime Web 추론 → UI 블로킹 방지
- `MediaRecorder`로 오디오 캡처 → Worker 전달 → 텍스트 반환
- 모델 로딩 진행 표시 (모바일 첫 로드 30-60초)
- PWA 캐시로 모델 1회 다운로드 후 오프라인 구동
- `SpeechAdapter` 인터페이스 그대로 → 교체 가능

**트레이드오프**:
- 장점: 완전 오프라인, 0 비용, 프라이버시
- 단점: 첫 다운로드 큼(모바일 데이터 주의), WebGPU 미지원 기기 성능 저하, 구현 복잡도 높음

### 권장 도입 타이밍

```
현재 (완료) ─── Phase 2/3 ─── Phase 4 ──────────── Phase 5+ ────────
   옵션 A         게임성      클라우드 동기화     PWA 완성
                                │
                                └─ 옵션 B 백엔드 자연스럽게 추가 추천
                                              │
                                              └─ 옵션 C 오프라인 모드 별도 토글
```

### 의사결정 기준

| 상황 | 추천 |
|---|---|
| 현재 MVP 검증 중 | 옵션 A 유지 |
| 사용자 불만 "TTS 너무 기계음" | 옵션 B 도입 |
| 오프라인 사용 요청 / 백엔드 운영 부담 | 옵션 C 검토 |
| 정확도 최우선 (OPIc 대비 등) | 옵션 B (Whisper) |
| 프라이버시/모바일 데이터 절약 | 옵션 C |

### 옵션 B/C 도입 시 공통 설계

- `SpeechAdapter` 인터페이스 유지 → 어댑터 교체만으로 교체 가능
- `SpeechResult.audioBlob` 이미 정의 → 발음 분석용 오디오 캡처 대비
- `createRecognition` 패턴은 Cloud STT에서는 `MediaRecorder` 기반으로 교체 (제스처 안에서 `getUserMedia` 동기 호출 필요 — Safari/iOS 동일 제약)
- 오프라인 fallback 사슬: Cloud → Web Speech → 수동 입력 (transcriber 패턴 참고)

### Deep Research 인사이트 — 오픈소스 영어 학습 앱 사례 (2026-07)

Deep Path 조사(5 workers, Sonnet)에서 확인된 업계 표준 패턴:

| 영역 | 표준 패턴 | 출처 앱 |
|---|---|---|
| STT | **Whisper가 사실상 표준** (로컬 또는 Groq API 경유). Web Speech API는 "무설정 폴백" | ai-pronunciation-trainer, Discute |
| TTS | **3파전** — 무료 클라우드 `edge-tts` / 유료 Polly / 로컬 Kokoro-82M | TingJu, LibreLingo, Mimora |
| 발음 평가 | **Azure 발음 평가(음소 수준)** → Web Speech API(단어 일치만) → 미지원 안내 | english-trainer |
| 발음 분석 | Whisper + Epitran 음소 변환 + 레벤슈타인, 또는 wav2vec2 + DTW | Mimora |

**v2에 반영할 구체 인사이트**:

1. **빌드 타임 TTS 사전 생성** (LibreLingo 패턴)
   - 학습 콘텐츠는 정적이므로, 문장별 TTS 오디오를 빌드 타임에 미리 생성해 정적 파일로 서빙
   - 런타임 API 호출 0 → 비용/지연 제거, 오프라인 구동 가능
   - 신규 콘텐츠 추가 시에만 재생성
   - `data/canon/audio/<sentence-id>.mp3` 폴더 구조로 관리

2. **Groq Whisper API** (옵션 B 대안)
   - OpenAI Whisper보다 빠른 추론(Groq LPU), 비용 경쟁력
   - `gpt-4o-mini-transcribe` 대신 `whisper-large-v3` on Groq 검토

3. **Kokoro-82M 로컬 TTS** (옵션 C 대안)
   - transformers.js MMS-tts보다 가볍고 자연스러움 (~82M params)
   - WebGPU 가속 시 모바일에서도 실용적
   - 완전 오프라인 + 0 비용

4. **Azure Speech 발음 평가** (Phase 7 고급 발음 분석용)
   - 음소 단위 점수 + 피드백 (현재 v2는 단어 일치만)
   - Microsoft Azure Speech Pronunciation Assessment API
   - 비용: $0.006/평가 (free tier 1만 평가/월)

### 도입 우선순위 (업데이트)

```
Phase 1 (완료) ─── Phase 2/3 ─── Phase 4 ──────────── Phase 5 ──────────── Phase 7
   옵션 A          게임성      클라우드 동기화       PWA + 빌드타임 TTS    발음 평가
                                │                    │
                                └─ 옵션 B: Whisper   └─ 옵션 C: Kokoro 로컬
                                   (Groq 우선)           (오프라인 토글)
```

## 참고 출처

- [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
- [Web Speech API TTS 가이드 (NexTool)](https://nextool.app/blog/text-to-speech-web-api-guide.html)
- [iOS WebSpeech 안정화 팁 (lilting channel)](https://lilting.ch/en/articles/ios-webspeech-api-tips)
- [iOS Safari Web Speech 버그 (Apple Developer 포럼)](https://developer.apple.com/forums/thread/694847)
- [transformers.js v3 (WebGPU)](https://huggingface.co/blog/transformersjs-v3)
- [transformers.js Speech 예제 (DeepWiki)](https://deepwiki.com/huggingface/transformers.js-examples/3.4-speech-and-audio-applications)
- [OpenAI TTS-1 모델](https://developers.openai.com/api/docs/models/tts-1)
- [OpenAI TTS 가이드](https://developers.openai.com/api/docs/guides/text-to-speech)
- [STT API JS 가이드 (2026)](https://www.tryspeakeasy.io/blog/speech-to-text-api-javascript)

## 프로젝트 상태

- 마지막 업데이트: 2026-08-03
- 현재 Phase: **Phase 6 진행 중** (Phase 4/5 완료, 볼트 동기화 선순환 보강 중)
- 음성 처리: TTS는 **옵션 B 일부**(빌드타임 Azure Neural mp3) 적용 완료, 백엔드 없이 GitHub Pages
  정적 호스팅 유지. STT는 **옵션 C(브라우저 내장 Whisper tiny.en) 구현 후 실사용 테스트에서
  롤백** — 녹음 UX(무음 자동종료 없음)와 정확도 문제로 기본 Web Speech API 유지, Whisper 코드는
  비활성화 상태로 보존(`WHISPER_STT_ENABLED`). 발음 평가(음소 수준)는 미도입.
- 배포: GitHub Pages Actions (`.github/workflows/deploy-pages.yml`) — repo Settings → Pages → Source: GitHub Actions 필요
- 테스트: `npm test` (55 passed) · 빌드: `npm run build`

## 핵심 교훈 (Lessons Learned)

> Phase별 구현 중 마주친 함정과 해결. 동일 실수 반복 방지용 기록.

### L1. React + Web Speech API: `onerror` 후 `onend` 미발생 함정

**현상**: 인식 실패 시 버튼이 영구 disabled. "말하기 안됨" 증상이 세션 중 반복.

**원인**: Web Speech API의 `SpeechRecognition.onerror` 후 `onend`가 **안 불리는 브라우저가 있음** (Chrome 데스크탑에서 마이크 권한 애매/`no-speech`/`audio-capture`/`network` 에러 시 자주 발생). React `useSpeech`에서 `listening` state가 `true`로 영구 고정 → 버튼 `disabled={speech.listening}` 조건으로 영구 클릭 불가.

**원래 앱(index.html)은 왜 문제 없었나**: DOM 직접 조작이라 state 기반 버튼 disabled 제어가 없었음. React 마이그레이션에서 잠재해 있던 버그.

**해결**: `recognizer.onerror`에서 반드시 `setListening(false)` + `recognizerRef.current = null` 호출. `onend`에만 의존하지 말 것.

```typescript
recognizer.onerror = (event) => {
  setError(...);
  setListening(false);          // 필수
  recognizerRef.current = null; // 필수
};
```

**교훈**: DOM 기반 코드를 React로 마이그레이션할 때, 원래 앱에 없던 state 기반 UI 제어를 도입하면 새로운 실패 모드가 생긴다. 이벤트 핸들러의 모든 종료 경로(onerror, onend, abort)에서 state를 명시적으로 정리해야 한다.

### L2. Chrome localhost 마이크 권한: `[code: network]` 함정

**현상**: `http://localhost:5173/`에서 STT 시 `음성 인식에 실패했어요 [code: network]`. `file://` 원래 앱은 정상 동작.

**원인**: Chrome이 `localhost`에 대한 마이크 권한을 이전 "차단" 설정으로 묵히 적용. 권한 다이얼로그 없이 자동 거부 → Google STT 서버 요청 차단 → `network` 에러. `file://`는 매번 다이얼로그가 떠 명시 허용됨.

**해결**: 주소창 좌측 🔒/🎤 아이콘 → 마이크 "방문할 때마다 허용" 또는 "항상 허용"으로 변경.

**교훈**: Web Speech API의 `[code: network]`는 진짜 네트워크 문제뿐 아니라 **권한 거부**로도 발생. `not-allowed`가 안 뜨고 `network`가 뜨면 마이크 권한 설정을 먼저 의심할 것. `file://` vs `http://localhost`는 Chrome 보안 컨텍스트가 달라 권한 정책이 다르게 적용됨.

### L3. Vite ESM에서 UMD/`import type` 함정

**현상**: `The requested module does not provide an export named 'Badge'` 런타임 에러. `tsc --noEmit`은 통과하지만 브라우저에서 폭발.

**원인**: TypeScript interface를 일반 `import { Badge }`로 사면, Vite는 런타임에 export를 찾으려 하지만 interface는 컴파일 후 사라지므로 없음. `tsc`는 타입 검사만 해서 통과하지만 런타임은 실패.

**해결**: interface/type은 반드시 `import type { ... }`로 분리. value(function/const)만 일반 import.

```typescript
// 잘못:
import { Badge, computeTrialReward } from './reward-engine';
// 올바름:
import { computeTrialReward } from './reward-engine';
import type { Badge } from './reward-engine';
```

**교훈**: Vite + TypeScript에서 `tsc` 통과 ≠ 런타임 동작. interface를 value처럼 import하면 런타임에만 폭발. `import type` 사용을 일관되게.