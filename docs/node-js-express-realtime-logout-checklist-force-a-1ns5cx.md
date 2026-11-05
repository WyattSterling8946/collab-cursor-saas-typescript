# Node.js Express Realtime Logout Checklist: Force a Client Disconnect Safely

**Short answer:** In Node.js, let Express logout revoke the session, then force every realtime client for that identity to disconnect; enforce the revocation on every event because a socket close is not authorization.

The least complicated production rule is this: logout revokes the user's session first, then the realtime service disconnects every connection carrying that identity. A socket close by itself is not logout. It is only a transport event, and a reconnecting browser can undo it before the rest of the system has noticed.

For a fintech editor that synchronizes collaborative cursors, I would make revocation authoritative and make cursor delivery explicitly recoverable. The editor may briefly show a stale pointer; it must not accept events from a revoked session or silently treat a dropped fan-out message as current state.

## The page that fires

At 03:07, the useful alert is not `active sockets > 0`. That dashboard number can look healthy while a logged-out operator still has a live connection in one region. The page I want is narrower: a revoked identity produced an accepted cursor event after the revocation watermark.

The on-call view should show the identity hash, session identifier, connection identifier, revocation sequence, and the event sequence that was accepted. It should also show the fan-out result: how many connections received the revocation and how many acknowledged it. Do not put raw session tokens in logs.

The action trace runs backward from that page. First, stop accepting new events for the identity. Second, publish an identity-level revoke message to every realtime worker. Third, close matching connections with an application-defined reason. Finally, verify that a reconnect attempt fails authentication, rather than assuming the browser will stay disconnected.

That order matters. A close frame is advisory to application behavior; the authorization check is the boundary that protects the data. The WebSocket protocol defines a closing handshake and status codes, but it does not define your session revocation policy.

## How should a Node.js Express logout force a realtime client disconnect?

A connection ID is too narrow. One browser can have multiple tabs, a mobile session, and a second connection created during a network transition. Revoking only the socket visible to the HTTP logout handler leaves the other paths alive.

Use an identity and session model instead. Store a monotonically increasing revocation sequence for the user or tenant session. Include the current sequence in the authenticated connection context. Every cursor event is checked against the current value before it enters the fan-out path. The check is cheap compared with debugging a post-logout data leak at 3am.

The logout endpoint can return after the durable revocation write succeeds. It does not need to wait for every remote socket to disappear, but the system needs a bounded way to observe propagation and a policy for connections that do not acknowledge it.

Here is the decision boundary in Go. The interface is deliberately generic; the transport could be a WebSocket server, a gateway, or another realtime adapter.

```go
type Session struct {
	UserID       string
	RevocationNo uint64
}

type CursorEvent struct {
	UserID     string
	SessionNo  uint64
	DocumentID string
	CursorSeq  uint64
}

func AcceptCursor(current Session, event CursorEvent) bool {
	if event.UserID != current.UserID {
		return false
	}
	return event.SessionNo >= current.RevocationNo
}
```

In a real implementation, the comparison should reflect the exact meaning of the stored number. If the value means “the highest revoked session number,” use a strict greater-than check for events tied to that session. The important part is to define the invariant, write it down, and test the equality case. A surprising amount of incident time goes into an off-by-one revocation test that nobody thought to name.

## Can fan-out guarantee a clean disconnect?

No single delivery promise answers this. You need separate guarantees for the revoke command, the connection close, and the cursor stream.

A revoke command should be durable enough that a worker restarting during propagation can learn the current state. A close request can be at-least-once: repeating it is harmless when the connection is already gone. Cursor updates can be lossy if they are snapshots, but the next authenticated client must receive a state or sequence from which it can recover.

That distinction is the operational method. I would not use “exactly once” as a comforting label for a distributed disconnect. Instead, assign an event sequence per document and make consumers discard old sequences. A reconnecting editor asks for the latest accepted cursor state after its last sequence, or requests a fresh snapshot when the gap cannot be repaired.

For a small service, the fan-out worker can keep a connection registry keyed by user identity. For multiple workers, the registry has to be shared through a message layer or coordinated ownership scheme. Either way, the security decision cannot depend on a worker receiving a best-effort notification before it validates the next event. The trade-off is real: a local registry is simpler and less durable, while a shared registry adds coordination and lag that must be observed.

That is the boundary.

Revoke first.

```go
type RevokeMessage struct {
	UserID       string
	RevocationNo uint64
}

func HandleRevoke(msg RevokeMessage, registry map[string][]string, closeConn func(string, string)) {
	for _, connectionID := range registry[msg.UserID] {
		closeConn(connectionID, "session revoked")
	}
}
```

The example intentionally has no network route or vendor-specific client call. The handler is a fan-out action, not the authorization system. In production, remove the connection from the local registry when the close completes, and make the revoke consumer idempotent so replaying the message does not create a second meaning.

The failure path deserves more detail than the happy path. Imagine a logout write commits in the primary store while worker B is briefly behind worker A. Worker A receives the revoke message and closes two editor connections. Worker B still owns a third connection, and the browser sends one last cursor event before B processes the message. That event must reach the authorization check, read a revocation value at least as fresh as the session decision, and be rejected there. If the check only consults B's in-memory connection state, the system has confused transport cleanup with access control. The correct recovery is to refresh the worker's session state, record the rejected sequence, and keep the connection closed or re-authenticate it before accepting another event. This is why the alert should name the accepted event after the watermark, not merely report that a close notification was delayed.

## Where does the earlier signal come from?

The failure is usually detected too late because teams instrument disconnect counts instead of rejected work. The earlier signal is an authorization rejection carrying the revocation sequence, correlated with the logout operation and the connection's worker. That metric should be split by expected client behavior and server-side enforcement; otherwise a browser closing normally can drown out the event that matters.

I would test four transitions: logout before a cursor publish, logout during fan-out, reconnect after logout, and a delayed event arriving after revocation. Add a fifth test for two tabs, because the single-connection happy path proves almost nothing. Assert both sides of the contract: the connection is asked to close, and a delayed event is rejected even if the close message never reached that worker.

For the support chat widget that shares this infrastructure, the same rule prevents a logged-out agent from continuing to receive private conversation events. The payload differs; the authorization boundary does not. Do not copy cursor semantics into chat blindly, though. A lost cursor snapshot is usually repaired by refresh, while a missed security-sensitive chat event needs a different audit and replay decision.

## The false-positive bill

Thresholds still matter. If every rejected event pages someone, an expired mobile tab can create a noisy night and train the team to ignore the real post-revocation acceptance. If the threshold is too high, the first bad event looks like an isolated counter anomaly. Page on an accepted event after the revocation watermark, and create a lower-severity signal for repeated propagation delays.

The runbook should identify the affected identity without exposing credentials, confirm the durable revocation value, inspect worker lag, and verify that fresh authentication fails. Only then should anyone investigate transport teardown. Closing sockets is cleanup. Rejecting unauthorized work is the control.

The mechanism keeps the product decision honest. A team can use lossy cursor snapshots, durable cursor events, or a hybrid recovery path based on user-visible correctness and operational cost. None of those choices makes logout mean “the browser probably closed”; transport teardown has a limit, so authorization must remain the final control.

## Further reading

- W3C, WebRTC 1.0: https://www.w3.org/TR/webrtc/
- IETF, The WebSocket Protocol, RFC 6455: https://www.rfc-editor.org/rfc/rfc6455
- IETF, OAuth 2.0 Token Revocation, RFC 7009: https://www.rfc-editor.org/rfc/rfc7009
- MDN, WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
