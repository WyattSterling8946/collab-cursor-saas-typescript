import assert from "node:assert/strict";
import { publishCursor } from "../src/collab_cursor_service.js";

class FakeClient { calls: Array<{ path: string; body?: Record<string, unknown> }> = []; async request<T>(path: string, body?: Record<string, unknown>): Promise<T> { this.calls.push({ path, body }); return {} as T; } }
const client = new FakeClient();
const result = await publishCursor({ tenantId: "acme", accountId: "a-1", documentId: "doc-9", x: 10, y: 20 }, client as never);
assert.equal(result.channel, "tenant:acme:document:doc-9");
assert.equal(client.calls[1].body?.event, "cursor.moved");
assert.deepEqual(client.calls[1].body?.data, { x: 10, y: 20 });
console.log("cursor workflow test passed");
