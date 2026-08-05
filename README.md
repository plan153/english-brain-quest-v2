# English Brain Quest v2

옵시디언 볼트 기반 "제2의 영어뇌" 학습 앱. 한국어 문장을 보고 영어로 말하거나 타이핑하는
반복 훈련 + 게임형 보상(XP·콤보·레벨업·배지) + 오답 간극을 옵시디언 볼트에 쌓아 다음 힌트로
되돌려주는 선순환 구조.

라이브: https://plan153.github.io/english-brain-quest-v2/

## 핵심 원칙

- 오답 직후 AI 해설을 자동으로 보여주지 않는다 — 학습자가 스스로 간극을 찾고, 옵시디언에
  메운 뒤에야 다음 힌트로 돌아온다.
- 앱은 "출제·SRS"만 맡고, 옵시디언 볼트는 "간극·성찰·다음 힌트의 원천" 역할을 한다.

자세한 설계 배경은 [`docs/PLAN.md`](docs/PLAN.md), 볼트 폴더 구조는
[`docs/vault-schema.md`](docs/vault-schema.md) 참고.

## 개발

```bash
npm install
npm run dev       # 로컬 개발 서버
npm test          # vitest
npm run build     # tsc -b && vite build
npm run lint      # oxlint
```

## 음성 (TTS)

영어 문장은 **빌드타임에 미리 생성한 Azure Neural mp3**를 재생하고, 없으면 브라우저 내장
Web Speech API로 자동 폴백한다. 런타임 API 호출·키 노출이 없어 GitHub Pages 그대로
동작하고 오프라인에서도 재생된다.

새 문장을 추가한 뒤에는 Mac에서 한 번만 실행하면 된다 (이미 있는 문장은 건너뜀):

```bash
AZURE_SPEECH_KEY=<키> AZURE_SPEECH_REGION=koreacentral node scripts/generate-tts.mjs
git add public/audio && git commit -m "Regenerate TTS audio"
```

`public/audio/<해시>.mp3` + `manifest.json`이 생성된다. 파일명은 문장 내용 해시라 불변이며,
서비스워커가 별도 캐시(`ebq-audio-v1`)에 영구 보관해 앱 버전이 올라가도 재다운로드하지 않는다.
API 키는 절대 커밋하지 말 것.

## 배포

`master`/`main`에 push하면 GitHub Actions(`.github/workflows/deploy-pages.yml`)가 테스트 →
빌드 → GitHub Pages 배포까지 자동으로 처리한다. `package.json`의 `version`을 올리면 배포
버전 태그와 PWA 캐시 버전(`__APP_VERSION__`)이 함께 갱신된다.

## 스택

Vite + React 19 + TypeScript + Zustand. Web Speech API 기반 TTS/STT. File System Access API
(데스크톱)·IndexedDB(모바일)로 옵시디언 볼트 동기화.
