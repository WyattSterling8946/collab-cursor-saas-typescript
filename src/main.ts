import { publishCursor, issueCursorToken } from "./collab_cursor_service.js";

const input = { tenantId: "acme", accountId: "editor-7", documentId: "roadmap", x: 184, y: 72 };
const result = await publishCursor(input);
console.log(JSON.stringify(result));
const token = await issueCursorToken(input.tenantId, input.accountId, input.documentId);
console.log(JSON.stringify({ clientToken: token }));
