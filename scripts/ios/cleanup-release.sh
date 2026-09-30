#!/usr/bin/env bash
set -euo pipefail

# Fastlane's ensure block handles normal failures. This also runs when GitHub
# cancels a job after credentials have been materialized.
test "${GITHUB_ACTIONS:-}" = true
test -n "${RUNNER_TEMP:?RUNNER_TEMP is required}"
test -n "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
signing_directory="$RUNNER_TEMP/fwb-signing"
if [[ -f "$signing_directory/release.keychain-db" ]]; then
  security delete-keychain "$signing_directory/release.keychain-db" >/dev/null 2>&1 || true
fi
if [[ -f "$signing_directory/app.mobileprovision" ]]; then
  profile_uuid="$(security cms -D -i "$signing_directory/app.mobileprovision" 2>/dev/null | plutil -extract UUID raw -o - - 2>/dev/null || true)"
  if [[ "$profile_uuid" =~ ^[0-9a-fA-F-]{36}$ ]]; then
    rm -f "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/$profile_uuid.mobileprovision"
    rm -f "$HOME/Library/MobileDevice/Provisioning Profiles/$profile_uuid.mobileprovision"
  fi
fi
rm -rf "$signing_directory" "$GITHUB_WORKSPACE/FWB-iOS-App/build"
