/**
 * Shell-quote a string for safe use as a single argument in shell commands.
 * Uses single-quote wrapping with proper escaping of embedded single quotes.
 */
export const shellQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`
