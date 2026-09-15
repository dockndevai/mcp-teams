import { z } from "zod";
import type { ToolDef } from "./types.js";
import { jsonResult, textResult } from "./types.js";

/**
 * Admin tools. Registered only in `admin` mode, gated behind TEAMS_ALLOW_DELETE=true, plus a human
 * confirmation via elicitation. Graph's softDelete hides the message but keeps it recoverable, which
 * is the safe default — you can only delete your own messages, and only in an allowed, non-protected
 * team.
 */
export const adminTools: ToolDef[] = [
  {
    name: "delete_channel_message",
    capability: "admin",
    destructive: true,
    config: {
      title: "Delete a channel message",
      description:
        "Soft-delete one of your own channel messages (hidden but recoverable). Requires admin mode and " +
        "TEAMS_ALLOW_DELETE=true, and prompts for human confirmation. Subject to the team allowlist / protected teams.",
      inputSchema: {
        team_id: z.string().describe("Team id (from list_teams)"),
        channel_id: z.string().describe("Channel id (from list_channels)"),
        message_id: z.string().min(1).describe("Message id (from list_channel_messages)"),
      },
    },
    handler: async (a, { client, policy, confirm }) => {
      const team = a.team_id as string;
      const messageId = a.message_id as string;
      const { dryRun } = policy.guard({ tool: "delete_channel_message", capability: "admin", destructive: true, team });
      if (dryRun) return textResult(`[dry-run] Would soft-delete message ${messageId} in team ${team}.`);
      const ok = await confirm.confirm({ action: "delete channel message", target: messageId, details: { team } });
      if (!ok.approved) return textResult(`Deletion cancelled — ${ok.reason}.`);
      await client.softDeleteChannelMessage(team, a.channel_id as string, messageId);
      return jsonResult({ deleted: messageId, note: "Soft-deleted (recoverable)." });
    },
  },
];
