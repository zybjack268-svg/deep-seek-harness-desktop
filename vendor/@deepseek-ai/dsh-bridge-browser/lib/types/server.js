/**
 * Bridge WebSocket carrier: token-authenticated connection registry, gateway
 * RPC passthrough, per-connection event pump, and tool-call dispatch to the
 * connected browser extension.
 *
 * The route this server mounts (`/ext/bridge`) lives OUTSIDE the /api trust
 * fence (which only guards the client-connection routes), so the bridge brings
 * its own authentication: a bearer token presented in the `hello` frame within
 * HELLO_TIMEOUT_MS. Gateway RPCs are dispatched through the same fetch-shaped
 * handler the /api carrier uses (`toFetchHandler`), so schema validation and
 * error envelopes are identical to the GUI path. Methods the /api carrier
 * pins to loopback (`PRIVILEGED_METHODS`) stay loopback-only here regardless
 * of the token, defense in depth for `--host 0.0.0.0` deployments.
 *
 * One active connection at a time: a new authenticated socket replaces the
 * previous one (the old socket is closed and its in-flight tool calls settle
 * as `bridge-closed`).
 *
 * @module
 */
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { BRIDGE_INJECT_BROWSER_SNAPSHOT_METHOD, HELLO_TIMEOUT_MS, PING_INTERVAL_MS, parseBridgeFrame, } from "./protocol.js";
import { verifyToken } from "./token.js";
/**
 * Gateway methods the /api carrier pins to loopback (mirror of
 * client-connection's PRIVILEGED_METHODS; kept verbatim so the two fences
 * cannot drift). The bridge rejects these for non-loopback remotes even with
 * a valid token.
 */
const PRIVILEGED_METHODS = new Set([
    'host.pickDirectory',
    'host.openPath',
    'settings.describe',
    'settings.openDocument',
    'settings.update',
    'settings.replace',
    'settings.mutate',
    'credentials.describe',
    'credentials.set',
    'credentials.unset',
]);
/** Session mutations whose WebSocket arrival order is behaviorally significant. */
const ORDERED_SESSION_METHODS = new Set([
    BRIDGE_INJECT_BROWSER_SNAPSHOT_METHOD,
    'session.prompt',
    'session.cancel',
]);
/** Loopback IPv4/IPv6 literals (IPv4-mapped included). Exported for tests and reuse. */
export function isLoopbackAddress(address) {
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
/** Error thrown by requestTool; the tool registry turns it into an isError result. */
export class BridgeToolError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'BridgeToolError';
    }
}
function sendFrame(ws, frame) {
    /* v8 ignore next -- teardown race: the socket can die between a pump's
    readiness check and this write; the guard refuses writes on dead sockets */
    if (ws.readyState !== WebSocket.OPEN)
        return;
    ws.send(JSON.stringify(frame));
}
/**
 * Decode one ws message payload to text. Exported so all three delivery
 * shapes (fragmented buffer list, Buffer, ArrayBuffer) are unit-testable
 * directly — node ws only ever delivers Buffers in practice.
 * @param data - ws message payload.
 * @returns the decoded UTF-8 text.
 */
export function messageToText(data) {
    if (Array.isArray(data))
        return Buffer.concat(data).toString('utf8');
    if (Buffer.isBuffer(data))
        return data.toString('utf8');
    return Buffer.from(data).toString('utf8');
}
/**
 * Token-authenticated bridge server. Construct once per plugin instance;
 * dispose with {@link close}.
 */
export class BridgeServer {
    deps;
    wss = new WebSocketServer({ noServer: true });
    current = null;
    pendingTools = new Map();
    orderedSessionRpcs = new Map();
    closed = false;
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Handle one HTTP upgrade for the bridge path.
     * @param req - upgrade request (carries the client's remote address).
     * @param socket - raw socket transferred by the HTTP server.
     * @param head - bytes already read after the upgrade headers.
     */
    handleUpgrade(req, socket, head) {
        const remote = this.deps.remoteAddressOverride ?? req.socket.remoteAddress;
        const origin = req.headers.origin;
        this.wss.handleUpgrade(req, socket, head, (ws) => { this.attach(ws, remote, origin); });
    }
    /**
     * Request one browser action from the connected extension.
     * @param name - tool name (also the wire action name).
     * @param args - validated tool arguments.
     * @param signal - caller cancellation (abort settles the call as cancelled).
     * @param timeoutMs - per-call budget; defaults to the plugin config value.
     * @returns the extension's action result.
     * @throws BridgeToolError when no extension is connected, the call times
     *   out, is cancelled, or the extension reports a failure.
     */
    requestTool(name, args, signal, timeoutMs = this.deps.toolTimeoutMs) {
        const conn = this.current;
        if (conn === null) {
            throw new BridgeToolError('bridge-closed', 'no browser extension is connected to the bridge');
        }
        // A caller that already aborted must not dispatch: the abort listener
        // below does not replay for pre-aborted signals, so the call would be
        // sent to the extension and executed despite the cancellation.
        if (signal.aborted) {
            throw new BridgeToolError('bridge-closed', 'tool call cancelled before dispatch');
        }
        const id = randomUUID();
        const expiresAt = Date.now() + timeoutMs;
        return new Promise((resolve, reject) => {
            let timer;
            const settle = (error) => {
                clearTimeout(timer);
                this.pendingTools.delete(id);
                signal.removeEventListener('abort', onAbort);
                reject(error);
            };
            const cancel = (error) => {
                // The extension may be paused on a user approval after the caller has
                // stopped waiting. Withdraw that approval before settling locally so
                // a late click cannot execute an expired action.
                sendFrame(conn.ws, { t: 'tool.cancel', id });
                settle(error);
            };
            const onAbort = () => {
                cancel(new BridgeToolError('bridge-closed', 'tool call cancelled before the extension answered'));
            };
            timer = setTimeout(() => {
                cancel(new BridgeToolError('timeout', `browser action "${name}" timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            signal.addEventListener('abort', onAbort, { once: true });
            this.pendingTools.set(id, { resolve, reject, timer });
            conn.ws.send(JSON.stringify({ t: 'tool.call', id, name, args, expiresAt }), (error) => {
                /* v8 ignore next -- teardown race: when the write fails, the socket's
                close handler settles the same call with the same code; the callback
                path is a defensive second settle, covered via the close path */
                if (error != null) {
                    settle(new BridgeToolError('bridge-closed', `bridge socket failed before delivery: ${error.message}`));
                }
            });
        });
    }
    /**
     * Terminate the server: close the acceptor, drop all sockets, reject all
     * in-flight tool calls.
     * @returns a promise resolving after the acceptor and all pumps stop.
     */
    async close() {
        // Idempotent: a second close must not touch the acceptor (ws throws
        // "The server is not running" when closing an already-closed server).
        if (this.closed)
            return;
        this.closed = true;
        // Capture the live pump BEFORE replaceConnection nulls the connection.
        const pumps = this.current === null ? [] : [this.current.pump];
        this.replaceConnection();
        for (const socket of this.wss.clients)
            socket.terminate();
        this.current = null;
        await new Promise((resolve, reject) => {
            this.wss.close((error) => {
                /* v8 ignore next -- acceptor close cannot fail: close() is idempotent
                and the noServer acceptor only reports teardown of already-terminated clients */
                if (error === undefined)
                    resolve();
                /* v8 ignore next -- same unreachable arm */
                else
                    reject(error);
            });
        });
        await Promise.all(pumps);
    }
    /** @returns whether an authenticated extension is currently connected. */
    hasConnection() {
        return this.current !== null;
    }
    attach(ws, remoteAddress, origin) {
        let helloTimer = setTimeout(() => {
            ws.close(4001, 'hello timeout');
        }, this.deps.helloTimeoutMs ?? HELLO_TIMEOUT_MS);
        const onMessage = (data) => {
            const text = messageToText(data);
            const frame = parseBridgeFrame(text);
            if (frame === undefined) {
                ws.close(1008, 'unparseable frame');
                return;
            }
            if (helloTimer !== undefined) {
                // Pending state: only `hello` is legal.
                if (frame.t !== 'hello') {
                    ws.close(1008, 'hello first');
                    return;
                }
                // Zero-config local mode: loopback sockets skip the token (the
                // extension auto-discovers the bridge and connects without setup).
                // WebSockets have no same-origin policy, so a malicious page could
                // open a cross-origin socket to 127.0.0.1 with a loopback remote —
                // the loopback shortcut therefore requires a chrome-extension://
                // Origin (only extension contexts can present one; pages cannot
                // forge the header). Non-loopback remotes must still present the
                // bearer token.
                const loopbackNoToken = isLoopbackAddress(remoteAddress)
                    && typeof origin === 'string'
                    && origin.startsWith('chrome-extension://');
                if (!loopbackNoToken && !verifyToken(this.deps.token, frame.token)) {
                    ws.close(4002, 'bad token');
                    return;
                }
                clearTimeout(helloTimer);
                helloTimer = undefined;
                this.promote(ws, remoteAddress);
                return;
            }
            this.handleReadyFrame(frame);
        };
        const onClose = () => {
            if (helloTimer !== undefined)
                clearTimeout(helloTimer);
            if (this.current !== null && this.current.ws === ws)
                this.replaceConnection();
        };
        ws.on('message', onMessage);
        ws.once('close', onClose);
        ws.once('error', onClose);
    }
    /** Promote an authenticated socket to the single active slot. */
    promote(ws, remoteAddress) {
        this.replaceConnection();
        const abort = new AbortController();
        const ping = setInterval(() => { sendFrame(ws, { t: 'ping' }); }, this.deps.pingIntervalMs ?? PING_INTERVAL_MS);
        const pump = (async () => {
            try {
                for await (const envelope of this.deps.openEvents(abort.signal)) {
                    if (ws.readyState !== WebSocket.OPEN)
                        break;
                    sendFrame(ws, {
                        t: 'event',
                        frame: { rpcId: envelope.rpcId, method: envelope.payload.type, payload: envelope.payload },
                    });
                }
            }
            catch (error) {
                if (!abort.signal.aborted && ws.readyState === WebSocket.OPEN) {
                    sendFrame(ws, { t: 'error', code: 'stream-failed', message: String(error) });
                }
            }
        })();
        this.current = { ws, remoteAddress, abort, pump, ping };
        sendFrame(ws, { t: 'hello.ok', caps: this.deps.caps });
        ws.once('close', () => {
            clearInterval(ping);
            abort.abort();
        });
    }
    handleReadyFrame(frame) {
        switch (frame.t) {
            case 'rpc':
                this.routeRpc(frame);
                break;
            case 'respond':
                void this.handleRespond(frame);
                break;
            case 'tool.result':
                this.settleTool(frame.id, frame.ok, frame.ok ? frame.result : frame.error);
                break;
            case 'pong':
            case 'hello':
            case 'hello.ok':
            case 'rpc.result':
            case 'respond.result':
            case 'event':
            case 'tool.call':
            case 'tool.cancel':
            case 'ping':
            case 'error':
                // Protocol violations and unsolicited server-side shapes are ignored;
                // the extension is the only sender on this channel.
                break;
        }
    }
    /**
     * Preserve prompt/cancel arrival order per session. In particular, the
     * first prompt may still be materializing a provisional session; its cancel
     * must not reach the gateway until that admission has completed.
     */
    routeRpc(frame) {
        const sessionId = orderedSessionId(frame);
        if (sessionId === undefined) {
            void this.handleRpc(frame);
            return;
        }
        const previous = this.orderedSessionRpcs.get(sessionId) ?? Promise.resolve();
        const task = previous.then(() => this.handleRpc(frame), () => this.handleRpc(frame));
        this.orderedSessionRpcs.set(sessionId, task);
        const clear = () => {
            if (this.orderedSessionRpcs.get(sessionId) === task)
                this.orderedSessionRpcs.delete(sessionId);
        };
        void task.then(clear, clear);
    }
    async handleRpc(frame) {
        const conn = this.current;
        /* v8 ignore next -- replacement race: a frame can land between a socket
        replacement and the next promotion; the re-check keeps the handler total */
        if (conn === null)
            return;
        const forbidden = PRIVILEGED_METHODS.has(frame.method) && !isLoopbackAddress(conn.remoteAddress);
        if (forbidden) {
            sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'forbidden', message: 'method is loopback-only' } });
            return;
        }
        if (frame.method === BRIDGE_INJECT_BROWSER_SNAPSHOT_METHOD) {
            const payload = browserSnapshotPayload(frame.payload);
            if (payload === undefined) {
                sendFrame(conn.ws, {
                    t: 'rpc.result',
                    id: frame.id,
                    ok: false,
                    error: { code: 'bad-request', message: 'sessionId and snapshot must be non-empty strings' },
                });
                return;
            }
            try {
                await this.deps.injectBrowserSnapshot(payload.sessionId, payload.snapshot);
                sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: { accepted: true } });
            }
            catch (error) {
                sendFrame(conn.ws, {
                    t: 'rpc.result',
                    id: frame.id,
                    ok: false,
                    error: { code: 'internal', message: String(error) },
                });
            }
            return;
        }
        const body = JSON.stringify({ type: 'client-request', rpcId: frame.id, method: frame.method, payload: frame.payload });
        const request = new Request(new URL(`/api/${frame.method}`, 'http://dsh.internal'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        });
        try {
            const response = await this.deps.apiHandler.fetch(request);
            const text = await response.text();
            if (!response.ok) {
                sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'http', message: text } });
                return;
            }
            let result;
            try {
                result = JSON.parse(text);
            }
            catch {
                result = text;
            }
            sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result });
        }
        catch (error) {
            sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'internal', message: String(error) } });
        }
    }
    /** Relay a pending host-interaction response through the GUI's /api/respond channel. */
    async handleRespond(frame) {
        const conn = this.current;
        /* v8 ignore next -- replacement race; a closed socket simply drops the receipt */
        if (conn === null)
            return;
        const request = new Request(new URL('/api/respond', 'http://dsh.internal'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-response', rpcId: frame.rpcId, result: frame.result }),
        });
        try {
            const response = await this.deps.apiHandler.fetch(request);
            const text = await response.text();
            if (!response.ok) {
                sendFrame(conn.ws, { t: 'respond.result', id: frame.id, ok: false, error: { code: 'http', message: text } });
                return;
            }
            let result;
            try {
                result = JSON.parse(text);
            }
            catch {
                result = text;
            }
            sendFrame(conn.ws, { t: 'respond.result', id: frame.id, ok: true, result });
        }
        catch (error) {
            sendFrame(conn.ws, { t: 'respond.result', id: frame.id, ok: false, error: { code: 'internal', message: String(error) } });
        }
    }
    settleTool(id, ok, payload) {
        const pending = this.pendingTools.get(id);
        if (pending === undefined)
            return;
        clearTimeout(pending.timer);
        this.pendingTools.delete(id);
        if (ok)
            pending.resolve(payload);
        else
            pending.reject(new BridgeToolError(payloadCode(payload), payloadMessage(payload)));
    }
    /** Close the current connection (if any) and settle its in-flight calls. */
    replaceConnection() {
        const conn = this.current;
        if (conn === null)
            return;
        this.current = null;
        clearInterval(conn.ping);
        conn.abort.abort();
        if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
            conn.ws.close(4000, 'replaced');
        }
        for (const [id, pending] of this.pendingTools) {
            clearTimeout(pending.timer);
            this.pendingTools.delete(id);
            pending.reject(new BridgeToolError('bridge-closed', 'the extension connection was replaced'));
        }
    }
}
function browserSnapshotPayload(payload) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        return undefined;
    const { sessionId, snapshot } = payload;
    if (typeof sessionId !== 'string' || sessionId.trim() === '')
        return undefined;
    if (typeof snapshot !== 'string' || snapshot.trim() === '')
        return undefined;
    return { sessionId, snapshot };
}
function orderedSessionId(frame) {
    if (!ORDERED_SESSION_METHODS.has(frame.method))
        return undefined;
    if (typeof frame.payload !== 'object' || frame.payload === null || Array.isArray(frame.payload))
        return undefined;
    const sessionId = frame.payload.sessionId;
    return typeof sessionId === 'string' ? sessionId : undefined;
}
/**
 * Tool error payload → stable code. The wire parser enforces string fields,
 * so the fallback branches are parser-gated; exported so the fallback
 * contract is unit-testable directly.
 * @param payload - extension-reported error payload.
 * @returns the stable error code.
 */
export function payloadCode(payload) {
    if (typeof payload === 'object' && payload !== null) {
        const code = payload.code;
        if (typeof code === 'string')
            return code;
        return 'internal';
    }
    return 'internal';
}
/**
 * Tool error payload → message. The wire parser enforces string fields, so
 * the fallback branches are parser-gated; exported so the fallback contract
 * is unit-testable directly.
 * @param payload - extension-reported error payload.
 * @returns the human-readable message.
 */
export function payloadMessage(payload) {
    if (typeof payload === 'object' && payload !== null) {
        const message = payload.message;
        if (typeof message === 'string' && message.length > 0)
            return message;
        return 'browser action failed';
    }
    return 'browser action failed';
}
//# sourceMappingURL=server.js.map