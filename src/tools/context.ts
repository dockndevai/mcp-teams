import type { ChatContext, MessageRef } from "../graph/client.js";

/**
 * Extra lines for the human approval prompt describing the object an id points at. Display only: the
 * binding is the confirmer's argument fingerprint (+ version probe where there is an existing object).
 * The lookup is best-effort, so a failed lookup shows "unavailable" rather than blocking the prompt.
 */
type Details = Record<string, string | number | boolean | undefined>;

const snippet = (s: string | undefined, n = 200): string | undefined => {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export function messageDetails(prefix: string, m: MessageRef | undefined): Details {
  if (!m) return { [prefix]: "unavailable" };
  return {
    [`${prefix} from`]: m.from,
    [`${prefix} created`]: m.created,
    [`${prefix} text`]: snippet(m.body),
  };
}

export function chatDetails(c: ChatContext | undefined): Details {
  if (!c) return { chat: "unavailable" };
  return {
    "chat type": c.chatType,
    "chat topic": c.topic,
    "chat members": c.members && c.members.length ? c.members.join(", ") : undefined,
  };
}
