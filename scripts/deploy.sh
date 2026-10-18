#!/bin/sh
# Builds the app and publishes dist/ to the gh-pages branch, which GitHub Pages serves.
set -e
cd "$(dirname "$0")/.."
npm run build
REMOTE=$(git remote get-url origin)
REV=$(git rev-parse --short HEAD 2>/dev/null || echo dev)
NAME=$(git config user.name || echo Brew)
EMAIL=$(git config user.email || echo brew@localhost)
cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Deploy $REV"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Published $REV to gh-pages"
