/**
 * Best-effort workspace grouping for sessions created through the browser
 * bridge. The wrapper changes only implicit `session.create` requests;
 * explicit workspace choices and every other gateway method pass through.
 * @module @deepseek-ai/dsh-bridge-browser/src/session-workspace
 */
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api';
type Warn = (message: string) => void;
/**
 * Add a dedicated Workspace to implicit session creation without making
 * grouping a session-creation dependency. The first implicit create mkdirs
 * and registers the configured path; that result, including failure, is
 * cached for the wrapper lifetime.
 *
 * @param api - Injected gateway API implementation.
 * @param workspacePath - Dedicated directory, or an empty string to opt out.
 * @param warn - Logger called once when grouping cannot be established.
 * @returns the original API for opt-out, otherwise an API with wrapped session creation.
 */
export declare function withSessionWorkspace(api: ApiProxy, workspacePath: string, warn: Warn): ApiProxy;
export {};
//# sourceMappingURL=session-workspace.d.ts.map