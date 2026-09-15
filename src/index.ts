#!/usr/bin/env node
/**
 * MCP server for Microsoft Teams (Microsoft Graph).
 *
 * Lets an agent read and operate Teams — list joined teams, channels and members, read channel
 * messages and their threaded replies, read 1:1/group chats and their messages, and (in higher
 * modes) post channel messages, reply in threads, send chat messages, and soft-delete a message.
 *
 * Auth is browser-first: on first run with only TEAMS_CLIENT_ID set, the server opens your browser
 * to the Microsoft sign-in page (authorization-code + PKCE), caches the token, and refreshes it
 * silently thereafter. App-only (client-credentials) and static-token modes are also supported.
 *
 * Safe by default: starts in read-only mode, so only the read tools are registered. Writes need
 * TEAMS_MODE=read-write; posting messages additionally needs TEAMS_ALLOW_SEND=true; deletes need
 * admin mode plus TEAMS_ALLOW_DELETE=true. The access model (src/security.ts) is defence in depth
 * over the Graph token's own scopes.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { hasCredentials, loadConfig, missingCredentialHint } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig();

if (!hasCredentials(config.connection)) {
  process.stderr.write(`mcp-teams: no usable credentials. ${missingCredentialHint(config.connection)}\n`);
  process.exit(1);
}

const { server, enabled } = buildServer(config);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout carries the protocol; diagnostics go to stderr.
process.stderr.write(
  `teams-mcp connected [auth=${config.connection.auth.mode}, mode=${config.security.mode}, ` +
    `tools=${enabled.length}: ${enabled.join(", ")}]\n`,
);
