import { z } from "zod";
import type { ToolDef } from "./types.js";
import { jsonResult, textResult } from "./types.js";

/**
 * Write tools. Registered only in `read-write` mode and up. Every one posts a message on the user's
 * behalf, so all are gated by TEAMS_ALLOW_SEND=true *and* pause for a human confirmation via
 * elicitation — a posted message is visible to others and can't be silently un-posted.
 */

const teamId = z.string().describe("Team id (from list_teams)");
const channelId = z.string().describe("Channel id (from list_channels)");
const message = z.string().min(1).describe("Message text");
const html = z.boolean().optional().describe("Treat the message as HTML instead of plain text");

export const writeTools: ToolDef[] = [
  {
    name: "send_channel_message",
    capability: "write",
    requiresSend: true,
    config: {
      title: "Post a channel message",
      description:
        "Post a new top-level message to a channel. Gated by TEAMS_ALLOW_SEND=true and a human confirmation. The target " +
        "team is subject to the team allowlist / protected-teams rules.",
      inputSchema: { team_id: teamId, channel_id: channelId, message, html },
    },
    handler: async (a, { client, policy, confirm }) => {
      const team = a.team_id as string;
      const { dryRun } = policy.guard({ tool: "send_channel_message", capability: "write", team, requiresSend: true });
      if (dryRun) return textResult(`[dry-run] Would post to channel ${a.channel_id as string} in team ${team}.`);
      const ok = await confirm.confirm({
        action: "post channel message",
        target: `team ${team} / channel ${a.channel_id as string}`,
        details: { preview: (a.message as string).slice(0, 80) },
      });
      if (!ok.approved) return textResult(`Post cancelled — ${ok.reason}.`);
      return jsonResult(await client.sendChannelMessage(team, a.channel_id as string, a.message as string, Boolean(a.html)));
    },
  },
  {
    name: "reply_channel_message",
    capability: "write",
    requiresSend: true,
    config: {
      title: "Reply to a channel message",
      description:
        "Reply to an existing channel message's thread. Gated by TEAMS_ALLOW_SEND=true and a human confirmation.",
      inputSchema: {
        team_id: teamId,
        channel_id: channelId,
        message_id: z.string().describe("Parent message id (from list_channel_messages)"),
        message,
        html,
      },
    },
    handler: async (a, { client, policy, confirm }) => {
      const team = a.team_id as string;
      const { dryRun } = policy.guard({ tool: "reply_channel_message", capability: "write", team, requiresSend: true });
      if (dryRun) return textResult(`[dry-run] Would reply to message ${a.message_id as string} in team ${team}.`);
      const ok = await confirm.confirm({
        action: "reply to channel message",
        target: `message ${a.message_id as string}`,
        details: { preview: (a.message as string).slice(0, 80) },
      });
      if (!ok.approved) return textResult(`Reply cancelled — ${ok.reason}.`);
      return jsonResult(
        await client.replyToChannelMessage(team, a.channel_id as string, a.message_id as string, a.message as string, Boolean(a.html)),
      );
    },
  },
  {
    name: "send_chat_message",
    capability: "write",
    requiresSend: true,
    config: {
      title: "Send a chat message",
      description:
        "Send a message to an existing 1:1 or group chat (by id from list_chats). Gated by TEAMS_ALLOW_SEND=true and a " +
        "human confirmation. Chats are not team-scoped, so the team allowlist does not apply here.",
      inputSchema: { chat_id: z.string().describe("Chat id (from list_chats)"), message, html },
    },
    handler: async (a, { client, policy, confirm }) => {
      const { dryRun } = policy.guard({ tool: "send_chat_message", capability: "write", requiresSend: true });
      const chatId = a.chat_id as string;
      if (dryRun) return textResult(`[dry-run] Would send a message to chat ${chatId}.`);
      const ok = await confirm.confirm({
        action: "send chat message",
        target: `chat ${chatId}`,
        details: { preview: (a.message as string).slice(0, 80) },
      });
      if (!ok.approved) return textResult(`Send cancelled — ${ok.reason}.`);
      return jsonResult(await client.sendChatMessage(chatId, a.message as string, Boolean(a.html)));
    },
  },
];
