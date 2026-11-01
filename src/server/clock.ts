import "server-only";

/** Current time for request-time server rendering (admin pages are always dynamic). */
export const nowMs = (): number => Date.now();
