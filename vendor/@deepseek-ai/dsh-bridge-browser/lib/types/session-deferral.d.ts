/**
 * Defer real session creation until the first prompt.
 *
 * The panel calls `session.create` as soon as it connects, but a session that
 * is opened and never used should leave zero trace in the store/GUI. This
 * wrapper answers `session.create` with a provisional id (minted locally,
 * nothing persisted), serves `session.history` for provisional ids as empty,
 * and materializes the real session — same id, original create payload — on
 * the first `session.prompt` for that id. Abandoned provisional ids are
 * pruned after {@link PROVISIONAL_TTL_MS}.
 *
 * @module @deepseek-ai/dsh-bridge-browser/src/session-deferral
 */
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api';
/**
 * Wrap the gateway sessions API so `session.create` returns a provisional id
 * without creating anything; the real session materializes on the first
 * `session.prompt` for that id.
 *
 * @param api - Gateway API implementation.
 * @param enabled - Whether deferral is active; false returns the API untouched.
 * @returns the original API when disabled, otherwise the wrapped API.
 */
export declare function withSessionDeferral(api: ApiProxy, enabled: boolean): ApiProxy;
//# sourceMappingURL=session-deferral.d.ts.map