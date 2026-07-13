#!/bin/bash
# Deploy app/ to GitHub Pages (public). Run deliberately — this publishes.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_NAME="${1:-msc-app}"

if ! gh repo view "$REPO_NAME" >/dev/null 2>&1; then
  echo "Creating public repo $REPO_NAME..."
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
fi

# Publish app/ as the gh-pages branch
git subtree split --prefix app -b gh-pages-tmp
git push -f origin gh-pages-tmp:gh-pages
git branch -D gh-pages-tmp

gh api "repos/{owner}/$REPO_NAME/pages" -X POST -f "source[branch]=gh-pages" -f "source[path]=/" 2>/dev/null || true
echo "Done. Pages URL (may take ~1 min):"
gh api "repos/{owner}/$REPO_NAME/pages" --jq .html_url
