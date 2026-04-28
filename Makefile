# Supabase Edge Function deploys + secret pushes.
#
# `make help` for the menu. Reads `.env` (override with `make ENV_FILE=…`)
# and pushes the matching values as Supabase project secrets, then deploys
# the function. The local `.env` itself never reaches the device bundle —
# every key handled here is server-side.
#
# For each secret the recipe checks the bare server-side name first
# (e.g. `AI_API_KEY`) then falls back to the legacy `EXPO_PUBLIC_*` name
# already in your `.env`, so existing `.env` files work without renaming.
# Empty / unset variables are skipped silently.
#
# Requirements:
#   - `supabase` CLI on PATH (or set `SUPABASE=npx supabase`)
#   - `supabase link` already run for this project (so the CLI knows the
#     target project ref)

ENV_FILE ?= .env
# Prefer a globally installed `supabase`; otherwise run via `npx --yes supabase`
# (downloads on first call, then cached). Override with `SUPABASE=...` if you
# want to pin a specific binary.
SUPABASE ?= $(shell command -v supabase 2>/dev/null || echo "npx --yes supabase")

# (server-secret-name, env-var-to-read-from)
AI_PROXY_SECRETS = \
	AI_BASE_URL:EXPO_PUBLIC_AI_BASE_URL \
	AI_API_KEY:EXPO_PUBLIC_AI_API_KEY \
	AI_MODEL:EXPO_PUBLIC_AI_MODEL \
	AI_RECEIPT_MODEL:EXPO_PUBLIC_AI_RECEIPT_MODEL \
	OPENAI_API_KEY:EXPO_PUBLIC_OPENAI_API_KEY \
	OPENAI_RECEIPT_MODEL:EXPO_PUBLIC_OPENAI_RECEIPT_MODEL \
	OPENAI_WHISPER_MODEL:EXPO_PUBLIC_OPENAI_WHISPER_MODEL \
	STT_API_KEY:EXPO_PUBLIC_STT_API_KEY \
	STT_ENDPOINT_URL:EXPO_PUBLIC_STT_ENDPOINT_URL \
	STT_MODEL:EXPO_PUBLIC_STT_MODEL \
	AI_EXPENSE_PROMPT:EXPO_PUBLIC_AI_EXPENSE_PROMPT \
	AI_CATEGORY_PROMPT:EXPO_PUBLIC_AI_CATEGORY_PROMPT

APPLE_SECRETS = \
	APP_STORE_CONNECT_P8:APP_STORE_CONNECT_P8 \
	APP_STORE_KEY_ID:APP_STORE_KEY_ID \
	APP_STORE_ISSUER_ID:APP_STORE_ISSUER_ID \
	APPLE_BUNDLE_ID:APPLE_BUNDLE_ID \
	APPLE_PREMIUM_PRODUCT_IDS:EXPO_PUBLIC_PREMIUM_SUBSCRIPTION_IDS

.DEFAULT_GOAL := help

.PHONY: help \
	ai-proxy ai-proxy-secrets ai-proxy-deploy \
	apple apple-secrets apple-deploy \
	delete-account-deploy \
	deploy-all secrets-all

help:
	@printf '%s\n' \
	  'Supabase Edge Function deploy targets' \
	  '' \
	  '  ai-proxy-secrets   Push ai-proxy keys from $(ENV_FILE) to Supabase secrets' \
	  '  ai-proxy-deploy    Deploy the ai-proxy Edge Function' \
	  '  ai-proxy           secrets + deploy (most common)' \
	  '' \
	  '  apple-secrets      Push App Store Connect keys to Supabase secrets' \
	  '  apple-deploy       Deploy sync-apple-subscription Edge Function' \
	  '  apple              secrets + deploy' \
	  '' \
	  '  delete-account-deploy  Deploy delete-account Edge Function (no secrets needed)' \
	  '' \
	  '  secrets-all        Push every supported secret' \
	  '  deploy-all         secrets-all + every function deploy' \
	  '' \
	  'Overrides: ENV_FILE=path/to/.env  SUPABASE="npx supabase"'

# ── ai-proxy ───────────────────────────────────────────────────────────

ai-proxy: ai-proxy-secrets ai-proxy-deploy

ai-proxy-secrets:
	@$(MAKE) --no-print-directory _push-secrets PAIRS="$(AI_PROXY_SECRETS)" LABEL=ai-proxy

ai-proxy-deploy:
	@echo "→ deploying ai-proxy"
	@$(SUPABASE) functions deploy ai-proxy

# ── sync-apple-subscription ────────────────────────────────────────────

apple: apple-secrets apple-deploy

apple-secrets:
	@$(MAKE) --no-print-directory _push-secrets PAIRS="$(APPLE_SECRETS)" LABEL=apple

apple-deploy:
	@echo "→ deploying sync-apple-subscription"
	@$(SUPABASE) functions deploy sync-apple-subscription

# ── delete-account ─────────────────────────────────────────────────────
# No project secrets to push — uses the auto-injected SUPABASE_SERVICE_ROLE_KEY.

delete-account-deploy:
	@echo "→ deploying delete-account"
	@$(SUPABASE) functions deploy delete-account

# ── aggregates ─────────────────────────────────────────────────────────

secrets-all: ai-proxy-secrets apple-secrets

deploy-all: secrets-all ai-proxy-deploy apple-deploy delete-account-deploy

# ── internal: push a list of "DST:SRC" pairs to supabase secrets ───────
#
# Sources $(ENV_FILE) once, then for each pair sets the secret to the value
# of $$DST if defined, else $$SRC. Skips empties so an unconfigured provider
# (no Whisper, no ElevenLabs, etc.) doesn't error out the run. One CLI call
# per variable — slow but bulletproof for values containing quotes / `$`.

.PHONY: _push-secrets
_push-secrets:
	@test -f $(ENV_FILE) || { echo "✗ $(ENV_FILE) not found (override with ENV_FILE=…)"; exit 1; }
	@set -a; . ./$(ENV_FILE); set +a; \
	pushed=0; skipped=0; \
	for pair in $(PAIRS); do \
	  dst="$${pair%%:*}"; src="$${pair##*:}"; \
	  eval "val=\"\$${$$dst:-\$${$$src:-}}\""; \
	  if [ -n "$$val" ]; then \
	    printf '  + %s\n' "$$dst"; \
	    $(SUPABASE) secrets set "$$dst=$$val" >/dev/null || { echo "✗ failed setting $$dst"; exit 1; }; \
	    pushed=$$((pushed + 1)); \
	  else \
	    printf '  - %s (unset, skipped)\n' "$$dst"; \
	    skipped=$$((skipped + 1)); \
	  fi; \
	done; \
	echo "→ $(LABEL): pushed $$pushed, skipped $$skipped"
