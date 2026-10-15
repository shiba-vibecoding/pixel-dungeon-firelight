/*
 * What the console's errors are worth reporting (report.ts). A script from another origin (Telegram's SDK, the webview's
 * own injections) that threw: the browser hides what and where, saying only «Script error.», which is nothing to act on.
 * Our own scripts are same-origin (Vite marks the built ones crossorigin) and always say. Not reported.
 */
export function opaqueError(event: Pick<ErrorEvent, 'message' | 'filename' | 'lineno' | 'error'>): boolean {
  return /^script error\.?$/i.test(event.message.trim()) && !event.filename && !event.lineno && !event.error;
}
