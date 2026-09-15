/**
 * Configuration from environment variables.
 *
 * Auth is Microsoft Graph. Three ways to authenticate, chosen automatically in this priority order:
 *
 *   1. **interactive** (default) — no secret configured. On first use the server opens your browser
 *      to the Microsoft sign-in page, you approve once, and it caches the resulting token (with a
 *      refresh token) on disk. Subsequent runs refresh silently. This is the `az login` model: the
 *      server never sees your password. Needs only TEAMS_CLIENT_ID (a public-client app registration
 *      with the redirect URI http://localhost).
 *   2. **client-credentials** (app-only, for automation) — TEAMS_TENANT_ID + TEAMS_CLIENT_ID +
 *      TEAMS_CLIENT_SECRET. The server fetches and caches an app token itself.
 *   3. **static token** — TEAMS_TOKEN, a pre-obtained Graph bearer token.
 *
 * Most Teams messaging APIs are delegated-only, so interactive is the primary mode. Channel/chat
 * reads and posts run as the signed-in user.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { AccessMode, SecurityConfig } from "./security.js";

export type AuthMode = "interactive" | "client-credentials" | "token";

/** Default delegated scopes for interactive login. offline_access yields a refresh token. */
const DEFAULT_SCOPES = [
  "offline_access",
  "User.Read",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Chat.ReadWrite",
];

export interface GraphAuth {
  mode: AuthMode;
  token?: string;
  tenantId: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string[];
  tokenCachePath: string;
  redirectPort: number;
}

export interface TeamsConnection {
  graphBaseUrl: string;
  authorityBase: string;
  auth: GraphAuth;
  timeoutMs: number;
  maxResults: number;
}

export interface AppConfig {
  connection: TeamsConnection;
  security: SecurityConfig;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function list(name: string): string[] {
  const v = process.env[name];
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseMode(): AccessMode {
  const raw = (process.env.TEAMS_MODE ?? "read-only").toLowerCase();
  if (raw === "read-only" || raw === "read-write" || raw === "admin") return raw;
  throw new Error(`Invalid TEAMS_MODE '${raw}'. Expected one of: read-only, read-write, admin.`);
}

function resolveAuthMode(): AuthMode {
  const explicit = process.env.TEAMS_AUTH?.trim().toLowerCase();
  if (explicit === "interactive" || explicit === "client-credentials" || explicit === "token") {
    return explicit;
  }
  if (explicit) {
    throw new Error(`Invalid TEAMS_AUTH '${explicit}'. Expected one of: interactive, client-credentials, token.`);
  }
  if (process.env.TEAMS_TOKEN?.trim()) return "token";
  if (process.env.TEAMS_CLIENT_SECRET?.trim()) return "client-credentials";
  return "interactive";
}

export function loadConfig(): AppConfig {
  const scopes = list("TEAMS_SCOPES");
  return {
    connection: {
      graphBaseUrl: (process.env.TEAMS_GRAPH_BASE || "https://graph.microsoft.com/v1.0").replace(/\/$/, ""),
      authorityBase: (process.env.TEAMS_AUTHORITY || "https://login.microsoftonline.com").replace(/\/$/, ""),
      auth: {
        mode: resolveAuthMode(),
        token: process.env.TEAMS_TOKEN?.trim() || undefined,
        tenantId: process.env.TEAMS_TENANT_ID?.trim() || "common",
        clientId: process.env.TEAMS_CLIENT_ID?.trim() || undefined,
        clientSecret: process.env.TEAMS_CLIENT_SECRET?.trim() || undefined,
        scopes: scopes.length ? scopes : DEFAULT_SCOPES,
        tokenCachePath: process.env.TEAMS_TOKEN_CACHE?.trim() || join(homedir(), ".mcp-teams", "token.json"),
        redirectPort: Math.max(0, Number(process.env.TEAMS_REDIRECT_PORT ?? 0)),
      },
      timeoutMs: Number(process.env.TEAMS_TIMEOUT_MS ?? 30000),
      maxResults: Math.max(1, Math.min(200, Number(process.env.TEAMS_MAX_RESULTS ?? 25))),
    },
    security: {
      mode: parseMode(),
      teamAllowlist: list("TEAMS_TEAM_ALLOWLIST"),
      protectedTeams: list("TEAMS_PROTECTED_TEAMS"),
      allowSend: bool("TEAMS_ALLOW_SEND", false),
      allowDelete: bool("TEAMS_ALLOW_DELETE", false),
      dryRun: bool("TEAMS_DRY_RUN", false),
      auditLog: bool("TEAMS_AUDIT_LOG", true),
    },
  };
}

export function hasCredentials(c: TeamsConnection): boolean {
  const a = c.auth;
  switch (a.mode) {
    case "token":
      return Boolean(a.token);
    case "client-credentials":
      return Boolean(a.tenantId && a.clientId && a.clientSecret);
    case "interactive":
      return Boolean(a.clientId);
  }
}

export function missingCredentialHint(c: TeamsConnection): string {
  switch (c.auth.mode) {
    case "token":
      return "Set TEAMS_TOKEN to a Microsoft Graph bearer token.";
    case "client-credentials":
      return "Set TEAMS_TENANT_ID, TEAMS_CLIENT_ID and TEAMS_CLIENT_SECRET.";
    case "interactive":
      return "Set TEAMS_CLIENT_ID to a public-client app registration (redirect URI http://localhost) so the server can open a browser to sign you in.";
  }
}
