# Security

`mcp-teams` gives an AI agent access to Microsoft Teams — teams, channels, chats, their messages,
and the ability (in higher modes) to post on your behalf. Treat it like any other privileged
automation and grant it the least access it needs.

## Principles

- **Start read-only.** Leave `TEAMS_MODE=read-only` until you need to write. In read-only mode only
  the read tools are registered — post/reply/send/delete tools are not exposed to the model at all.
- **The Graph token is the primary control.** These flags are defence in depth. The real boundary is
  the OAuth token the server authenticates with: it carries its own delegated scopes and the teams /
  chats it can reach. Grant the narrowest scopes that work — read scopes alone mean even a bug or a
  prompt injection cannot post or delete.
- **Sign-in happens in the browser.** In the default interactive mode the server runs the OAuth
  authorization-code + PKCE flow: your credentials go only to Microsoft, never to the server. The
  cached access/refresh token is written user-only (`~/.mcp-teams/token.json`, mode 0600) and never
  logged.
- **Capabilities are gated by mode.** Every tool declares a capability (`read` / `write` / `admin`).
  A tool is registered only if the mode allows its capability, and each call is re-checked at runtime
  (`src/security.ts`).
- **Posting is doubly gated.** `send_channel_message`, `reply_channel_message` and `send_chat_message`
  require `read-write` mode **and** `TEAMS_ALLOW_SEND=true`, because a posted message is visible to
  others. When the client supports MCP elicitation they also pause for a human to approve the exact
  target and preview first.
- **Scope to teams.** `TEAMS_TEAM_ALLOWLIST` confines posts/moderation to named teams;
  `TEAMS_PROTECTED_TEAMS` marks teams that may be read but never posted to or moderated. (Chats are
  not team-scoped; the allowlist does not apply to `send_chat_message`.)
- **Gate deletes.** `delete_channel_message` requires both `admin` mode and `TEAMS_ALLOW_DELETE=true`,
  and performs a soft-delete (recoverable) of your own message rather than a hard purge.
- **Preview with dry-run.** `TEAMS_DRY_RUN=true` validates and logs write intent without executing.

## Limitations

- Team allowlist/protection is enforced on the team a call names. Chat operations are bounded by the
  token's scopes and chat membership, not by team rules.
- Posting trusts the message body you pass; there is no outbound content filtering beyond the
  human-confirmation prompt. Keep `TEAMS_ALLOW_SEND` off unless you need it.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
