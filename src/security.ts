/**
 * Security policy engine.
 *
 * Flags decide which tools are registered (capability vs. access mode) and whether each individual
 * call is allowed at runtime (team scoping, protected teams, send gating, delete gating, dry-run).
 * Pure logic — fully unit-testable. Defence in depth on top of the Graph token's own scopes/roles.
 */

export type Capability = "read" | "write" | "admin";
export type AccessMode = "read-only" | "read-write" | "admin";

const MODE_RANK: Record<AccessMode, number> = { "read-only": 0, "read-write": 1, admin: 2 };
const CAPABILITY_RANK: Record<Capability, number> = { read: 0, write: 1, admin: 2 };

export interface SecurityConfig {
  mode: AccessMode;
  /** If set, only these teams (by id) may be posted to / moderated. Empty = all. */
  teamAllowlist: string[];
  /** Teams that can be read but never posted to or moderated. */
  protectedTeams: string[];
  /** Posting messages (channel/chat send/reply) requires this to be true, on top of the access mode. */
  allowSend: boolean;
  /** Destructive ops (delete a message) require this to be true. */
  allowDelete: boolean;
  /** Validate + log writes without executing them. */
  dryRun: boolean;
  auditLog: boolean;
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export interface GuardContext {
  tool: string;
  capability: Capability;
  /** Team a call targets (id), when it names one. Chats are not team-scoped. */
  team?: string;
  /** Marks a call that posts a message on the user's behalf. */
  requiresSend?: boolean;
  destructive?: boolean;
}

export class SecurityPolicy {
  constructor(private readonly config: SecurityConfig) {}

  get mode(): AccessMode {
    return this.config.mode;
  }

  isCapabilityEnabled(capability: Capability): boolean {
    return CAPABILITY_RANK[capability] <= MODE_RANK[this.config.mode];
  }

  isTeamAllowed(team: string): boolean {
    if (this.config.teamAllowlist.length === 0) return true;
    return this.config.teamAllowlist.includes(team);
  }
  isTeamProtected(team: string): boolean {
    return this.config.protectedTeams.includes(team);
  }

  guard(ctx: GuardContext): { dryRun: boolean } {
    if (!this.isCapabilityEnabled(ctx.capability)) {
      this.audit(ctx, "DENY", `capability '${ctx.capability}' exceeds mode '${this.config.mode}'`);
      throw new PolicyError(
        `Operation '${ctx.tool}' requires '${ctx.capability}' access but the server runs in '${this.config.mode}' mode. Set TEAMS_MODE to grant it.`,
      );
    }

    if (ctx.team !== undefined && ctx.team !== "" && ctx.capability !== "read") {
      if (!this.isTeamAllowed(ctx.team)) {
        this.audit(ctx, "DENY", `team '${ctx.team}' not in allowlist`);
        throw new PolicyError(`Team '${ctx.team}' is not in the configured allowlist (TEAMS_TEAM_ALLOWLIST).`);
      }
      if (this.isTeamProtected(ctx.team)) {
        this.audit(ctx, "DENY", `team '${ctx.team}' is protected`);
        throw new PolicyError(
          `Team '${ctx.team}' is protected (TEAMS_PROTECTED_TEAMS); it can be read but not posted to or moderated.`,
        );
      }
    }

    if (ctx.requiresSend && !this.config.allowSend) {
      this.audit(ctx, "DENY", "send not enabled");
      throw new PolicyError(
        `Operation '${ctx.tool}' posts a message on your behalf and is disabled. Set TEAMS_ALLOW_SEND=true to enable it.`,
      );
    }

    if (ctx.destructive && !this.config.allowDelete) {
      this.audit(ctx, "DENY", "delete not enabled");
      throw new PolicyError(
        `Destructive operation '${ctx.tool}' is disabled. Set TEAMS_ALLOW_DELETE=true to enable it.`,
      );
    }

    const dryRun = ctx.capability !== "read" && this.config.dryRun;
    this.audit(ctx, dryRun ? "DRY_RUN" : "ALLOW");
    return { dryRun };
  }

  private audit(ctx: GuardContext, decision: string, reason?: string): void {
    if (!this.config.auditLog) return;
    const line = {
      ts: new Date().toISOString(),
      audit: "teams-mcp",
      decision,
      tool: ctx.tool,
      capability: ctx.capability,
      team: ctx.team ?? null,
      requiresSend: ctx.requiresSend ?? false,
      destructive: ctx.destructive ?? false,
      ...(reason ? { reason } : {}),
    };
    process.stderr.write(`${JSON.stringify(line)}\n`);
  }
}
