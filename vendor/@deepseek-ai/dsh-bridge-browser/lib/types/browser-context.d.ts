/**
 * Model-facing browser page context injected after an explicit tab handoff.
 *
 * The extension captures the page immediately after the user chooses to
 * follow it. A live Agent receives that snapshot at once; a deferred session
 * keeps only its newest snapshot until `agent/session-start` publishes the
 * Agent. Injection deliberately does not wake an idle Agent — the snapshot is
 * claimed together with the user's next message.
 *
 * @module
 */
import type { Agent, AgentRegistry } from '@deepseek-ai/dsh-agent';
import { type UserMessage } from '@deepseek-ai/dsh-llm';
/** Provenance key used for snapshot supersession and transcript presentation. */
export declare const BROWSER_CONTEXT_PLUGIN = "@deepseek-ai/dsh-bridge-browser";
/** Build one immutable context message from a captured browser snapshot. */
export declare function createBrowserSnapshotMessage(snapshot: string): UserMessage;
/** Deliver followed-page snapshots to live or not-yet-materialized Agents. */
export declare class BrowserContextInjector {
    private readonly agents;
    private readonly maxPending;
    private readonly pending;
    constructor(agents: Pick<AgentRegistry, 'get'>, maxPending?: number);
    /** Inject now when possible; otherwise retain the newest snapshot per session. */
    inject(sessionId: string, snapshot: string): 'injected' | 'queued';
    /** Flush one provisional session at the supported Agent startup boundary. */
    activate(agent: Agent): boolean;
}
//# sourceMappingURL=browser-context.d.ts.map