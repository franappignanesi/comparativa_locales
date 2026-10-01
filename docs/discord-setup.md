# Discord notifications

## Deployment status and defaults

No Discord messages are sent by default. Connection and delivery are separate flags.
No persistent Gateway connection or additional hosting is required. Vercel handles authenticated account linking and settings; GitHub Actions delivers messages directly to Discord.
Discord data uses dedicated Neon tables, never app_json_state (the existing maintenance job truncates that table).

## Developer Portal

Public Privacy Policy: https://www.shuxteam.com/privacidad
Public Terms of Service: https://www.shuxteam.com/terminos

1. Create the BARATEAM application using an existing administrator account.
2. OAuth2: register EXACTLY https://www.shuxteam.com/api/user/discord/callback.
3. Copy Application ID and generate the OAuth2 Client Secret.
4. Bot: generate its bot token. Disable public installation if only SHUX will use it. Keep all privileged intents OFF. Do not grant Administrator.
5. Install the bot in the SHUX server with the bot scope. No moderation or message-content permissions are needed for this REST-only implementation. Users should share SHUX with the bot and permit direct messages; the mandatory test detects delivery failures.
6. For the weekly digest, create a webhook in a PRIVATE test channel first. Its URL is a credential. Do not paste it into a public issue or commit it.

## Vercel Production/Preview environment

- DISCORD_CLIENT_ID: application ID (General Information).
- DISCORD_CLIENT_SECRET: OAuth2 client secret.
- DISCORD_BOT_TOKEN: Bot token.
- DISCORD_CONNECT_ENABLED=1: enable the connection button after credentials are ready.
- DISCORD_SEND_ENABLED=1: allow actual test sends (leave 0 until ready).
- DISCORD_TEST_MODE=1: restrict recipients (the default even if absent).
- DISCORD_TEST_USER_IDS: comma-separated Discord account IDs allowed during testing. Use Discord Developer Mode > Copy User ID, NOT Application ID.
- DISCORD_DAILY_SEND_LIMIT=100: shared daily ceiling for DM attempts; hard maximum 1000.
- Existing POSTGRES_URL and SESSION_SECRET are required.

Deploy after updating Vercel environment variables. Preview uses the canonical production callback; do not test identity linking on preview with these production OAuth credentials.

## GitHub Actions

Secrets: DISCORD_BOT_TOKEN, DISCORD_TEST_USER_IDS, DISCORD_WEEKLY_WEBHOOK_URL; existing POSTGRES_URL.
Repository variables: DISCORD_SEND_ENABLED=0, DISCORD_TEST_MODE=1, DISCORD_WEEKLY_ENABLED=0, DISCORD_DAILY_SEND_LIMIT=100.
Set SEND_ENABLED=1 for controlled trials only after the allowlist is set. Set TEST_MODE=0 in BOTH Vercel and GitHub only after a successful test and explicit public-launch approval.
Weekly publishing stays off until WEEKLY_ENABLED=1. Default schedule is Friday 19:15 Argentina (22:15 UTC), approximate due to GitHub scheduling delays. Choose the final channel and schedule with the owner before enabling.

The daily refresh enqueues wishlist digests after successful evaluation. Discord delivery errors do NOT block publishing prices or email/push. The worker handles up to 30 messages / 3 minutes per execution. Pending, clearly rejected rate-limited attempts are continued on a later run, with a maximum of 3 attempts and 48-hour expiry. There is no automatic retry loop or periodic polling.
The weekly workflow restores the existing public cache, performs no scraping, and refuses price datasets older than 48 hours. A manual run defaults to preview-only.

## User flow

Google login > Profile > Connect Discord > approve identify permission > send confirmation test > explicitly enable private alerts.
Connecting never enables alerts automatically. Two test attempts per account per UTC day, one grouped wishlist digest per Discord recipient per Argentina calendar day. No free-form recipient IDs or message contents are accepted from the browser.
Existing wishlist thresholds, stores and region are used. Up to 10 game/store offers per digest. MD delivery may fail because of Discord privacy, server membership or blocking; never promise guaranteed delivery.

## Safety and incident handling

- Same-origin mutation checks; authenticated, one-use OAuth state bound to the current Google session and an HttpOnly cookie; only identify scope. OAuth tokens are not persisted.
- Unique Discord-to-BARATEAM account binding; consent and current region/store settings rechecked before dispatch.
- Database-backed user/IP/global limits for connection attempts; global send-attempt cap shared by test endpoints and workers.
- Atomic outbox claims, cross-worker lock, per-recipient/day idempotency, disabled mentions, content sanitization and hard API/time/message budgets.
- On 401 / 429 or repeated failures, stop the worker. 403 failures are blocked; network timeouts/5xx after ambiguous acceptance are marked uncertain and are NOT automatically resent. Some messages may be lost rather than duplicated. Review uncertain deliveries manually; do not blindly replay them.
- Master pause without redeployment: administrator PUT /api/admin/discord with JSON {"enabled":false}, using the authenticated site session and same-origin request. This Neon flag is checked before each send. GET shows status. Setting true cannot override DISCORD_SEND_ENABLED=0.
- Administrators also have the global pause checkbox in Profile > Discord, without using a terminal.
- Revoke/rotate the Discord token/webhook if leaked. Secrets live only in Vercel/GitHub secret storage; log summaries never contain recipients, OAuth secrets or webhook URLs.
- Limits in application code cannot prevent all invocation costs from a distributed attack. Use platform firewall/rate-limit controls and spending alerts as well; do not promise zero attack-induced costs.
- Cleanup: expired OAuth/rate rows; outbox after expiry +7 days; alert receipts after 90 days. No message/video content is stored beyond short notification payloads.

## Verification before public enablement

- Typecheck, build and Discord unit tests.
- Without session, all linking/test/control routes return 401; cross-origin mutations fail.
- Replayed/mismatched OAuth state fails; one Discord account cannot attach to two Google users.
- Sending is off by default; test mode denies non-allowlisted recipients.
- Connect, send test, opt in, run an actual private-channel trial, rerun and verify no duplicate.
- Verify disabling/unlinking stops queued sends, blocking MD does not break other notifications, and emergency pause stops the worker.
- Verify weekly preview first and stale-data refusal. No live delivery verification is complete until credentials and an allowed test recipient are configured.
