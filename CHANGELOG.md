# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
