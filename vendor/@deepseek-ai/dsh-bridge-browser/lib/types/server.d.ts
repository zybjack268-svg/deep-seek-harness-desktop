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
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api';
import { type BridgeCaps, type ToolErrorCode } from './protocol.ts';
/** Loopback IPv4/IPv6 literals (IPv4-mapped included). Exported for tests and reuse. */
export declare function isLoopbackAddress(address: string | undefined): boolean;
/** Error thrown by requestTool; the tool registry turns it into an isError result. */
export declare class BridgeToolError extends Error {
    readonly code: ToolErrorCode;
    constructor(code: ToolErrorCode, message: string);
}
/** Dependencies the bridge needs from the host. */
export interface BridgeServerDeps {
    /** Bearer token the extension must present in `hello`. */
    token: string;
    /** Fetch-shaped gateway carrier (from `toFetchHandler(ctx.apiProxy)`). */
    apiHandler: {
        fetch: (request: Request) => Promise<Response>;
    };
    /** Per-connection event stream (usually `ctx.apiProxy.events.mux`). */
    openEvents: (signal: AbortSignal) => AsyncIterable<RpcRequest<MuxFrame>>;
    /** Default per-tool-call timeout in ms. */
    toolTimeoutMs: number;
    /** Capabilities to echo in `hello.ok` (negotiated snapshot budgets). */
    caps: BridgeCaps;
    /** Seed a followed-page snapshot into a live or deferred Agent session. */
    injectBrowserSnapshot: (sessionId: string, snapshot: string) => void | Promise<void>;
    /**
     * Test seam: force the remote address seen by the privilege gate. The
     * sandbox cannot bind arbitrary loopback literals, so the non-loopback
     * branch is exercised through this override; production never sets it.
     */
    remoteAddressOverride?: string;
    /** Seconds a fresh socket may present `hello`; defaults to HELLO_TIMEOUT_MS. */
    helloTimeoutMs?: number;
    /** Server ping cadence; defaults to PING_INTERVAL_MS. */
    pingIntervalMs?: number;
}
/**
 * Decode one ws message payload to text. Exported so all three delivery
 * shapes (fragmented buffer list, Buffer, ArrayBuffer) are unit-testable
 * directly — node ws only ever delivers Buffers in practice.
 * @param data - ws message payload.
 * @returns the decoded UTF-8 text.
 */
export declare function messageToText(data: Buffer | ArrayBuffer | Buffer[]): string;
/**
 * Token-authenticated bridge server. Construct once per plugin instance;
 * dispose with {@link close}.
 */
export declare class BridgeServer {
    private readonly deps;
    private readonly wss;
    private current;
    private readonly pendingTools;
    private readonly orderedSessionRpcs;
    private closed;
    constructor(deps: BridgeServerDeps);
    /**
     * Handle one HTTP upgrade for the bridge path.
     * @param req - upgrade request (carries the client's remote address).
     * @param socket - raw socket transferred by the HTTP server.
     * @param head - bytes already read after the upgrade headers.
     */
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
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
    requestTool(name: string, args: Record<string, unknown>, signal: AbortSignal, timeoutMs?: number): Promise<unknown>;
    /**
     * Terminate the server: close the acceptor, drop all sockets, reject all
     * in-flight tool calls.
     * @returns a promise resolving after the acceptor and all pumps stop.
     */
    close(): Promise<void>;
    /** @returns whether an authenticated extension is currently connected. */
    hasConnection(): boolean;
    private attach;
    /** Promote an authenticated socket to the single active slot. */
    private promote;
    private handleReadyFrame;
    /**
     * Preserve prompt/cancel arrival order per session. In particular, the
     * first prompt may still be materializing a provisional session; its cancel
     * must not reach the gateway until that admission has completed.
     */
    private routeRpc;
    private handleRpc;
    /** Relay a pending host-interaction response through the GUI's /api/respond channel. */
    private handleRespond;
    private settleTool;
    /** Close the current connection (if any) and settle its in-flight calls. */
    private replaceConnection;
}
/**
 * Tool error payload → stable code. The wire parser enforces string fields,
 * so the fallback branches are parser-gated; exported so the fallback
 * contract is unit-testable directly.
 * @param payload - extension-reported error payload.
 * @returns the stable error code.
 */
export declare function payloadCode(payload: unknown): ToolErrorCode;
/**
 * Tool error payload → message. The wire parser enforces string fields, so
 * the fallback branches are parser-gated; exported so the fallback contract
 * is unit-testable directly.
 * @param payload - extension-reported error payload.
 * @returns the human-readable message.
 */
export declare function payloadMessage(payload: unknown): string;
//# sourceMappingURL=server.d.ts.map