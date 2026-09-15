import { describe, expect, it } from "vitest";
import { PolicyError, SecurityPolicy, type SecurityConfig } from "../src/security.js";

function makePolicy(overrides: Partial<SecurityConfig> = {}): SecurityPolicy {
  return new SecurityPolicy({
    mode: "read-only",
    teamAllowlist: [],
    protectedTeams: ["exec-team"],
    allowSend: false,
    allowDelete: false,
    dryRun: false,
    auditLog: false,
    ...overrides,
  });
}

describe("capability gating", () => {
  it("read-only enables read only", () => {
    const p = makePolicy();
    expect(p.isCapabilityEnabled("read")).toBe(true);
    expect(p.isCapabilityEnabled("write")).toBe(false);
    expect(p.isCapabilityEnabled("admin")).toBe(false);
  });
  it("read-write enables read and write but not admin", () => {
    const p = makePolicy({ mode: "read-write" });
    expect(p.isCapabilityEnabled("write")).toBe(true);
    expect(p.isCapabilityEnabled("admin")).toBe(false);
  });
});

describe("mode vs capability at guard time", () => {
  it("rejects a write in read-only mode", () => {
    const p = makePolicy();
    expect(() => p.guard({ tool: "send_channel_message", capability: "write", requiresSend: true })).toThrow(PolicyError);
  });
  it("rejects admin in read-write mode", () => {
    const p = makePolicy({ mode: "read-write" });
    expect(() => p.guard({ tool: "delete_channel_message", capability: "admin", destructive: true })).toThrow(/admin/);
  });
});

describe("team allowlist + protection", () => {
  it("blocks posts to teams outside a non-empty allowlist", () => {
    const p = makePolicy({ mode: "read-write", allowSend: true, teamAllowlist: ["team-a"] });
    expect(() =>
      p.guard({ tool: "send_channel_message", capability: "write", team: "team-b", requiresSend: true }),
    ).toThrow(/allowlist/);
  });
  it("allows reading a protected team but not posting to it", () => {
    const p = makePolicy({ mode: "read-write", allowSend: true });
    expect(() => p.guard({ tool: "list_channels", capability: "read", team: "exec-team" })).not.toThrow();
    expect(() =>
      p.guard({ tool: "send_channel_message", capability: "write", team: "exec-team", requiresSend: true }),
    ).toThrow(/protected/);
  });
});

describe("send gating", () => {
  it("blocks posting without allowSend even in read-write mode", () => {
    const p = makePolicy({ mode: "read-write" });
    expect(() => p.guard({ tool: "send_chat_message", capability: "write", requiresSend: true })).toThrow(/ALLOW_SEND/);
  });
  it("permits posting with allowSend", () => {
    const p = makePolicy({ mode: "read-write", allowSend: true });
    expect(() => p.guard({ tool: "send_chat_message", capability: "write", requiresSend: true })).not.toThrow();
  });
});

describe("delete gating", () => {
  it("blocks delete without allowDelete even in admin mode", () => {
    const p = makePolicy({ mode: "admin" });
    expect(() => p.guard({ tool: "delete_channel_message", capability: "admin", destructive: true })).toThrow(/ALLOW_DELETE/);
  });
  it("permits delete with allowDelete", () => {
    const p = makePolicy({ mode: "admin", allowDelete: true });
    expect(() => p.guard({ tool: "delete_channel_message", capability: "admin", destructive: true })).not.toThrow();
  });
});

describe("dry run", () => {
  it("flags writes but not reads", () => {
    const p = makePolicy({ mode: "read-write", allowSend: true, dryRun: true });
    expect(p.guard({ tool: "list_channel_messages", capability: "read" }).dryRun).toBe(false);
    expect(p.guard({ tool: "send_chat_message", capability: "write", requiresSend: true }).dryRun).toBe(true);
  });
});
