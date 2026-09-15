# Installing `mcp-teams` in your MCP client

`mcp-teams` is a **stdio** MCP server. Any MCP-compatible agent can run it.

- **From npm (recommended):** `npx -y @dockndevai/mcp-teams`
- **From source:** `node /ABSOLUTE/PATH/TO/mcp-teams/dist/index.js` after `npm install && npm run build`.

> You need an Entra (Azure AD) **app registration**. For the default browser sign-in, register a **public client** with redirect URI `http://localhost` and use its client id as `TEAMS_CLIENT_ID`. **Start in `read-only` mode** and raise it deliberately. See [`.env.example`](../.env.example) for every variable.

On first use the server opens your browser to sign in, then caches the token at `~/.mcp-teams/token.json` and refreshes it silently.

## Claude Code (CLI)

```bash
claude mcp add teams \
  -e TEAMS_CLIENT_ID="00000000-0000-0000-0000-000000000000" \
  -e TEAMS_TENANT_ID="common" \
  -e TEAMS_MODE="read-only" \
  -- npx -y @dockndevai/mcp-teams
```

Add `-s user` to install it for all your projects, or `-s project` for a shared `.mcp.json`. List with `claude mcp list`, remove with `claude mcp remove teams`.

## Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`) and merge:

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

Restart Claude Desktop. The server appears under the tools (🔨) menu.

## Cursor

Create `.cursor/mcp.json` (or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "teams": {
      "command": "npx",
      "args": ["-y", "@dockndevai/mcp-teams"],
      "env": { "TEAMS_CLIENT_ID": "00000000-0000-0000-0000-000000000000", "TEAMS_TENANT_ID": "common", "TEAMS_MODE": "read-only" }
    }
  }
}
```

Then enable it in **Cursor Settings → MCP**.

## OpenAI Codex CLI

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.teams]
command = "npx"
args = ["-y", "@dockndevai/mcp-teams"]
env = { TEAMS_CLIENT_ID = "00000000-0000-0000-0000-000000000000", TEAMS_TENANT_ID = "common", TEAMS_MODE = "read-only" }
```

## Windsurf

Edit `~/.codeium/windsurf/mcp_config.json` with the same `mcpServers` block as Cursor, then **Refresh** in the Windsurf MCP panel.

## VS Code (GitHub Copilot / Agent mode)

Create `.vscode/mcp.json` (top-level key is `servers`):

```json
{
  "servers": {
    "teams": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dockndevai/mcp-teams"],
      "env": { "TEAMS_CLIENT_ID": "00000000-0000-0000-0000-000000000000", "TEAMS_TENANT_ID": "common", "TEAMS_MODE": "read-only" }
    }
  }
}
```

> **Headless / remote hosts:** interactive sign-in needs a browser on the same machine. On a server, run once locally to populate `~/.mcp-teams/token.json` and copy it over.

## Verify

On startup the server logs a line to **stderr** like:

```
teams-mcp connected [auth=interactive, mode=read-only, tools=9: whoami, list_teams, ...]
```

If credentials are missing it exits with the fix printed to stderr. Ask your agent to *"list the Teams tools"* to confirm.
