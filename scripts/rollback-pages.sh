#!/usr/bin/env bash
# rollback-pages.sh <tag> — GitHub Pages를 지정 태그로 롤백
# 예: ./scripts/rollback-pages.sh v0.2.7
set -euo pipefail
TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "사용법: $0 v0.2.7" >&2
  echo "가능 버전:" >&2
  git tag -l 'v*' | sort -V | tail -15 >&2
  exit 1
fi
case "$TAG" in
  v*) ;;
  *) TAG="v$TAG" ;;
esac

cd "$(dirname "$0")/.."
if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "로컬에 $TAG 없음 — origin에서 fetch" >&2
  git fetch origin tag "$TAG" || git fetch origin --tags
fi
if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "태그 $TAG 를 찾을 수 없습니다." >&2
  exit 1
fi

echo "Pages 롤백 시작: $TAG"
gh workflow run rollback-pages.yml -f version="$TAG"
sleep 3
RUN_ID=$(gh run list --workflow=rollback-pages.yml --limit 1 --json databaseId -q '.[0].databaseId')
echo "Run ID: $RUN_ID"
gh run watch "$RUN_ID" --exit-status
echo "완료. 사이트 version.json / TopBar / fresh.html 로 확인하세요."
