/**
 * Host half of dsh-plugin-redai-nav.
 *
 * The panel is entirely a browser-side concern: the sidebar entry and its main
 * panel are registered from ./client.js against the client slot system. The
 * host row exists only so the bundle has a loader entry the client module graph
 * is composed from.
 *
 * Keeping this half empty is deliberate: dsh runs installed host plugin code
 * in-process, outside the workspace sandbox, with full access to the user's
 * credentials, sessions and filesystem. This plugin declares no such capability.
 */

/** Provides no host-side behavior. */
export function apply() {}
