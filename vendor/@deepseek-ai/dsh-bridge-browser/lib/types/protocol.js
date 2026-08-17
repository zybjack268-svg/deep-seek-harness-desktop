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
export const BRIDGE_PATH = '/ext/bridge';
/** Zero-config discovery endpoint: returns `{ wsUrl }` for the extension. */
export const BRIDGE_CONFIG_PATH = '/ext/bridge-config';
/** Internal RPC used after an explicit tab handoff to seed the Agent's next step. */
export const BRIDGE_INJECT_BROWSER_SNAPSHOT_METHOD = 'bridge.injectBrowserSnapshot';
/** Seconds a fresh socket may take to present `hello` before it is closed. */
export const HELLO_TIMEOUT_MS = 5_000;
/** Server-side ping cadence; the client answers `pong` to prove liveness. */
export const PING_INTERVAL_MS = 30_000;
/** Default bytes of the generated bearer token (256-bit). */
export const DEFAULT_TOKEN_BYTES = 32;
/** Default rendered-snapshot character budget. */
export const DEFAULT_SNAPSHOT_MAX_CHARS = 32_000;
/** Smallest snapshot budget that can carry both trust boundaries and page text. */
export const MIN_SNAPSHOT_MAX_CHARS = 500;
/**
 * Type guard: is this frame one the SERVER may send? Client-only shapes
 * (hello/tool.result/pong) narrow out, so server-side consumers never
 * dispatch on their own request vocabulary.
 * @param frame - parsed frame.
 * @returns true for server-sendable frames.
 */
export function isServerFrame(frame) {
    return frame.t === 'hello.ok'
        || frame.t === 'rpc.result'
        || frame.t === 'respond.result'
        || frame.t === 'event'
        || frame.t === 'tool.call'
        || frame.t === 'tool.cancel'
        || frame.t === 'ping'
        || frame.t === 'error';
}
/**
 * Type guard: is this frame one the CLIENT may send? Server-only shapes
 * narrow out, so client-side consumers never dispatch on server vocabulary.
 * @param frame - parsed frame.
 * @returns true for client-sendable frames.
 */
export function isClientFrame(frame) {
    return frame.t === 'hello' || frame.t === 'rpc' || frame.t === 'respond' || frame.t === 'tool.result' || frame.t === 'pong';
}
/**
 * Parse one WebSocket message into a frame.
 * @param text - raw message text.
 * @returns the frame, or `undefined` when the message is not a valid frame.
 */
export function parseBridgeFrame(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const frame = value;
    if (typeof frame.t !== 'string')
        return undefined;
    switch (frame.t) {
        case 'hello':
            return typeof frame.token === 'string'
                && isCaps(frame.caps)
                ? { t: 'hello', token: frame.token, caps: frame.caps }
                : undefined;
        case 'rpc':
            return typeof frame.id === 'string' && typeof frame.method === 'string'
                ? { t: 'rpc', id: frame.id, method: frame.method, payload: frame.payload }
                : undefined;
        case 'respond':
            return typeof frame.id === 'string' && typeof frame.rpcId === 'string' && isRespondResult(frame.result)
                ? { t: 'respond', id: frame.id, rpcId: frame.rpcId, result: frame.result }
                : undefined;
        case 'tool.result':
            if (typeof frame.id !== 'string')
                return undefined;
            if (frame.ok === true && 'result' in frame) {
                return { t: 'tool.result', id: frame.id, ok: true, result: frame.result };
            }
            return isToolError(frame.error)
                ? { t: 'tool.result', id: frame.id, ok: false, error: frame.error }
                : undefined;
        case 'pong':
            return { t: 'pong' };
        case 'hello.ok':
            return isCaps(frame.caps)
                ? { t: 'hello.ok', caps: frame.caps }
                : undefined;
        case 'rpc.result':
            if (typeof frame.id !== 'string')
                return undefined;
            if (frame.ok === true && 'result' in frame) {
                return { t: 'rpc.result', id: frame.id, ok: true, result: frame.result };
            }
            return typeof frame.error === 'object' && frame.error !== null
                ? { t: 'rpc.result', id: frame.id, ok: false, error: frame.error }
                : undefined;
        case 'respond.result':
            if (typeof frame.id !== 'string')
                return undefined;
            if (frame.ok === true && 'result' in frame) {
                return { t: 'respond.result', id: frame.id, ok: true, result: frame.result };
            }
            return isWireError(frame.error)
                ? { t: 'respond.result', id: frame.id, ok: false, error: frame.error }
                : undefined;
        case 'event':
            return typeof frame.frame === 'object' && frame.frame !== null
                ? { t: 'event', frame: frame.frame }
                : undefined;
        case 'tool.call':
            return typeof frame.id === 'string' && typeof frame.name === 'string'
                && typeof frame.args === 'object' && frame.args !== null && !Array.isArray(frame.args)
                && typeof frame.expiresAt === 'number' && Number.isFinite(frame.expiresAt) && frame.expiresAt > 0
                ? { t: 'tool.call', id: frame.id, name: frame.name, args: frame.args, expiresAt: frame.expiresAt }
                : undefined;
        case 'tool.cancel':
            return typeof frame.id === 'string' ? { t: 'tool.cancel', id: frame.id } : undefined;
        case 'ping':
            return { t: 'ping' };
        case 'error':
            return typeof frame.code === 'string' && typeof frame.message === 'string'
                ? { t: 'error', code: frame.code, message: frame.message }
                : undefined;
        default:
            return undefined;
    }
}
function isCaps(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const caps = value;
    return caps.textOnly === true
        && typeof caps.snapshotMaxChars === 'number'
        && Number.isInteger(caps.snapshotMaxChars)
        && caps.snapshotMaxChars >= MIN_SNAPSHOT_MAX_CHARS
        && typeof caps.maxInteractiveItems === 'number' && caps.maxInteractiveItems > 0;
}
function isToolError(value) {
    return typeof value === 'object' && value !== null
        && typeof value.code === 'string'
        && typeof value.message === 'string';
}
function isWireError(value) {
    return typeof value === 'object' && value !== null
        && typeof value.code === 'string'
        && typeof value.message === 'string';
}
export function isRespondResult(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const result = value;
    if (result.ok === true)
        return result.error === undefined;
    return result.ok === false && isRespondError(result.error);
}
function isRespondError(value) {
    return isWireError(value)
        && typeof value.details === 'object'
        && value.details !== null
        && !Array.isArray(value.details);
}
//# sourceMappingURL=protocol.js.map