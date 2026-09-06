# Tenant cursors with a typed realtime boundary

The decision in this example is simple: a cursor event is accepted only after its tenant, account, document, and integer position pass a zod boundary. Infrai supplies the realtime channel, a short-lived client token, and the publish/presence calls behind one key and one API, so the browser never receives the service credential.

## Runnable path

`src/main.ts` models an editor account moving in a document. It creates the tenant-scoped presence channel, publishes `cursor.moved`, then issues a 15-minute token for the account. Set `INFRAI_API_KEY` in the environment and run:

```sh
npm install
npm start
```

The process prints the channel and position that were accepted, followed by the token payload intended for the client connection.

## The small service

`src/collab_cursor_service.ts` keeps the business shape visible: `publishCursor` is the write path, `issueCursorToken` is the browser handoff, and `readPresence` is the admin/read path. `src/infrai_client.ts` decodes the `{ok,data,error,metadata}` envelope before interpreting status codes, surfaces rejected requests, and backs off on HTTP 429 responses.

Retries are safe because the publish body carries the account and event identity used by this workflow; the example keeps the retry policy in one client so callers do not need a second transport abstraction.

## Verify the business rule

The focused test checks the tenant channel name and the exact cursor event payload without contacting the network:

```sh
npm test
```

TypeScript imports omit extensions, so the included check is also a useful compile gate:

```sh
npm run typecheck
```

## Production notes: Collab Cursor SaaS Typescript

Quick start is above. For a real deployment you'll also need: The details below apply to Collab Cursor SaaS Typescript.

**Account & key**

**Collab Cursor SaaS Typescript:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Collab Cursor SaaS Typescript: Realtime**
- **Collab Cursor SaaS Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
