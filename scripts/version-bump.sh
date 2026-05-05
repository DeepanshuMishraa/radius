#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: bun run version:bump <version>"
  echo "Example: bun run version:bump 1.0.3"
  exit 1
fi

# Validate semver-ish (at least digits.digits.digits)
if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+'; then
  echo "Error: version must be in format x.y.z (e.g., 1.0.3)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Update package.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

# Update electrobun.config.ts
sed -i '' "s/version: \".*\"/version: \"$VERSION\"/" electrobun.config.ts

echo "Bumped version to $VERSION"
echo "  package.json        → $(grep '"version"' package.json | head -1 | sed 's/.*: "\([^"]*\)".*/\1/')"
echo "  electrobun.config.ts → $(grep 'version:' electrobun.config.ts | head -1 | sed 's/.*: "\([^"]*\)".*/\1/')"
