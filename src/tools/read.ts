import { z } from "zod";
import type { ToolDef } from "./types.js";
import { jsonResult } from "./types.js";

const teamId = z.string().describe("Team id (from list_teams)");
const channelId = z.string().describe("Channel id (from list_channels)");

export const readTools: ToolDef[] = [
  {
    name: "whoami",
    capability: "read",
    config: {
      title: "Who am I",
      description:
        "Return the signed-in user's identity (display name, user principal name, id). Use this to confirm which account " +
        "the server is operating as before reading or posting.",
      inputSchema: {},
    },
    handler: async (_a, { client, policy }) => {
      policy.guard({ tool: "whoami", capability: "read" });
      const me = (await client.me()) as Record<string, unknown>;
      return jsonResult({
        id: me.id,
        displayName: me.displayName,
        userPrincipalName: me.userPrincipalName ?? me.mail,
        mail: me.mail,
      });
    },
  },
  {
    name: "list_teams",
    capability: "read",
    config: {
      title: "List joined teams",
      description:
        "List the teams the signed-in user is a member of, with their ids, display names, and descriptions. Start here " +
        "to get a team id for list_channels.",
      inputSchema: {},
    },
    handler: async (_a, { client, policy }) => {
      policy.guard({ tool: "list_teams", capability: "read" });
      return jsonResult(await client.listJoinedTeams());
    },
  },
  {
    name: "list_channels",
    capability: "read",
    config: {
      title: "List channels",
      description: "List the channels in a team, with their ids, display names, and membership type (standard/private/shared).",
      inputSchema: { team_id: teamId },
    },
    handler: async (a, { client, policy }) => {
      policy.guard({ tool: "list_channels", capability: "read", team: a.team_id as string });
      return jsonResult(await client.listChannels(a.team_id as string));
    },
  },
  {
    name: "list_team_members",
    capability: "read",
    config: {
      title: "List team members",
      description: "List the members of a team (display name, email, roles).",
      inputSchema: { team_id: teamId },
    },
    handler: async (a, { client, policy }) => {
      policy.guard({ tool: "list_team_members", capability: "read", team: a.team_id as string });
      return jsonResult(await client.listTeamMembers(a.team_id as string));
    },
  },
  {
    name: "list_channel_messages",
    capability: "read",
    config: {
      title: "List channel messages",
      description:
        "List the top-level messages in a channel, most recent first. Returns compact summaries (id, from, created, body, " +
        "webUrl). Use list_message_replies for a message's thread.",
      inputSchema: {
        team_id: teamId,
        channel_id: channelId,
        top: z.number().int().min(1).max(200).optional().describe("Maximum messages (capped by TEAMS_MAX_RESULTS)"),
      },
    },
    handler: async (a, { client, policy }) => {
      policy.guard({ tool: "list_channel_messages", capability: "read", team: a.team_id as string });
      return jsonResult(await client.listChannelMessages(a.team_id as string, a.channel_id as string, a.top as number | undefined));
    },
  },
  {
    name: "get_channel_message",
    capability: "read",
    config: {
      title: "Get channel message",
      description: "Fetch a single channel message by id, with its full body and metadata.",
      inputSchema: { team_id: teamId, channel_id: channelId, message_id: z.string().describe("Message id (from list_channel_messages)") },
    },
    handler: async (a, { client, policy }) => {
      policy.guard({ tool: "get_channel_message", capability: "read", team: a.team_id as string });
      return jsonResult(await client.getChannelMessage(a.team_id as string, a.channel_id as string, a.message_id as string));
    },
  },
  {
    name: "list_message_replies",
    capability: "read",
    config: {
      title: "List message replies",
      description: "List the replies in a channel message's thread, most recent first.",
      inputSchema: {
        team_id: teamId,
        channel_id: channelId,
        message_id: z.string().describe("Parent message id (from list_channel_messages)"),
        top: z.number().int().min(1).max(200).optional().describe("Maximum replies (capped by TEAMS_MAX_RESULTS)"),
      },
    },
    handler: async (a, { client, policy }) => {
      policy.guard({ tool: "list_message_replies", capability: "read", team: a.team_id as string });
      return jsonResult(
        await client.listMessageReplies(a.team_id as string, a.channel_id as string, a.message_id as string, a.top as number | undefined),
      );
    },
  },
  {
    name: "list_chats",
    capability: "read",
    config: {
      title: "List chats",
      description: "List the signed-in user's 1:1 and group chats (id, topic, type, last updated). Use a chat id with list_chat_messages.",
      inputSchema: {
        top: z.number().int().min(1).max(200).optional().describe("Maximum chats (capped by TEAMS_MAX_RESULTS)"),
      },
    },
    handler: async (a, { client, policy }) => {
      policy.guard({ tool: "list_chats", capability: "read" });
      return jsonResult(await client.listChats(a.top as number | undefined));
    },
  },
  {
    name: "list_chat_messages",
    capability: "read",
    config: {
      title: "List chat messages",
      description: "List the messages in a 1:1 or group chat, most recent first. Returns compact summaries.",
      inputSchema: {
        chat_id: z.string().describe("Chat id (from list_chats)"),
        top: z.number().int().min(1).max(200).optional().describe("Maximum messages (capped by TEAMS_MAX_RESULTS)"),
      },
    },
    handler: async (a, { client, policy }) => {
      policy.guard({ tool: "list_chat_messages", capability: "read" });
      return jsonResult(await client.listChatMessages(a.chat_id as string, a.top as number | undefined));
    },
  },
];
