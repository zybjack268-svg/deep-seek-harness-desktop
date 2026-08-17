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
import { createUserMessage } from '@deepseek-ai/dsh-llm';
/** Provenance key used for snapshot supersession and transcript presentation. */
export const BROWSER_CONTEXT_PLUGIN = '@deepseek-ai/dsh-bridge-browser';
/** Bound orphaned provisional sessions while retaining normal recent tabs. */
const DEFAULT_MAX_PENDING = 32;
/** Build one immutable context message from a captured browser snapshot. */
export function createBrowserSnapshotMessage(snapshot) {
    const text = [
        'The user chose to follow the newly active browser tab. The browser page context was refreshed immediately after that choice.',
        'The following browser_snapshot is the current page state. Use it for the next request instead of asking whether the page was read.',
        snapshot,
    ].join('\n\n');
    return createUserMessage({
        content: [{ type: 'text', text }],
        source: {
            kind: 'plugin',
            plugin: BROWSER_CONTEXT_PLUGIN,
            form: 'snapshot',
            sections: [{ name: 'browser-page', text }],
        },
    });
}
/** Deliver followed-page snapshots to live or not-yet-materialized Agents. */
export class BrowserContextInjector {
    agents;
    maxPending;
    pending = new Map();
    constructor(agents, maxPending = DEFAULT_MAX_PENDING) {
        this.agents = agents;
        this.maxPending = maxPending;
        if (!Number.isInteger(maxPending) || maxPending < 1) {
            throw new Error('browser context maxPending must be a positive integer');
        }
    }
    /** Inject now when possible; otherwise retain the newest snapshot per session. */
    inject(sessionId, snapshot) {
        const agent = this.agents.get(sessionId);
        if (agent !== undefined) {
            this.pending.delete(sessionId);
            agent.inject(createBrowserSnapshotMessage(snapshot));
            return 'injected';
        }
        // Refresh insertion order when the same provisional session follows again.
        this.pending.delete(sessionId);
        while (this.pending.size >= this.maxPending) {
            const oldest = this.pending.keys().next().value;
            if (oldest === undefined)
                break;
            this.pending.delete(oldest);
        }
        this.pending.set(sessionId, snapshot);
        return 'queued';
    }
    /** Flush one provisional session at the supported Agent startup boundary. */
    activate(agent) {
        const sessionId = String(agent.id);
        const snapshot = this.pending.get(sessionId);
        if (snapshot === undefined)
            return false;
        agent.inject(createBrowserSnapshotMessage(snapshot));
        this.pending.delete(sessionId);
        return true;
    }
}
//# sourceMappingURL=browser-context.js.map