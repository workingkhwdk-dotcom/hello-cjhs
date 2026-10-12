#!/usr/bin/env bash
# 한 번에 배포: GitHub main 최신본을 배포용 폴더로 받아서 → 서버 함수 테스트 → firebase deploy.
#
#   처음(폴더가 없을 때):
#     git clone https://github.com/workingkhwdk-dotcom/hello-cjhs.git ~/hello-cjhs && bash ~/hello-cjhs/tools/deploy.sh
#   그다음부터:
#     bash ~/hello-cjhs/tools/deploy.sh            # 전체(사이트 + 서버 함수 + 보안 규칙)
#     bash ~/hello-cjhs/tools/deploy.sh hosting    # 사이트 화면만
#
# 배포용 폴더는 "main 그대로의 사본"으로 쓴다. 폴더에서 직접 고친 내용이 있으면 버릴지 먼저 묻는다.
# 필요한 것: git, Node.js 22, Firebase CLI(없으면 npx로 자동 실행), 처음 한 번 `firebase login`.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# 1단계: main 최신본으로 맞춘 뒤, 새로 받은 이 스크립트로 다시 시작한다(스크립트 자체가 바뀌었을 수 있으므로).
if [ "${CJHS_SYNCED:-}" != "1" ]; then
  echo "▶ GitHub main 최신본 받는 중…"
  git fetch origin main
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "이 폴더에 main과 다른 수정 사항이 있습니다:"
    git status --short --untracked-files=no
    read -r -p "버리고 main 최신본으로 맞출까요? [y/N] " ans
    case "$ans" in y|Y) ;; *) echo "중단했습니다. 아무것도 배포하지 않았습니다."; exit 1 ;; esac
  fi
  git checkout -q -f -B main origin/main
  echo "  → $(git log -1 --format='%h %s')"
  CJHS_SYNCED=1 exec bash "$DIR/tools/deploy.sh" "$@"
fi

# 2단계: 점검
command -v node >/dev/null || { echo "Node.js가 없습니다. https://nodejs.org 에서 22 버전을 설치해 주세요."; exit 1; }
if command -v firebase >/dev/null; then FIREBASE=(firebase); else FIREBASE=(npx -y firebase-tools@latest); fi

echo "▶ 서버 함수 테스트"
(cd functions && npm test --silent) || { echo "테스트 실패 — 배포하지 않았습니다."; exit 1; }

# 3단계: 배포 (hosting 배포 직전에 tools/bump-version.js가 자동으로 실행된다 — firebase.json predeploy)
case "${1:-all}" in
  hosting) ONLY=(--only hosting) ;;
  all)     ONLY=() ;;
  *)       ONLY=(--only "$1") ;;
esac
# 서버 함수를 올릴 때는 Firebase CLI가 함수 코드를 직접 읽어 보므로 functions/node_modules가 있어야 한다.
if [ "${1:-all}" = "all" ] || [[ "${1:-}" == *functions* ]]; then
  echo "▶ 서버 함수 패키지 설치(npm ci)"
  (cd functions && npm ci --no-audit --no-fund --loglevel=error)
fi

echo "▶ firebase deploy ${ONLY[*]:-(전체)}"
"${FIREBASE[@]}" deploy --project hello-cjhs ${ONLY[@]+"${ONLY[@]}"}

# predeploy가 고친 이미지 주소(?v=)는 다음 배포 때 다시 계산되므로 되돌려, 폴더를 main과 같게 둔다.
git checkout -q -- .

echo "✔ 배포 완료: https://hello-cjhs.web.app"
