#!/usr/bin/env bash
set -euo pipefail

# Official release binaries, pinned by version and GitHub release SHA-256.
# https://github.com/getsentry/sentry-cli/releases/tag/3.8.0
case "$(uname -m)" in
  arm64)
    sentry_arch=arm64
    sentry_sha=1dda212b0e168b9c4dc48d7d3aa24c1c37de9c6edf786e6ae661236e529969cd
    ;;
  x86_64)
    sentry_arch=x86_64
    sentry_sha=279c795b15de7a76106d30b6611b7942b1a97323307327bafc18335f10384c4d
    ;;
  *) echo 'Unsupported runner architecture.' >&2; exit 1 ;;
esac
test -n "${RUNNER_TEMP:?RUNNER_TEMP is required}"
test -n "${GITHUB_ENV:?GITHUB_ENV is required}"
sentry_binary="$RUNNER_TEMP/sentry-cli"
curl --fail --silent --show-error --location --retry 3 \
  "https://github.com/getsentry/sentry-cli/releases/download/3.8.0/sentry-cli-Darwin-$sentry_arch" \
  --output "$sentry_binary"
printf '%s  %s\n' "$sentry_sha" "$sentry_binary" | shasum -a 256 --check --status
chmod 700 "$sentry_binary"
printf 'SENTRY_CLI_PATH=%s\n' "$sentry_binary" >> "$GITHUB_ENV"
"$sentry_binary" --version
