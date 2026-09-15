# mcp-teams

[![npm](https://img.shields.io/npm/v/@dockndevai/mcp-teams)](https://www.npmjs.com/package/@dockndevai/mcp-teams)
[![CI](https://github.com/dockndevai/mcp-teams/actions/workflows/ci.yml/badge.svg)](https://github.com/dockndevai/mcp-teams/actions/workflows/ci.yml)
[![licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

A **safe-by-default** [Model Context Protocol](https://modelcontextprotocol.io) server for **Microsoft Teams**, over [Microsoft Graph](https://learn.microsoft.com/graph/overview). It lets an agent read and operate Teams — list joined teams, channels and members, read channel messages and threaded replies, read 1:1/group chats and their messages, and (in higher modes) post to channels, reply in threads, send chat messages, and soft-delete a message.

**Browser sign-in:** on first run it opens your browser to the Microsoft sign-in page, then caches the token and refreshes it silently — the server never sees your password.

Part of the [dockndevai MCP server suite](https://dockndevai.github.io/) — one governance model across all of them.

## What it gives an agent

The server starts **read-only** (see [Safe by default](#safe-by-default)); higher-capability tools are only registered when you raise the mode.

| Tool | For | Needs mode |
|---|---|---|
| `whoami` | confirm which account is in use | read-only |
| `list_teams` | teams the user has joined | read-only |
| `list_channels` | channels in a team | read-only |
| `list_team_members` | members of a team | read-only |
| `list_channel_messages` | recent messages in a channel | read-only |
| `get_channel_message` | one channel message + body | read-only |
| `list_message_replies` | a channel message's thread | read-only |
| `list_chats` | the user's 1:1 / group chats | read-only |
| `list_chat_messages` | messages in a chat | read-only |
| `send_channel_message` | post to a channel | read-write + `TEAMS_ALLOW_SEND` |
| `reply_channel_message` | reply in a channel thread | read-write + `TEAMS_ALLOW_SEND` |
| `send_chat_message` | send a chat message | read-write + `TEAMS_ALLOW_SEND` |
| `delete_channel_message` | soft-delete your own message | admin + `TEAMS_ALLOW_DELETE` |

## Install

```bash
npx -y @dockndevai/mcp-teams
```

You need an **Entra (Azure AD) app registration**. For the default browser sign-in, register a **public client** and add the redirect URI `http://localhost` (platform: *Mobile and desktop applications*), then use its **Application (client) ID** as `TEAMS_CLIENT_ID`. Grant delegated **Team.ReadBasic.All**, **Channel.ReadBasic.All**, **ChannelMessage.Read.All** (and **ChannelMessage.Send** / **Chat.ReadWrite** to post). No client secret is needed for interactive use.

## Configure

```json
{
  "mcpServers": {
    "teams": {
      "command": "npx",
      "args": ["-y", "@dockndevai/mcp-teams"],
      "env": {
        "TEAMS_CLIENT_ID": "00000000-0000-0000-0000-000000000000",
        "TEAMS_TENANT_ID": "common",
        "TEAMS_MODE": "read-only"
      }
    }
  }
}
```

On first use the server opens your browser to sign in and caches the token at `~/.mcp-teams/token.json` (0600); later runs refresh silently.

See [docs/CLIENTS.md](docs/CLIENTS.md) for Claude Code / Cursor / Codex / VS Code / Windsurf snippets, and [.env.example](.env.example) for every supported variable.

## Authentication

Auth mode is chosen automatically (override with `TEAMS_AUTH`):

- **interactive** (default) — only `TEAMS_CLIENT_ID` set. Authorization-code + PKCE with a loopback redirect: the browser opens, you approve once, and the access + refresh token are cached on disk. Most Teams messaging APIs are delegated-only, so this is the primary mode. The server never handles your password.
- **client-credentials** (app-only) — `TEAMS_CLIENT_SECRET` present; the server fetches an app token itself. Note that several Teams message APIs are not available to app-only tokens without protected-API approval from Microsoft.
- **token** — `TEAMS_TOKEN` set to a pre-obtained Graph bearer token. You manage its lifetime.

## Safe by default

The access model is enforced by [`src/security.ts`](src/security.ts) — defence in depth on top of the Graph token's own scopes/roles:

- **`TEAMS_MODE`** — `read-only` (default) → `read-write` → `admin`. A tool is registered only if the mode allows its capability. Read-only exposes the 9 read tools; posting needs `read-write`; deletes need `admin`.
- **`TEAMS_ALLOW_SEND`** — posting a message is visible to others and can't be silently un-posted, so on top of `read-write` it also requires this flag.
- **`TEAMS_ALLOW_DELETE`** — deletes require this flag on top of `admin` mode. Deletes are soft-deletes (recoverable), and only your own messages.
- **`TEAMS_TEAM_ALLOWLIST` / `TEAMS_PROTECTED_TEAMS`** — confine which teams can be posted to / moderated; mark teams that may be read but never posted to.
- **Interactive confirmation** — when the client supports MCP elicitation, posting and deleting pause and ask the **human** to approve the exact target before running; clients that can't elicit fall back to the `TEAMS_ALLOW_SEND` / `TEAMS_ALLOW_DELETE` gates.
- **`TEAMS_DRY_RUN`** — validate and log writes without executing them.
- **`TEAMS_AUDIT_LOG`** — a JSON audit line per guarded operation, on stderr (default on).

See [SECURITY.md](SECURITY.md).

## Developing

```bash
npm install
npm run build
# introspect the tool list without signing in (uses a fake token, no network):
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | TEAMS_TOKEN=x node dist/index.js
npm test
```

## Licence

MIT
