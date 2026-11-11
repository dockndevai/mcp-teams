import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../src/config.js";
import { GraphClient, versionToken } from "../src/graph/client.js";
import { buildServer } from "../src/server.js";

const config = (requireHumanApproval = false): AppConfig => ({
  connection: {
    graphBaseUrl: "https://graph.test/v1.0",
    authorityBase: "https://login.test",
    auth: { mode: "token", token: "t", tenantId: "common", scopes: [], tokenCachePath: "/dev/null", redirectPort: 0 },
    timeoutMs: 1000,
    maxResults: 25,
  } as AppConfig["connection"],
  security: {
    mode: "admin",
    teamAllowlist: [],
    protectedTeams: [],
    allowSend: true,
    allowDelete: true,
    dryRun: false,
    auditLog: false,
    requireHumanApproval,
  },
});

type Answer = { action: "accept" | "decline"; content?: Record<string, unknown> };

/** Connect an in-memory MCP client (optionally able to answer elicitation) to a freshly built server. */
async function connect(opts: { requireHuman?: boolean; answer?: (message: string) => Answer | Promise<Answer>; elicits?: boolean }) {
  const { server } = buildServer(config(opts.requireHuman));
  const prompts: string[] = [];
  const client = new Client({ name: "t", version: "0" }, { capabilities: opts.elicits === false ? {} : { elicitation: {} } });
  if (opts.elicits !== false) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      prompts.push(req.params.message);
      return (await opts.answer?.(req.params.message)) ?? { action: "accept", content: { confirm: true } };
    });
  }
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, prompts };
}

const text = (r: unknown) => ((r as { content: Array<{ text: string }> }).content[0]?.text ?? "");

/** Successive values for a version probe: first read (before the prompt), then second (after the human answered). */
const sequence = (...vs: Array<string | undefined>) => {
  const q = [...vs];
  return async () => q.shift();
};

const delArgs = { team_id: "T1", channel_id: "C1", message_id: "M1" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("delete_channel_message approval (end to end)", () => {
  it("shows the tool, exact arguments, version and fingerprint, then deletes", async () => {
    vi.spyOn(GraphClient.prototype, "channelMessageContext").mockResolvedValue({ id: "M1", from: "Alice", body: "launch plan" });
    vi.spyOn(GraphClient.prototype, "channelMessageVersion").mockResolvedValue("v1");
    const del = vi.spyOn(GraphClient.prototype, "softDeleteChannelMessage").mockResolvedValue();
    const { client, prompts } = await connect({});
    const res = await client.callTool({ name: "delete_channel_message", arguments: delArgs });
    expect(text(res)).toContain('"deleted": "M1"');
    expect(del).toHaveBeenCalledWith("T1", "C1", "M1");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("tool: delete_channel_message");
    expect(prompts[0]).toContain('"message_id":"M1"');
    expect(prompts[0]).toContain("message from: Alice");
    expect(prompts[0]).toContain("resource version: v1");
    expect(prompts[0]).toMatch(/fingerprint: [0-9a-f]{16}/);
  });

  it("does NOT delete when the message changed while the human was deciding", async () => {
    vi.spyOn(GraphClient.prototype, "channelMessageContext").mockResolvedValue(undefined);
    vi.spyOn(GraphClient.prototype, "channelMessageVersion").mockImplementation(sequence("v1", "v2"));
    const del = vi.spyOn(GraphClient.prototype, "softDeleteChannelMessage").mockResolvedValue();
    const { client } = await connect({});
    const res = await client.callTool({ name: "delete_channel_message", arguments: delArgs });
    expect(text(res)).toContain("resource changed since the prompt");
    expect(del).not.toHaveBeenCalled();
  });

  it("does NOT delete when the message disappeared while the human was deciding", async () => {
    vi.spyOn(GraphClient.prototype, "channelMessageContext").mockResolvedValue(undefined);
    vi.spyOn(GraphClient.prototype, "channelMessageVersion").mockImplementation(sequence("v1", undefined));
    const del = vi.spyOn(GraphClient.prototype, "softDeleteChannelMessage").mockResolvedValue();
    const { client } = await connect({});
    const res = await client.callTool({ name: "delete_channel_message", arguments: delArgs });
    expect(text(res)).toContain("resource changed since the prompt");
    expect(del).not.toHaveBeenCalled();
  });

  it("does NOT delete when the human declines", async () => {
    vi.spyOn(GraphClient.prototype, "channelMessageContext").mockResolvedValue(undefined);
    vi.spyOn(GraphClient.prototype, "channelMessageVersion").mockResolvedValue("v1");
    const del = vi.spyOn(GraphClient.prototype, "softDeleteChannelMessage").mockResolvedValue();
    const { client } = await connect({ answer: () => ({ action: "decline" }) });
    await client.callTool({ name: "delete_channel_message", arguments: delArgs });
    expect(del).not.toHaveBeenCalled();
  });
});

describe("posting approvals (end to end)", () => {
  it("send_channel_message shows team, channel, the full message and a fingerprint, then posts", async () => {
    const send = vi.spyOn(GraphClient.prototype, "sendChannelMessage").mockResolvedValue({ id: "new" });
    const { client, prompts } = await connect({});
    await client.callTool({ name: "send_channel_message", arguments: { team_id: "T1", channel_id: "C1", message: "Ship it on Friday" } });
    expect(send).toHaveBeenCalledWith("T1", "C1", "Ship it on Friday", false);
    const p = prompts[0]!;
    expect(p).toContain("tool: send_channel_message");
    expect(p).toContain("Ship it on Friday");
    expect(p).toContain("team: T1");
    expect(p).toContain("channel: C1");
    expect(p).toMatch(/fingerprint: [0-9a-f]{16}/);
  });

  it("keeps the team and channel visible even when the message is far longer than the display limit", async () => {
    vi.spyOn(GraphClient.prototype, "sendChannelMessage").mockResolvedValue({ id: "new" });
    const { client, prompts } = await connect({});
    await client.callTool({ name: "send_channel_message", arguments: { team_id: "T1", channel_id: "C1", message: "x".repeat(6000) } });
    const p = prompts[0]!;
    expect(p).toContain("… (+"); // the argument dump is truncated…
    expect(p).toContain("team: T1"); // …but the destination is shown outside it
    expect(p).toContain("channel: C1");
    expect(p).toContain("message length: 6000 chars");
  });

  it("different arguments give a different fingerprint", async () => {
    vi.spyOn(GraphClient.prototype, "sendChatMessage").mockResolvedValue({ id: "new" });
    vi.spyOn(GraphClient.prototype, "chatContext").mockResolvedValue({ chatType: "oneOnOne", members: ["Bob"] });
    const { client, prompts } = await connect({});
    await client.callTool({ name: "send_chat_message", arguments: { chat_id: "CH1", message: "hi" } });
    await client.callTool({ name: "send_chat_message", arguments: { chat_id: "CH2", message: "hi" } });
    const fp = (s: string) => /fingerprint: ([0-9a-f]{16})/.exec(s)?.[1];
    expect(fp(prompts[0]!)).toBeDefined();
    expect(fp(prompts[0]!)).not.toBe(fp(prompts[1]!));
    expect(prompts[0]).toContain("chat members: Bob");
  });

  it("reply_channel_message shows the parent message it replies to", async () => {
    vi.spyOn(GraphClient.prototype, "channelMessageContext").mockResolvedValue({ id: "P1", from: "Carol", body: "<p>can we move the date?</p>" });
    const reply = vi.spyOn(GraphClient.prototype, "replyToChannelMessage").mockResolvedValue({ id: "r" });
    const { client, prompts } = await connect({});
    await client.callTool({ name: "reply_channel_message", arguments: { team_id: "T1", channel_id: "C1", message_id: "P1", message: "yes" } });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(prompts[0]).toContain("parent from: Carol");
  });

  it("does NOT post when the human declines", async () => {
    const send = vi.spyOn(GraphClient.prototype, "sendChannelMessage").mockResolvedValue({ id: "new" });
    const chat = vi.spyOn(GraphClient.prototype, "sendChatMessage").mockResolvedValue({ id: "new" });
    vi.spyOn(GraphClient.prototype, "chatContext").mockResolvedValue(undefined);
    const { client } = await connect({ answer: () => ({ action: "decline" }) });
    const r1 = await client.callTool({ name: "send_channel_message", arguments: { team_id: "T1", channel_id: "C1", message: "m" } });
    await client.callTool({ name: "send_chat_message", arguments: { chat_id: "CH1", message: "m" } });
    expect(text(r1)).toContain("Post cancelled");
    expect(send).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("TEAMS_REQUIRE_HUMAN_APPROVAL", () => {
  it("falls back to the flags when the client cannot elicit (default)", async () => {
    vi.spyOn(GraphClient.prototype, "channelMessageContext").mockResolvedValue(undefined);
    vi.spyOn(GraphClient.prototype, "channelMessageVersion").mockResolvedValue("v1");
    const del = vi.spyOn(GraphClient.prototype, "softDeleteChannelMessage").mockResolvedValue();
    const { client } = await connect({ elicits: false });
    await client.callTool({ name: "delete_channel_message", arguments: delArgs });
    expect(del).toHaveBeenCalledWith("T1", "C1", "M1");
  });

  it("refuses to delete when the client cannot elicit and human approval is required", async () => {
    vi.spyOn(GraphClient.prototype, "channelMessageContext").mockResolvedValue(undefined);
    vi.spyOn(GraphClient.prototype, "channelMessageVersion").mockResolvedValue("v1");
    const del = vi.spyOn(GraphClient.prototype, "softDeleteChannelMessage").mockResolvedValue();
    const { client } = await connect({ elicits: false, requireHuman: true });
    const res = await client.callTool({ name: "delete_channel_message", arguments: delArgs });
    expect(text(res)).toContain("no human approval channel");
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses to post when the client cannot elicit and human approval is required", async () => {
    const send = vi.spyOn(GraphClient.prototype, "sendChannelMessage").mockResolvedValue({ id: "new" });
    const { client } = await connect({ elicits: false, requireHuman: true });
    const res = await client.callTool({ name: "send_channel_message", arguments: { team_id: "T1", channel_id: "C1", message: "m" } });
    expect(text(res)).toContain("no human approval channel");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("Graph version probe", () => {
  const client = () => new GraphClient(config().connection);
  const reply = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => JSON.stringify(body),
  });
  const msg = (over: Record<string, unknown>) => ({ id: "M1", etag: "1700000000000", lastModifiedDateTime: "2026-01-01T00:00:00Z", deletedDateTime: null, ...over });

  it("is stable while the message is untouched and moves on an edit, a reaction or a delete", async () => {
    vi.stubGlobal("fetch", async () => reply(200, msg({})));
    const a = await client().channelMessageVersion("T1", "C1", "M1");
    const same = await client().channelMessageVersion("T1", "C1", "M1");
    expect(same).toBe(a);
    vi.stubGlobal("fetch", async () => reply(200, msg({ etag: "1700000009999" })));
    expect(await client().channelMessageVersion("T1", "C1", "M1")).not.toBe(a);
    vi.stubGlobal("fetch", async () => reply(200, msg({ lastModifiedDateTime: "2026-01-02T00:00:00Z" })));
    expect(await client().channelMessageVersion("T1", "C1", "M1")).not.toBe(a);
    vi.stubGlobal("fetch", async () => reply(200, msg({ deletedDateTime: "2026-01-03T00:00:00Z" })));
    expect(await client().channelMessageVersion("T1", "C1", "M1")).not.toBe(a);
  });

  it("is bound to team and channel, not just the message id", async () => {
    vi.stubGlobal("fetch", async () => reply(200, msg({})));
    const a = await client().channelMessageVersion("T1", "C1", "M1");
    expect(await client().channelMessageVersion("T2", "C1", "M1")).not.toBe(a);
    expect(await client().channelMessageVersion("T1", "C2", "M1")).not.toBe(a);
    expect(a).toBe(versionToken("T1/C1/M1", "1700000000000|2026-01-01T00:00:00Z|"));
  });

  it("returns undefined for a 404 and throws on transport errors", async () => {
    vi.stubGlobal("fetch", async () => reply(404, { error: { message: "not found" } }));
    expect(await client().channelMessageVersion("T1", "C1", "gone")).toBeUndefined();
    vi.stubGlobal("fetch", async () => reply(500, { error: { message: "boom" } }));
    await expect(client().channelMessageVersion("T1", "C1", "M1")).rejects.toThrow("boom");
  });
});
