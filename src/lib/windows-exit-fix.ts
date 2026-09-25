export interface ExitLike {
  exit(code?: number): unknown
  exitCode?: null | number | string
  platform: NodeJS.Platform
}

/**
 * Node crashes with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 * file src\win\async.c` **on Windows** when `process.exit()` runs after two
 * or more completed `fetch()` calls in the same process — a libuv/undici
 * socket-teardown race. Reproduced with plain Node (no oclif involved);
 * unaffected by the `connection: close` header (`api.ts` sends it anyway —
 * it still helps the *server* not hold a socket open) or by explicitly
 * closing undici's global dispatcher before exiting. Only letting Node drain
 * the event loop on its own (no explicit `process.exit()`) avoids it
 * reliably; a fixed delay before exiting "fixes" it too but only past ~100ms
 * in testing, which is not a bound worth trusting or paying on every error.
 *
 * `@oclif/core`'s own error handler (`errors/handle.js`) calls
 * `process.exit()` after every command error — including everything routed
 * through `this.error()`/`this.exit()` in this CLI — so on Windows this
 * replaces `process.exit` with a version that sets `process.exitCode` and
 * returns instead of terminating. Node then exits on its own once nothing
 * is pending, which in practice is immediate.
 *
 * Trade-off: oclif's SIGINT branch in that handler calls `process.exit(1)`
 * and then keeps running (prints the error) on its way to its own final
 * `process.exit()` call; with a non-terminating override that continuation
 * becomes observable. No command here relies on synchronous Ctrl+C
 * termination today — revisit if a streaming command (`aoox logs`) needs it.
 */
export function applyWindowsExitFix(proc: ExitLike = process): void {
  if (proc.platform !== 'win32') return
  proc.exit = (code?: number) => {
    proc.exitCode = code ?? proc.exitCode ?? 0
  }
}
