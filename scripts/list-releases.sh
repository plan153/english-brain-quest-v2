#!/usr/bin/env bash
# list-releases.sh — 롤백 가능한 버전 태그 목록
set -euo pipefail
cd "$(dirname "$0")/.."
echo "로컬 태그:"
git tag -l 'v*' | sort -V | tail -20
echo
echo "원격 태그 (origin):"
git ls-remote --tags origin 'v*' 2>/dev/null | sed 's/.*refs\/tags\///' | grep -v '\^{}' | sort -V | tail -20 || true
echo
echo "롤백: gh workflow run rollback-pages.yml -f version=v0.2.7"
echo "또는: ./scripts/rollback-pages.sh v0.2.7"
