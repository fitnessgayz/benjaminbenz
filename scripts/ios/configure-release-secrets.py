#!/usr/bin/env python3
"""Provision iOS release repository settings without secrets in argv or files.

Default is a names-only, offline dry run. --apply performs interactive collection
and writes only after an approved-repository/admin/main-branch preflight.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import getpass
import io
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import unittest
from unittest import mock
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlsplit
import warnings

TEAM_ID = "5Q4FU299QH"
BUNDLE_ID = "com.benjaminbenz.fwbcoach"
RELEASE_REPOSITORY = "fitnessgayz/benjaminbenz"
REPO_ROOT = Path(__file__).resolve().parents[2]
MAX_SECRET_BYTES = 48 * 1024
APPLE_SECRETS = (
    "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY_P8_BASE64",
    "IOS_DISTRIBUTION_P12_BASE64", "IOS_DISTRIBUTION_P12_PASSWORD",
    "IOS_PROVISIONING_PROFILE_BASE64",
)
SENTRY_SECRETS = ("SENTRY_AUTH_TOKEN",)
SENTRY_VARIABLES = ("SENTRY_DSN", "SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_URL")


class SetupError(Exception):
    """Messages must contain labels only, never input values or command output."""


@dataclass(repr=False)
class Setting:
    kind: str
    name: str
    value: str = field(repr=False)

    def __repr__(self) -> str:
        return f"Setting({self.kind}, {self.name}, <redacted>)"


def names(component: str) -> list[tuple[str, str]]:
    result: list[tuple[str, str]] = []
    if component in ("all", "apple"):
        result.extend(("secret", name) for name in APPLE_SECRETS)
    if component in ("all", "sentry"):
        result.extend(("secret", name) for name in SENTRY_SECRETS)
        result.extend(("variable", name) for name in SENTRY_VARIABLES)
    return result


def validate_repo(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+", value):
        raise SetupError("Use --repo OWNER/REPO for a GitHub.com repository.")
    return value


def run_command(argv: list[str], stdin: bytes | None = None) -> bytes:
    child_env = os.environ.copy()
    for name in ("GH_DEBUG", "GH_TRACE", "GIT_TRACE", "GIT_CURL_VERBOSE"):
        child_env.pop(name, None)
    child_env.update(GH_PROMPT_DISABLED="1", GH_HOST="github.com", GH_PAGER="cat")
    try:
        result = subprocess.run(argv, input=stdin, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, check=False,
                                timeout=90, env=child_env)
    except (OSError, subprocess.TimeoutExpired):
        raise SetupError("A required local command could not complete; no command output is displayed.") from None
    if result.returncode:
        raise SetupError("A required command failed; its output was suppressed to protect credentials.")
    return result.stdout


def read_api(gh: str, endpoint: str) -> dict:
    try:
        result = json.loads(run_command([gh, "api", "--hostname", "github.com", endpoint]))
    except (ValueError, UnicodeError):
        raise SetupError("GitHub returned an unreadable preflight response.") from None
    if not isinstance(result, dict):
        raise SetupError("GitHub returned an unexpected preflight response.")
    return result


def required_environment() -> str | None:
    """Read the workflow's literal guard without needing a YAML dependency."""
    try:
        workflow = (REPO_ROOT / ".github/workflows/ios.yml").read_text()
    except (OSError, UnicodeError):
        raise SetupError("The checked-in iOS workflow could not be read.") from None
    declarations = re.findall(r"^[ \t]+environment:[ \t]*(.*)$", workflow, flags=re.MULTILINE)
    if not declarations:
        return None
    if len(declarations) != 1 or not re.fullmatch(r"(?:testflight|'testflight'|\"testflight\")[ \t]*(?:#.*)?", declarations[0]):
        raise SetupError("The workflow environment format changed; review the helper before provisioning.")
    return "testflight"


def preflight(gh: str, repo: str) -> str | None:
    repo = validate_repo(repo)
    if repo != RELEASE_REPOSITORY:
        raise SetupError("Coach release credentials must target " + RELEASE_REPOSITORY + ".")
    details = read_api(gh, f"repos/{repo}")
    if details.get("permissions", {}).get("admin") is not True:
        raise SetupError("The signed-in GitHub account needs repository admin permission.")
    if details.get("archived") or details.get("disabled"):
        raise SetupError("The target repository is archived or disabled.")
    try:
        read_api(gh, f"repos/{repo}/branches/main")
    except SetupError:
        raise SetupError("Create the main branch first, and check GitHub CLI access.") from None
    environment = required_environment()
    if environment:
        try:
            read_api(gh, f"repos/{repo}/environments/{environment}")
        except SetupError:
            raise SetupError("This workflow requires the testflight GitHub environment. Create it under repository Settings and verify your GitHub plan supports private-repository environments.") from None
    return environment


def hidden(label: str) -> str:
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            value = getpass.getpass(label + ": ")
        except getpass.GetPassWarning:
            raise SetupError("A local interactive terminal with hidden input is required.") from None
    if not value or "\x00" in value or "\n" in value or "\r" in value:
        raise SetupError(label + " must be nonempty and on one line.")
    return value


def checked_text(value: str, label: str, pattern: str) -> str:
    value = value.strip()
    if not re.fullmatch(pattern, value):
        raise SetupError(label + " has an unexpected format.")
    return value


def file_bytes(label: str, suffixes: tuple[str, ...]) -> tuple[Path, bytes]:
    raw = input(label + " file path (outside this repository): ").strip()
    try:
        path = Path(raw).expanduser().resolve(strict=True)
        if path.is_relative_to(REPO_ROOT):
            raise SetupError(label + " must be stored outside the repository.")
        if not path.is_file() or path.suffix.lower() not in suffixes:
            raise SetupError(label + " must be a regular file of the requested type.")
        if path.stat().st_size > MAX_SECRET_BYTES:
            raise SetupError(label + " is too large for a GitHub Actions secret.")
        content = path.read_bytes()
    except (OSError, ValueError):
        raise SetupError(label + " could not be read; check its local path.") from None
    if not content:
        raise SetupError(label + " is empty.")
    return path, content


def encoded_file(content: bytes, label: str) -> str:
    value = base64.b64encode(content).decode("ascii")
    if len(value.encode()) > MAX_SECRET_BYTES:
        raise SetupError(label + " exceeds GitHub's secret size limit after base64 encoding.")
    return value


def validate_profile(profile: dict, requires_push: bool = False) -> None:
    entitlements = profile.get("Entitlements", {})
    if TEAM_ID not in profile.get("TeamIdentifier", []):
        raise SetupError("Provisioning profile belongs to the wrong Apple team.")
    if entitlements.get("application-identifier") != f"{TEAM_ID}.{BUNDLE_ID}":
        raise SetupError("Provisioning profile does not match this app's explicit identifier.")
    if entitlements.get("get-task-allow") is not False or profile.get("ProvisionedDevices") or profile.get("ProvisionsAllDevices"):
        raise SetupError("Use an App Store Connect distribution profile, not Development, Ad Hoc, or Enterprise.")
    if entitlements.get("com.apple.developer.healthkit") is not True:
        raise SetupError("Provisioning profile must include the HealthKit capability.")
    if requires_push and entitlements.get("aps-environment") != "production":
        raise SetupError("This app requires a profile with production Push Notifications enabled.")
    expiry = profile.get("ExpirationDate")
    if not isinstance(expiry, dt.datetime):
        raise SetupError("Provisioning profile has no readable expiration date.")
    if expiry.replace(tzinfo=dt.timezone.utc) <= dt.datetime.now(dt.timezone.utc):
        raise SetupError("Provisioning profile has expired; regenerate it in Apple Developer.")
    if not profile.get("DeveloperCertificates"):
        raise SetupError("Provisioning profile has no distribution certificate.")


def inspect_profile(path: Path) -> None:
    if sys.platform != "darwin":
        raise SetupError("Apple credential setup needs macOS to validate the provisioning profile.")
    try:
        profile = plistlib.loads(run_command(["/usr/bin/security", "cms", "-D", "-i", str(path)]))
        app_entitlements = plistlib.loads((REPO_ROOT / "FWB-iOS-App/FWBCoach/FWBCoach.entitlements").read_bytes())
    except (ValueError, OSError, plistlib.InvalidFileException):
        raise SetupError("Provisioning profile or app entitlements could not be decoded.") from None
    if not isinstance(profile, dict) or not isinstance(app_entitlements, dict):
        raise SetupError("Provisioning profile or app entitlements are malformed.")
    validate_profile(profile, requires_push="aps-environment" in app_entitlements)


def collect_apple() -> list[Setting]:
    key_id = checked_text(hidden("ASC key ID"), "ASC key ID", r"[A-Z0-9]{10}")
    issuer = hidden("ASC issuer ID").strip()
    try:
        uuid.UUID(issuer)
    except ValueError:
        raise SetupError("ASC issuer ID must be a UUID from the Team Keys page.") from None
    _, key = file_bytes("App Store Connect .p8", (".p8",))
    if not key.strip().startswith(b"-----BEGIN PRIVATE KEY-----") or not key.strip().endswith(b"-----END PRIVATE KEY-----"):
        raise SetupError("ASC key file must contain the downloaded PKCS#8 private key.")
    _, p12 = file_bytes("Apple Distribution .p12", (".p12", ".pfx"))
    password = hidden("Distribution .p12 password")
    profile_path, profile = file_bytes("App Store Connect .mobileprovision", (".mobileprovision",))
    inspect_profile(profile_path)
    return [
        Setting("secret", "ASC_KEY_ID", key_id),
        Setting("secret", "ASC_ISSUER_ID", issuer),
        Setting("secret", "ASC_PRIVATE_KEY_P8_BASE64", encoded_file(key, "ASC key")),
        Setting("secret", "IOS_DISTRIBUTION_P12_BASE64", encoded_file(p12, "Distribution identity")),
        Setting("secret", "IOS_DISTRIBUTION_P12_PASSWORD", password),
        Setting("secret", "IOS_PROVISIONING_PROFILE_BASE64", encoded_file(profile, "Provisioning profile")),
    ]


def collect_sentry() -> list[Setting]:
    token = hidden("Sentry CI auth token")
    dsn = input("Sentry project DSN (public SDK identifier): ").strip()
    try:
        parsed = urlsplit(dsn)
        valid_dsn = parsed.scheme == "https" and parsed.hostname and parsed.username and not parsed.password and re.fullmatch(r"/[0-9]+", parsed.path) and not parsed.query and not parsed.fragment and not any(c.isspace() for c in dsn)
    except ValueError:
        valid_dsn = False
    if not valid_dsn:
        raise SetupError("SENTRY_DSN must be an HTTPS DSN with a public key, a numeric project path, and no secret password/query.")
    org = checked_text(input("Sentry organization slug: "), "SENTRY_ORG", r"[a-z0-9][a-z0-9_-]*")
    project = checked_text(input("Sentry project slug: "), "SENTRY_PROJECT", r"[a-z0-9][a-z0-9_-]*")
    url = input("Sentry server URL [https://sentry.io]: ").strip() or "https://sentry.io"
    try:
        parsed_url = urlsplit(url)
        valid_url = parsed_url.scheme == "https" and parsed_url.hostname and not parsed_url.username and not parsed_url.password and not parsed_url.query and not parsed_url.fragment and not any(c.isspace() for c in url)
    except ValueError:
        valid_url = False
    if not valid_url:
        raise SetupError("SENTRY_URL must be an HTTPS service URL without credentials or a query.")
    return [Setting("secret", "SENTRY_AUTH_TOKEN", token)] + [
        Setting("variable", name, value) for name, value in zip(SENTRY_VARIABLES, (dsn, org, project, url.rstrip("/")))
    ]


def write_settings(gh: str, repo: str, settings: list[Setting]) -> None:
    allowed = set(names("all"))
    for setting in settings:
        if (setting.kind, setting.name) not in allowed:
            raise SetupError("Refusing an unexpected setting name.")
        if not setting.value or len(setting.value.encode()) > MAX_SECRET_BYTES:
            raise SetupError(setting.name + " is empty or exceeds the size limit.")
    # Recheck immediately before the first write, after the interactive prompts.
    preflight(gh, repo)
    for setting in settings:
        try:
            run_command([gh, setting.kind, "set", setting.name, "--repo", repo], setting.value.encode())
        except SetupError:
            raise SetupError("Upload failed at " + setting.name + ". Earlier settings may already be updated; rerun this component after fixing GitHub access.") from None
        print("Configured " + setting.kind + " " + setting.name)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="Coach release repository: " + RELEASE_REPOSITORY)
    parser.add_argument("--component", choices=("all", "apple", "sentry"), default="all")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Interactively collect credentials and update GitHub")
    mode.add_argument("--check", action="store_true", help="Read-only GitHub repository/admin/main-branch preflight")
    mode.add_argument("--dry-run", action="store_true", help="Print setting names only; no file reads or network (default)")
    mode.add_argument("--self-test", action="store_true", help="Run local mocked safety checks; no network")
    args = parser.parse_args(argv)
    if args.self_test:
        return 0 if unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SafetyTests)).wasSuccessful() else 1
    if not args.apply and not args.check:
        for kind, name in names(args.component):
            print(kind + " " + name)
        return 0
    if not args.repo:
        raise SetupError("--repo OWNER/REPO is required for --check or --apply.")
    repo = validate_repo(args.repo)
    gh = shutil.which("gh")
    if not gh:
        raise SetupError("GitHub CLI is not installed; install it yourself from cli.github.com, then sign in with gh auth login.")
    environment = preflight(gh, repo)
    if args.check:
        print("Private repository, admin permission, and main branch verified.")
        if environment:
            print("Required testflight GitHub environment verified.")
        return 0
    if not sys.stdin.isatty():
        raise SetupError("Run --apply directly in your local terminal; do not pipe credentials into this helper.")
    print("This updates repository release secrets and variables. Enter credentials locally; values are never printed by this helper.")
    settings: list[Setting] = []
    try:
        if args.component in ("all", "apple"):
            settings.extend(collect_apple())
        if args.component in ("all", "sentry"):
            settings.extend(collect_sentry())
        write_settings(gh, repo, settings)
    finally:
        settings.clear()
    print("Setup complete. No workflow was triggered.")
    return 0


class SafetyTests(unittest.TestCase):
    def test_dry_run_never_calls_gh_or_prompts(self):
        output = io.StringIO()
        with mock.patch("subprocess.run", side_effect=AssertionError("No process expected")), mock.patch("builtins.input", side_effect=AssertionError("No prompt expected")), mock.patch("sys.stdout", output):
            self.assertEqual(main(["--dry-run"]), 0)
        self.assertEqual(output.getvalue().splitlines(), [kind + " " + name for kind, name in names("all")])

    def test_another_repository_is_refused_before_credentials_are_read(self):
        with mock.patch(__name__ + ".read_api", side_effect=AssertionError("No API call expected")):
            with self.assertRaisesRegex(SetupError, "Coach release credentials must target"):
                preflight("gh", "owner/repo")

    def test_approved_public_repository_is_supported(self):
        with mock.patch(__name__ + ".read_api", return_value={"private": False, "permissions": {"admin": True}}), mock.patch(__name__ + ".required_environment", return_value=None):
            self.assertIsNone(preflight("gh", RELEASE_REPOSITORY))

    def test_missing_admin_is_refused(self):
        with mock.patch(__name__ + ".read_api", return_value={"private": True, "permissions": {"admin": False}}):
            with self.assertRaisesRegex(SetupError, "admin permission"):
                preflight("gh", RELEASE_REPOSITORY)

    def test_workflow_environment_requirement_is_read_without_mutation(self):
        for declaration in ("    environment: testflight\n", "    environment: 'testflight' # release\n"):
            with mock.patch.object(Path, "read_text", return_value=declaration):
                self.assertEqual(required_environment(), "testflight")
        with mock.patch.object(Path, "read_text", return_value="jobs:\n  deploy:\n    runs-on: macos-latest\n"):
            self.assertIsNone(required_environment())
        with mock.patch.object(Path, "read_text", return_value="    environment:\n      name: testflight\n"):
            with self.assertRaises(SetupError):
                required_environment()

    def test_preflight_checks_required_environment_and_never_creates_it(self):
        calls = []
        def response(gh, endpoint):
            calls.append(endpoint)
            if endpoint == "repos/" + RELEASE_REPOSITORY:
                return {"private": True, "permissions": {"admin": True}}
            return {}
        with mock.patch(__name__ + ".read_api", side_effect=response), mock.patch(__name__ + ".required_environment", return_value="testflight"):
            self.assertEqual(preflight("gh", RELEASE_REPOSITORY), "testflight")
        self.assertEqual(calls, ["repos/" + RELEASE_REPOSITORY, "repos/" + RELEASE_REPOSITORY + "/branches/main", "repos/" + RELEASE_REPOSITORY + "/environments/testflight"])
        calls.clear()
        with mock.patch(__name__ + ".read_api", side_effect=response), mock.patch(__name__ + ".required_environment", return_value=None):
            self.assertIsNone(preflight("gh", RELEASE_REPOSITORY))
        self.assertEqual(calls, ["repos/" + RELEASE_REPOSITORY, "repos/" + RELEASE_REPOSITORY + "/branches/main"])

    def test_secret_and_variable_values_travel_only_on_stdin(self):
        token = "sentinel-secret-not-for-argv"
        settings = [Setting("secret", "SENTRY_AUTH_TOKEN", token), Setting("variable", "SENTRY_ORG", "sample-org")]
        with mock.patch(__name__ + ".preflight"), mock.patch(__name__ + ".run_command", return_value=b"") as command, mock.patch("sys.stdout", new_callable=io.StringIO) as output:
            write_settings("gh", "owner/repo", settings)
        self.assertEqual(command.call_args_list[0].args[1], token.encode())
        self.assertEqual(command.call_args_list[1].args[1], b"sample-org")
        for call in command.call_args_list:
            self.assertNotIn(token, " ".join(call.args[0]))
            self.assertNotIn("--body", call.args[0])
            self.assertNotIn("--env", call.args[0])
        self.assertNotIn(token, output.getvalue())
        self.assertNotIn(token, repr(settings))

    def test_command_error_never_exposes_stderr(self):
        result = subprocess.CompletedProcess([], 1, stdout=b"secret-a", stderr=b"secret-b")
        with mock.patch("subprocess.run", return_value=result):
            with self.assertRaises(SetupError) as caught:
                run_command(["gh", "secret", "set", "SENTRY_AUTH_TOKEN"], b"secret-c")
        self.assertNotIn("secret-", str(caught.exception))

    def test_base64_size_limit_is_enforced(self):
        self.assertEqual(encoded_file(b"abc", "Fixture"), "YWJj")
        with self.assertRaises(SetupError):
            encoded_file(b"x" * MAX_SECRET_BYTES, "Fixture")

    def test_sentry_dsn_rejects_invalid_paths_and_embedded_secrets(self):
        for dsn in ("https://public@example.com/project", "https://public@example.com/123/", "https://public:secret@example.com/123", "https://public@example.com/123?secret=x", "https://[invalid/123"):
            with mock.patch(__name__ + ".hidden", return_value="sentinel"), mock.patch("builtins.input", return_value=dsn):
                with self.assertRaisesRegex(SetupError, "SENTRY_DSN"):
                    collect_sentry()
        with mock.patch(__name__ + ".hidden", return_value="sentinel"), mock.patch("builtins.input", side_effect=["https://public@example.com/123", "example-org", "ios-app", ""]):
            settings = collect_sentry()
        self.assertEqual([setting.name for setting in settings], ["SENTRY_AUTH_TOKEN", *SENTRY_VARIABLES])
        self.assertEqual(settings[-1].value, "https://sentry.io")

    def test_profile_rejects_wrong_team_debug_and_missing_healthkit(self):
        profile = {"TeamIdentifier": [TEAM_ID], "Entitlements": {"application-identifier": f"{TEAM_ID}.{BUNDLE_ID}", "get-task-allow": False, "com.apple.developer.healthkit": True}, "ExpirationDate": dt.datetime.now() + dt.timedelta(days=30), "DeveloperCertificates": [b"fixture"]}
        validate_profile(profile)
        for field, value in [("get-task-allow", True), ("com.apple.developer.healthkit", False), ("application-identifier", "OTHER.app")]:
            changed = dict(profile, Entitlements=dict(profile["Entitlements"], **{field: value}))
            with self.assertRaises(SetupError):
                validate_profile(changed)
        with self.assertRaises(SetupError):
            validate_profile(dict(profile, TeamIdentifier=["OTHER"]))
        with self.assertRaises(SetupError):
            validate_profile(profile, requires_push=True)

    def test_invalid_repository_cannot_inject_flags_or_url(self):
        for value in ("--repo/evil", "https://github.com/a/b", "owner/repo/extra", "owner/repo;echo"):
            with self.assertRaises(SetupError):
                validate_repo(value)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SetupError as error:
        print("Setup stopped: " + str(error), file=sys.stderr)
        raise SystemExit(1)
    except (KeyboardInterrupt, EOFError):
        print("Setup cancelled; no credential values were printed.", file=sys.stderr)
        raise SystemExit(130)
