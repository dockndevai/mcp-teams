/**
 * Thin HTTP client for Microsoft Graph (Microsoft Teams).
 *
 * Tokens come from a `TokenProvider` (interactive browser login, app-only client-credentials, or a
 * static bearer token) — see auth.ts. Every request asks the provider for a fresh token, so silent
 * refresh is transparent here.
 *
 * Covers the joined teams, their channels and channel messages/replies, and 1:1/group chats and
 * their messages. Message bodies can be HTML; they are returned as-is so an agent can read them.
 */
import type { TeamsConnection } from "../config.js";
import { createTokenProvider, type TokenProvider } from "./auth.js";

export class GraphError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export interface TeamRef {
  id: string;
  displayName?: string;
  description?: string;
}

export interface ChannelRef {
  id: string;
  displayName?: string;
  description?: string;
  membershipType?: string;
}

export interface MessageRef {
  id: string;
  from?: string;
  created?: string;
  lastModified?: string;
  importance?: string;
  bodyType?: string;
  body?: string;
  webUrl?: string;
  replyCount?: number;
}

type GraphMessage = {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  importance?: string;
  webUrl?: string;
  from?: { user?: { displayName?: string }; application?: { displayName?: string } };
  body?: { contentType?: string; content?: string };
};

function sender(m: GraphMessage): string | undefined {
  return m.from?.user?.displayName ?? m.from?.application?.displayName;
}

/** Compact a Graph chatMessage down to the fields worth showing. */
export function summarizeMessage(m: GraphMessage): MessageRef {
  return {
    id: m.id,
    from: sender(m),
    created: m.createdDateTime,
    lastModified: m.lastModifiedDateTime,
    importance: m.importance,
    bodyType: m.body?.contentType,
    body: m.body?.content,
    webUrl: m.webUrl,
  };
}

export interface ChatRef {
  id: string;
  topic?: string;
  chatType?: string;
  lastUpdated?: string;
}

export class GraphClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  readonly maxResults: number;
  private readonly tokens: TokenProvider;

  constructor(conn: TeamsConnection) {
    this.base = conn.graphBaseUrl;
    this.timeoutMs = conn.timeoutMs;
    this.maxResults = conn.maxResults;
    this.tokens = createTokenProvider(conn.auth, conn.authorityBase, conn.timeoutMs);
  }

  async ensureAuth(): Promise<void> {
    await this.tokens.getToken();
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokens.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(path.startsWith("http") ? path : `${this.base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) {
        let detail = res.statusText;
        let body: string | undefined;
        try {
          body = await res.text();
          const parsed = JSON.parse(body) as { error?: { message?: string } };
          detail = parsed.error?.message ?? detail;
        } catch {
          /* non-JSON error body */
        }
        throw new GraphError(res.status, detail, body);
      }
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (err) {
      if (err instanceof GraphError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new GraphError(504, `Microsoft Graph did not respond within ${this.timeoutMs / 1000}s.`);
      }
      throw new GraphError(0, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Identity ---
  me() {
    return this.request<Record<string, unknown>>("/me");
  }

  // --- Teams ---
  async listJoinedTeams(): Promise<TeamRef[]> {
    const data = await this.request<{ value: TeamRef[] }>("/me/joinedTeams?$select=id,displayName,description");
    return data.value ?? [];
  }

  async listChannels(teamId: string): Promise<ChannelRef[]> {
    const data = await this.request<{ value: ChannelRef[] }>(
      `/teams/${encodeURIComponent(teamId)}/channels?$select=id,displayName,description,membershipType`,
    );
    return data.value ?? [];
  }

  async listTeamMembers(teamId: string): Promise<Array<Record<string, unknown>>> {
    const data = await this.request<{ value: Array<Record<string, unknown>> }>(
      `/teams/${encodeURIComponent(teamId)}/members`,
    );
    return data.value ?? [];
  }

  // --- Channel messages ---
  async listChannelMessages(teamId: string, channelId: string, top?: number): Promise<MessageRef[]> {
    const n = Math.min(this.maxResults, top ?? this.maxResults);
    const data = await this.request<{ value: GraphMessage[] }>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?$top=${n}`,
    );
    return (data.value ?? []).map(summarizeMessage);
  }

  async getChannelMessage(teamId: string, channelId: string, messageId: string): Promise<MessageRef> {
    const m = await this.request<GraphMessage>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    );
    return summarizeMessage(m);
  }

  async listMessageReplies(teamId: string, channelId: string, messageId: string, top?: number): Promise<MessageRef[]> {
    const n = Math.min(this.maxResults, top ?? this.maxResults);
    const data = await this.request<{ value: GraphMessage[] }>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies?$top=${n}`,
    );
    return (data.value ?? []).map(summarizeMessage);
  }

  sendChannelMessage(teamId: string, channelId: string, body: string, html = false) {
    return this.request<GraphMessage>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
      { method: "POST", body: JSON.stringify({ body: { contentType: html ? "html" : "text", content: body } }) },
    );
  }

  replyToChannelMessage(teamId: string, channelId: string, messageId: string, body: string, html = false) {
    return this.request<GraphMessage>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`,
      { method: "POST", body: JSON.stringify({ body: { contentType: html ? "html" : "text", content: body } }) },
    );
  }

  // Soft-delete a channel message (recoverable). Requires the message be the user's own.
  softDeleteChannelMessage(teamId: string, channelId: string, messageId: string) {
    return this.request<void>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/softDelete`,
      { method: "POST" },
    );
  }

  // --- Chats ---
  async listChats(top?: number): Promise<ChatRef[]> {
    const n = Math.min(this.maxResults, top ?? this.maxResults);
    const data = await this.request<{ value: Array<{ id: string; topic?: string; chatType?: string; lastUpdatedDateTime?: string }> }>(
      `/me/chats?$top=${n}&$select=id,topic,chatType,lastUpdatedDateTime`,
    );
    return (data.value ?? []).map((c) => ({ id: c.id, topic: c.topic, chatType: c.chatType, lastUpdated: c.lastUpdatedDateTime }));
  }

  async listChatMessages(chatId: string, top?: number): Promise<MessageRef[]> {
    const n = Math.min(this.maxResults, top ?? this.maxResults);
    const data = await this.request<{ value: GraphMessage[] }>(
      `/me/chats/${encodeURIComponent(chatId)}/messages?$top=${n}`,
    );
    return (data.value ?? []).map(summarizeMessage);
  }

  sendChatMessage(chatId: string, body: string, html = false) {
    return this.request<GraphMessage>(`/me/chats/${encodeURIComponent(chatId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: { contentType: html ? "html" : "text", content: body } }),
    });
  }
}
