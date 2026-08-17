/**
 * Wire contract between the dsh bridge plugin and the browser extension.
 *
 * Zero-dependency module (pure types, constants, and a parser): both the
 * plugin (node) and the Chrome extension (browser bundle) import this file, so
 * the frame shapes can never drift between the two halves.
 *
 * Frames are one JSON object per WebSocket message, discriminated by `t`.
 * Correlation ids (`id`) are minted by the requestor and echoed by the
 * responder; they are opaque strings, never parsed.
 *
 * @module
 */
/** WebSocket pathname the bridge plugin registers on the host webserver. */
export declare const BRIDGE_PATH = "/ext/bridge";
/** Zero-config discovery endpoint: returns `{ wsUrl }` for the extension. */
export declare const BRIDGE_CONFIG_PATH = "/ext/bridge-config";
/** Internal RPC used after an explicit tab handoff to seed the Agent's next step. */
export declare const BRIDGE_INJECT_BROWSER_SNAPSHOT_METHOD = "bridge.injectBrowserSnapshot";
/** Seconds a fresh socket may take to present `hello` before it is closed. */
export declare const HELLO_TIMEOUT_MS = 5000;
/** Server-side ping cadence; the client answers `pong` to prove liveness. */
export declare const PING_INTERVAL_MS = 30000;
/** Default bytes of the generated bearer token (256-bit). */
export declare const DEFAULT_TOKEN_BYTES = 32;
/** Default rendered-snapshot character budget. */
export declare const DEFAULT_SNAPSHOT_MAX_CHARS = 32000;
/** Smallest snapshot budget that can carry both trust boundaries and page text. */
export declare const MIN_SNAPSHOT_MAX_CHARS = 500;
/** Error codes a tool call may settle with. Open set: consumers must tolerate unknown codes. */
export type ToolErrorCode = 'no-active-tab' | 'content-unavailable' | 'action-failed' | 'timeout' | 'bridge-closed' | 'bad-args' | 'internal';
/** One tool-call failure: stable machine code plus human text for the model. */
export interface ToolError {
    code: ToolErrorCode;
    message: string;
}
/** Result sent for a pending host interaction such as ask_user_question. */
export type RespondResult = {
    ok: true;
    value?: unknown;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details: Record<string, unknown>;
    };
};
/** Capabilities negotiated in `hello`/`hello.ok`. The extension performs its own actions; these bounds shape page snapshots. */
export interface BridgeCaps {
    /** The extension renders page state as text only (no screenshots). */
    textOnly: true;
    /** Upper bound on one rendered snapshot's characters (plugin config, minimum 500). */
    snapshotMaxChars: number;
    /** Upper bound on interactive inventory items per snapshot (plugin config). */
    maxInteractiveItems: number;
}
/** Frames sent by the extension to the bridge plugin. */
export type ClientFrame = 
/** First frame, within HELLO_TIMEOUT_MS of socket open. */
{
    t: 'hello';
    token: string;
    caps: BridgeCaps;
}
/** Unary gateway RPC passthrough (method names from the apiproxy RpcMethodMap). */
 | {
    t: 'rpc';
    id: string;
    method: string;
    payload: unknown;
}
/** Answer or cancel a pending host interaction through /api/respond. */
 | {
    t: 'respond';
    id: string;
    rpcId: string;
    result: RespondResult;
}
/** Result of a previously dispatched tool call. */
 | {
    t: 'tool.result';
    id: string;
    ok: true;
    result: unknown;
} | {
    t: 'tool.result';
    id: string;
    ok: false;
    error: ToolError;
}
/** Liveness reply. */
 | {
    t: 'pong';
};
/** Frames sent by the bridge plugin to the extension. */
export type ServerFrame = 
/** Accepted after a valid `hello`. */
{
    t: 'hello.ok';
    caps: BridgeCaps;
}
/** Reply to an `rpc` frame; `result` is the apiproxy ServerResponse envelope. */
 | {
    t: 'rpc.result';
    id: string;
    ok: true;
    result: unknown;
} | {
    t: 'rpc.result';
    id: string;
    ok: false;
    error: {
        code: string;
        message: string;
    };
}
/** Receipt for a `respond` frame (normally `{ accepted: boolean }`). */
 | {
    t: 'respond.result';
    id: string;
    ok: true;
    result: unknown;
} | {
    t: 'respond.result';
    id: string;
    ok: false;
    error: {
        code: string;
        message: string;
    };
}
/** One gateway event envelope (the same server-request shape the GUI's /api/events.mux carries). */
 | {
    t: 'event';
    frame: {
        rpcId: string;
        method: string;
        payload: unknown;
    };
}
/** A model-requested browser action to execute in the user-controlled tab. */
 | {
    t: 'tool.call';
    id: string;
    name: string;
    args: Record<string, unknown>;
    expiresAt: number;
}
/** Withdraw a tool call that timed out or whose caller was cancelled. */
 | {
    t: 'tool.cancel';
    id: string;
}
/** Liveness probe. */
 | {
    t: 'ping';
}
/** Fatal connection error; the client should re-authenticate. */
 | {
    t: 'error';
    code: string;
    message: string;
};
/** Any frame on the wire. */
export type BridgeFrame = ClientFrame | ServerFrame;
/**
 * Type guard: is this frame one the SERVER may send? Client-only shapes
 * (hello/tool.result/pong) narrow out, so server-side consumers never
 * dispatch on their own request vocabulary.
 * @param frame - parsed frame.
 * @returns true for server-sendable frames.
 */
export declare function isServerFrame(frame: BridgeFrame): frame is ServerFrame;
/**
 * Type guard: is this frame one the CLIENT may send? Server-only shapes
 * narrow out, so client-side consumers never dispatch on server vocabulary.
 * @param frame - parsed frame.
 * @returns true for client-sendable frames.
 */
export declare function isClientFrame(frame: BridgeFrame): frame is ClientFrame;
/**
 * Parse one WebSocket message into a frame.
 * @param text - raw message text.
 * @returns the frame, or `undefined` when the message is not a valid frame.
 */
export declare function parseBridgeFrame(text: string): BridgeFrame | undefined;
export declare function isRespondResult(value: unknown): value is RespondResult;
//# sourceMappingURL=protocol.d.ts.map