# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-11

### Security
- **Approval prompts are fully reviewable.** Arguments are shown in full up to 16 000 characters (previously cut at 1500, so a padded prefix could hide the tail of a long statement); a longer action is refused instead of approved blind (the mail/chat body tools are the exception: an over-long prose body is summarised, since recipients/destination are always shown separately). Secret redaction in prompts matches whole words (`bypass`/`tokenizer` are no longer shown as `[redacted]`).
- laya-guard now receives the secret-redacted arguments (`canonicalArgs`) instead of `JSON.stringify(args)`, so credentials in tool arguments no longer reach the guard prompt, the guard daemon, or its log.
- **Approval no longer fails open on timeout.** The human-approval prompt used the MCP SDK's default
  60 s request timeout, and a timeout fell through to "approved" (the `TEAMS_ALLOW_SEND` /
  `TEAMS_ALLOW_DELETE` gate had already passed). A prompt nobody answered therefore auto-approved a post
  or a delete. A timeout is now a refusal, and the wait defaults to 5 minutes.

### Added
- **Approvals are bound to the exact action.** The prompt shows the tool, the full (secret-redacted)
  arguments and a fingerprint; every approval and refusal is written to the audit log as
  `"audit":"approval"` with the fingerprint, resource version and `approvedBy` (`human` / `flag-only`).
  The same per-call binding applies to laya-guard `confirm` prompts.
- **Approvals are bound to the target's version.** `delete_channel_message` reads a version token before
  the prompt and again after the human answers, and refuses if it changed (team + channel + message id with
  Graph's `etag`, `lastModifiedDateTime` and `deletedDateTime`).
- `send_channel_message`, `reply_channel_message` and `send_chat_message` have no existing object to
  version; they are bound to the fingerprint of the exact arguments. The prompt lists team/channel (or the
  chat's type, topic and members, and the parent message for replies) and the message length outside the
  1500-character arguments dump.
- `TEAMS_REQUIRE_HUMAN_APPROVAL=true` — refuse these operations when the client cannot elicit.

Tracking issue: https://github.com/dockndevai/mcp-core/issues/1

## [0.2.5] - 2026-11-09

### Changed
- Routine dependency maintenance: `npm audit --audit-level=high` reported 0 advisories (no high/critical vulnerabilities to fix this pass). Took in-range patch bump for `vitest` (5.0.5 → 5.1.0). No feature or behavior changes; `npm audit` reports 0 vulnerabilities.

## [0.2.4] - 2026-11-02

### Changed
- Routine dependency maintenance: `npm audit --audit-level=high` reported 0 high/critical advisories. `npm audit fix` cleared a moderate `@hono/node-server` advisory (`serveStatic` double path-decoding, GHSA-rmxm-3fg6-px4f, 2.1.1 → 2.1.5, transitive via `@modelcontextprotocol/sdk`); `npm audit` now reports 0 vulnerabilities. Took an in-range patch bump for `@types/node` (26.6.5 → 26.6.6). No feature or behavior changes.

## [0.2.3] - 2026-10-26

### Changed
- Dependency/security maintenance: ran `npm audit fix` to clear a high-severity `body-parser` DoS advisory (GHSA-27r3-jxmh-p828, body-parser 2.3.0 → 2.4.0) and moderate `fast-uri` advisories (GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp, fast-uri 3.1.8 → 3.1.9), both transitive. Took in-range patch bump for `@modelcontextprotocol/sdk` (1.32.1 → 1.32.2). `npm audit` now reports 0 vulnerabilities. No feature or behavior changes; the Graph OAuth/PKCE auth module (`src/graph/auth.ts`) was not touched.

## [0.2.2] - 2026-10-19

### Changed
- Routine dependency maintenance: `npm audit --audit-level=high` reported 0 advisories (no high/critical vulnerabilities to fix this pass). Took in-range patch bumps for `vitest` (5.0.3 → 5.0.5) and `zod` (4.6.6 → 4.6.7). No feature or behavior changes.

## [0.2.1] - 2026-10-12

### Security
- Bumped `@modelcontextprotocol/sdk` to 1.32.1, fixing a high-severity advisory where the OAuth
  client could send credentials to an authorization server chosen by the MCP server
  ([GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h)), plus transitive fixes
  for `proxy-addr` (critical), `hono`, `fast-uri`, `ip-address`, and `source-map-js`
  (`npm audit fix`, 0 vulnerabilities remaining).

### Maintenance
- Routine in-range patch/minor dependency bumps: `zod`, `@types/node`, `tsx`, `vitest`.

## [0.2.0] - 2026-09-29

### Added
- **Optional AI risk guard (laya-guard).** Mutating tools can consult a local [laya-guard](https://github.com/dockndevai/laya-guard) daemon that classifies each operation allow / confirm / block before it runs. Runs after the deterministic policy gates and can only *tighten*, never grant; fails closed. Off by default (`TEAMS_GUARD_MODE=monitor|enforce`).

## [0.1.0] - 2026-09-15

### Added
- Initial release: a safe-by-default MCP server for Microsoft Teams over Microsoft Graph.
  13 tools across read/read-write/admin: `whoami`, `list_teams`, `list_channels`,
  `list_team_members`, `list_channel_messages`, `get_channel_message`, `list_message_replies`,
  `list_chats`, `list_chat_messages`, `send_channel_message`, `reply_channel_message`,
  `send_chat_message`, and `delete_channel_message`.
- **Browser sign-in** (default): OAuth authorization-code + PKCE with a loopback redirect. The
  server opens the Microsoft sign-in page, caches the access/refresh token on disk (0600), and
  refreshes silently — it never handles your password. App-only (client-credentials) and static
  bearer-token auth are also supported and auto-detected.
- Security model: access modes (read-only/read-write/admin), a dedicated **send gate**
  (`TEAMS_ALLOW_SEND`) on top of read-write for channel/chat posts and replies, team allowlist and
  protected teams, delete opt-in (`TEAMS_ALLOW_DELETE`, soft-delete), dry-run, and JSON audit
  logging.
- **Human-in-the-loop confirmation** via MCP [elicitation](https://modelcontextprotocol.io/specification/draft/client/elicitation):
  posting and deleting pause and ask the human to approve the exact target; clients that can't
  elicit fall back to the `*_ALLOW_*` flag gates.
- MCP tool annotations derived from each tool's capability, with a test keeping them consistent.
