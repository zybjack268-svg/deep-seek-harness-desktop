/**
 * `@deepseek-ai/dsh-bridge-browser`: token-authenticated WebSocket bridge for
 * the browser extension plus the text-only `browser_*` tool set.
 *
 * The bridge mounts its own upgrade route (`/ext/bridge`) on the host
 * webserver, OUTSIDE the /api trust fence — so it brings its own bearer-token
 * authentication (first frame `hello` within HELLO_TIMEOUT_MS). Gateway RPCs
 * from the extension are dispatched through the same fetch-shaped handler the
 * /api carrier uses, and session events are pumped per connection. Tools
 * execute by dispatching `tool.call` frames to the connected extension, which
 * performs the action in the tab explicitly controlled by the user.
 *
 * Opt-in by design: nothing is registered unless this plugin appears in the
 * composition. No dsh core code is touched.
 *
 * @module @deepseek-ai/dsh-bridge-browser
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "bridge-browser";
/** Services required by this plugin. */
export declare const inject: string[];
/** Plugin config: deployment-varying tunables only; the wire contract stays fixed. */
export interface Config {
    /** Fixed bearer token. When absent, a token is generated on first boot and persisted under the dsh home (0600). */
    token?: string;
    /** Per-tool-call timeout in ms. Defaults to 60000. */
    toolTimeoutMs?: number;
    /** Upper bound on one snapshot's rendered characters. Defaults to 32000; minimum 500. */
    snapshotMaxChars?: number;
    /** Upper bound on interactive inventory items per snapshot. Defaults to 60. */
    maxInteractiveItems?: number;
    /** Dedicated workspace path for extension-created sessions. Empty disables grouping. */
    sessionWorkspacePath?: string;
    /** Defer real session creation until the first prompt. Defaults to true. */
    deferSessionCreate?: boolean;
}
export declare const Config: z<Config>;
/** The shape after schemastery applies its defaults to every field. */
type ResolvedConfig = Required<Omit<Config, 'token'>> & Pick<Config, 'token'>;
/** Configured budgets must be positive integers. Exported for validation tests. */
export declare function assertPositiveInteger(name: string, value: number): void;
/**
 * Apply defaults and direct-call validation at the plugin boundary.
 * @param config - Loader-resolved or directly supplied plugin configuration.
 * @returns a complete configuration ready for runtime use.
 */
export declare function resolveConfig(config: Config): ResolvedConfig;
/**
 * Mount the bridge: resolve the token, register the upgrade route, the tool
 * set, and an optional system-prompt section, all effect-scoped for HMR.
 *
 * @param ctx - Cordis context.
 * @param config - plugin config (schema defaults applied).
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map