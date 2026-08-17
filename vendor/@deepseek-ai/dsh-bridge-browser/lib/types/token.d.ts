/**
 * Bridge bearer-token lifecycle: generation, constant-time verification, and
 * file persistence under the dsh home directory.
 *
 * The token authenticates the browser extension against the bridge WebSocket.
 * It is NOT the /api trust fence (that stays untouched); it is the bridge
 * path's own auth because the bridge route lives outside the fence by design.
 *
 * @module
 */
/** File name of the persisted token inside the dsh home. */
export declare const TOKEN_FILE_NAME = "ext-bridge-token";
/**
 * Generate a fresh token as lowercase hex.
 * @param bytes - entropy bytes; defaults to DEFAULT_TOKEN_BYTES (256-bit).
 * @returns the hex token string.
 */
export declare function generateToken(bytes?: number): string;
/**
 * Constant-time token comparison. Length mismatch fails fast (still constant
 * time on the compared prefix) — a wrong-length token can never verify.
 * @param expected - the configured token.
 * @param actual - the token presented by the client.
 * @returns true only when both are equal-length hex and byte-equal.
 */
export declare function verifyToken(expected: string, actual: string): boolean;
/**
 * Path of the persisted token file under the dsh home.
 * @returns absolute path like `~/.dsh/ext-bridge-token`.
 */
export declare function tokenFilePath(): string;
/**
 * Read the persisted token; returns undefined when absent or unreadable.
 * @param file - token file path.
 * @returns the stored hex token, trimmed.
 */
export declare function readTokenFile(file?: string): Promise<string | undefined>;
/**
 * Persist a token atomically (temp file + rename) with 0600 permissions.
 * @param token - hex token to persist.
 * @param file - token file path.
 */
export declare function writeTokenFile(token: string, file?: string): Promise<void>;
/**
 * Resolve the bridge token: an explicitly configured token wins; otherwise the
 * persisted file is reused when present, and a fresh token is generated and
 * persisted otherwise.
 * @param configured - token from plugin config, or undefined.
 * @param file - token file path (injectable for tests).
 * @returns `{ token, file, generated }` where `generated` records whether a new token was minted.
 */
export declare function resolveToken(configured: string | undefined, file?: string): Promise<{
    token: string;
    file: string;
    generated: boolean;
}>;
//# sourceMappingURL=token.d.ts.map