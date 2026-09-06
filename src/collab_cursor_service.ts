import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";

const cursorInput = z.object({ tenantId: z.string().min(1), accountId: z.string().min(1), documentId: z.string().min(1), x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });
export type CursorInput = z.infer<typeof cursorInput>;

export async function publishCursor(input: CursorInput, client = new InfraiClient()) {
  const cursor = cursorInput.parse(input);
  const channel = `tenant:${cursor.tenantId}:document:${cursor.documentId}`;
  await client.request("/v1/realtime/channel/create", { channel, type: "presence", vendor: "liveblocks" });
  // realtime.publish carries the tenant-scoped cursor event.
  await client.request("/v1/realtime/publish", { channel, event: "cursor.moved", data: { x: cursor.x, y: cursor.y }, account_id: cursor.accountId });
  return { channel, event: "cursor.moved", accountId: cursor.accountId, position: { x: cursor.x, y: cursor.y } };
}

export async function issueCursorToken(tenantId: string, accountId: string, documentId: string, client = new InfraiClient()) {
  const channel = `tenant:${tenantId}:document:${documentId}`;
  return client.request("/v1/realtime/token/issue", { client_id: accountId, channels: [channel], capabilities: ["publish", "presence"], ttl_seconds: 900 });
}

export async function readPresence(tenantId: string, documentId: string, client = new InfraiClient()) {
  return client.request(`/v1/realtime/presence/get/tenant:${tenantId}:document:${documentId}`, undefined, "GET");
}
