#!/usr/bin/env bash
# Publish an already-built release to Cafe Bazaar from an IP Bazaar accepts.
#
# The release workflow builds and signs on GitHub-hosted runners but cannot
# upload: Pishkhan answers every request from GitHub's Azure egress with
# 403 access_forbidden, valid token or not. Probe run 32404824716 sent the
# same token that returns 200 locally and still got 403, with the response
# byte-identical to an unauthenticated one — Bazaar denies at the edge,
# before it looks at the credential. So CI stops after publishing the
# .aab/.bin pair as an artifact, and this script finishes the job.
#
#   BAZAAR_API_TOKEN=... scripts/bazaar-publish.sh                  # upload only
#   BAZAAR_API_TOKEN=... scripts/bazaar-publish.sh --submit         # upload, then submit for review
#   BAZAAR_API_TOKEN=... scripts/bazaar-publish.sh --run 32371491297
#
# Without --submit nothing reaches Bazaar's reviewers; the release sits
# uncommitted in Pishkhan for you to check and submit by hand.
#
# Requires: gh (authenticated), jq, curl.
set -euo pipefail

api="https://api.pishkhan.cafebazaar.ir/v1/apps/releases"
run=""; submit=false; auto_publish=false

while [ $# -gt 0 ]; do
  case "$1" in
    --run)          run=${2:?--run needs a run id}; shift 2 ;;
    --submit)       submit=true; shift ;;
    --auto-publish) auto_publish=true; shift ;;
    -h|--help)      awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *)              echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# ── Credentials ──────────────────────────────────────────────────────────
# Fall back to .env so the token does not have to live in your shell history.
if [ -z "${BAZAAR_API_TOKEN:-}" ] && [ -f .env ]; then
  BAZAAR_API_TOKEN=$(sed -n 's/^BAZAAR_API_TOKEN=//p' .env | head -1 | tr -d "\"'")
fi
token=$(printf '%s' "${BAZAAR_API_TOKEN:-}" | tr -d '[:space:]')
if [ -z "$token" ]; then
  echo "BAZAAR_API_TOKEN is not set. Pishkhan -> your app -> «API پیشخان بازار»." >&2
  exit 1
fi
auth="CAFEBAZAAR-PISHKHAN-API-SECRET: ${token}"

# gh's own token expires independently of the git credential helper, so borrow
# the latter when it has gone stale rather than failing three calls later.
# `gh auth status` is not the test: it reports non-zero whenever any stored
# account is broken, even when GH_TOKEN is set and working. Call the API.
if ! gh api user >/dev/null 2>&1; then
  GH_TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')
  export GH_TOKEN
  gh api user >/dev/null 2>&1 || { echo "cannot reach the GitHub API — run: gh auth login" >&2; exit 1; }
fi

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# ── Locate the build ─────────────────────────────────────────────────────
# Newest unexpired artifact, unless a specific run was named. Artifacts hold
# the only copy of the signed pair: EAS builds are not reproducible, so a
# rebuild would invalidate the .bin.
if [ -n "$run" ]; then
  filter=".artifacts[] | select(.expired==false and .workflow_run.id==${run})"
else
  filter="[.artifacts[] | select(.expired==false)] | sort_by(.created_at) | reverse | .[0]"
fi
artifact=$(gh api "repos/$repo/actions/artifacts?per_page=100" --jq "$filter | .name" | head -1)
[ -n "$artifact" ] || { echo "no unexpired artifact found${run:+ for run $run}" >&2; exit 1; }

version=$(printf '%s' "$artifact" | sed -n 's/^tally-\(.*\)-[0-9]*$/\1/p')
echo "→ artifact $artifact (version ${version:-unknown})"

# .txt and .md are both in use under changelogs/ (1.2.0 vs 1.2.1), so take
# whichever exists rather than making the caller remember which.
notes() {
  local f
  for f in "changelogs/${version}.$1.txt" "changelogs/${version}.$1.md"; do
    [ -s "$f" ] && { printf '%s' "$f"; return 0; }
  done
  echo "no release notes for $version ($1): expected changelogs/${version}.$1.txt or .md," >&2
  echo "non-empty. These are user-facing store notes — write them before submitting." >&2
  return 1
}
if [ "$submit" = true ]; then
  fa=$(notes fa); en=$(notes en)
  echo "→ release notes: $fa, $en"
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
gh run download -R "$repo" -n "$artifact" -D "$work" ${run:+"$run"}

aabs=("$work"/*.aab); bins=("$work"/*.bin)
aab=${aabs[0]}; bin=${bins[0]}
[ -f "$aab" ] && [ -f "$bin" ] || { echo "artifact is missing the .aab/.bin pair" >&2; exit 1; }
ls -lh "$aab" "$bin"

# Changelogs are checked before anything is uploaded — discovering they are
# missing after a 90 MB upload wastes the whole run.

# ── Pishkhan ─────────────────────────────────────────────────────────────
# curl -f discards the body, turning every rejection into "curl: (22) 403".
call() {
  local out code body
  out=$(curl -sS -w '\n%{http_code}' "$@") || return 1
  code=${out##*$'\n'}; body=${out%$'\n'*}
  if [ "$code" -ge 400 ]; then
    echo "Pishkhan returned HTTP $code: $body" >&2
    [ "$code" = 403 ] && echo "403 here means this machine's IP is blocked, or the token is revoked." >&2
    return 1
  fi
  printf '%s' "$body"
}

# Assign first, test second. Inside an `if` condition set -e is suppressed, so
# a failed check would fall through to creating a release — the exact thing
# this guard exists to prevent.
echo "→ checking for an uncommitted release"
pending=$(call --url "$api/last-uncommitted/" -H "$auth" | jq -r '.type')
if [ "$pending" = "success" ]; then
  echo "A release is already sitting uncommitted in Pishkhan. Uploading into it would" >&2
  echo "mix two builds — resolve or discard it in the panel first." >&2
  exit 1
fi

echo "→ creating release"
call -X POST --url "$api/" -H "$auth" | jq -r '.message'
echo "→ uploading $(basename "$aab")"
call -X POST --url "$api/upload-aab/" -H "$auth" -F "aab=@$aab" | jq -r '.message'
echo "→ uploading $(basename "$bin")"
call -X POST --url "$api/upload-bin/" -H "$auth" -F "file=@$bin" | jq -r '.message'

# States: U=awaiting bin, S=awaiting signing, P=processing, D=done, E=error.
# Docs ask for at most one poll per minute.
echo "→ waiting for Bazaar to sign and generate packages"
for i in $(seq 1 30); do
  sleep 60
  resp=$(call --url "$api/bundle-status/" -H "$auth")
  st=$(printf '%s' "$resp" | jq -r '.bundle.state // "?"')
  echo "   [$i/30] state=$st"
  case "$st" in
    D) break ;;
    E) echo "Bazaar processing failed: $(printf '%s' "$resp" | jq -c '.bundle.errors')" >&2; exit 1 ;;
  esac
  if [ "$i" -eq 30 ]; then echo "timed out after 30 minutes" >&2; exit 1; fi
done

if [ "$submit" != true ]; then
  echo "✓ uploaded. Review it in Pishkhan and submit there, or re-run with --submit."
  exit 0
fi

echo "→ submitting for review"
jq -n --rawfile fa "$fa" --rawfile en "$en" --argjson auto "$auto_publish" \
  '{changelog_fa:$fa, changelog_en:$en, auto_publish:$auto, staged_rollout_percentage:100}' \
  > "$work/commit.json"
call -X POST --url "$api/commit/" -H "$auth" \
  -H 'Content-Type: application/json' --data @"$work/commit.json" | jq -r '.message'
echo "✓ submitted for review"
