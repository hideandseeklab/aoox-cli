import {flush, handle, run, settings} from '@oclif/core'

/** Conventional exit code for a command stopped by Ctrl+C (128 + SIGINT). */
export const INTERRUPT_EXIT_CODE = 130

/** True for the error inquirer (and our own readline prompt) throws when the user presses Ctrl+C or closes the input. */
export function isPromptInterrupt(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError'
}

export interface InterruptIo {
  exit(code: number): unknown
  isTTY?: boolean
  write(text: string): unknown
}

const processIo: InterruptIo = {
  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- the CLI's own exit path (patched on Windows by windows-exit-fix)
  exit: (code) => process.exit(code),
  isTTY: process.stderr.isTTY,
  write: (text) => process.stderr.write(text),
}

/** Prints one plain line and exits 130; returns false (does nothing) for any other error. */
export function handleInterrupt(error: unknown, io: InterruptIo = processIo): boolean {
  if (!isPromptInterrupt(error)) return false
  // The cursor sits after the half-typed prompt: start a fresh line first.
  io.write(`${io.isTTY ? '\n' : ''}Aborted.\n`)
  io.exit(INTERRUPT_EXIT_CODE)
  return true
}

/**
 * Same as oclif's `execute`, except that a Ctrl+C at any prompt ends with a
 * short "Aborted." line and exit code 130 instead of a printed ExitPromptError.
 */
export async function executeCli(options: {development?: boolean; dir: string}): Promise<unknown> {
  if (options.development) {
    process.env.NODE_ENV = 'development'
    settings.debug = true
  }

  try {
    const result = await run(process.argv.slice(2), options.dir)
    flush()
    return result
  } catch (error) {
    if (handleInterrupt(error)) return undefined
    return handle(error as Error)
  }
}
