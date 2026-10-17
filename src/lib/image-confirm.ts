import {input} from '@inquirer/prompts'
import {createInterface} from 'node:readline'

import {ImageNameError, parseImageName} from './image-ref.js'

export interface ConfirmPrompts {
  choose(message: string): Promise<'edit' | 'no' | 'yes'>
  edit(current: string): Promise<string>
}

export type ConfirmOutcome = {edited: boolean; kind: 'use'; raw: string} | {kind: 'abort'} | {kind: 'refuse'}

/** `true` for a valid `[host/]name:version` with a version, otherwise the message to show. */
export function validateNameVersion(value: string): string | true {
  try {
    if (!parseImageName(value).tag) return 'A version is required (name:version).'
    return true
  } catch (error) {
    if (error instanceof ImageNameError) return error.message
    throw error
  }
}

/** Maps one typed line to a choice: `y`/`yes`/empty, `n`/`no`, `e`/`edit` (case-insensitive); anything else is `undefined`. */
export function parseChoice(line: string): 'edit' | 'no' | 'yes' | undefined {
  switch (line.trim().toLowerCase()) {
    case '':
    case 'y':
    case 'yes': {
      return 'yes'
    }

    case 'e':
    case 'edit': {
      return 'edit'
    }

    case 'n':
    case 'no': {
      return 'no'
    }

    default: {
      return undefined
    }
  }
}

/**
 * Asks `message (Y/n/e)` on one line and re-asks on anything else. Ctrl+C (or
 * a closed input) rejects with an `ExitPromptError`, as the inquirer prompts do.
 */
export function askChoice(
  message: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<'edit' | 'no' | 'yes'> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({input, output, terminal: Boolean((input as {isTTY?: boolean}).isTTY)})
    let done = false
    const finish = (settle: () => void) => {
      done = true
      rl.close()
      settle()
    }

    const exit = (reason: string) => {
      if (done) return
      finish(() => {
        const error = new Error(`User force closed the prompt with ${reason}`)
        error.name = 'ExitPromptError'
        reject(error)
      })
    }

    const ask = () => {
      rl.question(`? ${message} (Y/n/e) `, (line) => {
        const choice = parseChoice(line)
        if (choice) finish(() => resolve(choice))
        else {
          output.write('Please answer Y (yes), n (no) or e (edit).\n')
          ask()
        }
      })
    }

    rl.on('SIGINT', () => exit('SIGINT'))
    rl.on('close', () => exit('close'))
    ask()
  })
}

export const inquirerPrompts: ConfirmPrompts = {
  choose: (message) => askChoice(message),
  edit: (current) => input({default: current, message: 'Image (name:version)', validate: validateNameVersion}),
}

/**
 * A fully typed `name:version` never asks. A derived one asks (Yes / No / Edit)
 * unless `yes`; with nobody to ask (`interactive` false) it refuses instead of
 * silently building a derived name.
 */
export async function confirmDerived(options: {
  derived: boolean
  interactive: boolean
  prompts?: ConfirmPrompts
  raw: string
  verb: string
  yes: boolean
}): Promise<ConfirmOutcome> {
  const {derived, interactive, raw, verb, yes} = options
  if (!derived || yes) return {edited: false, kind: 'use', raw}
  if (!interactive) return {kind: 'refuse'}
  const prompts = options.prompts ?? inquirerPrompts
  const answer = await prompts.choose(`${verb} ${raw}?`)
  if (answer === 'no') return {kind: 'abort'}
  if (answer === 'edit') return {edited: true, kind: 'use', raw: (await prompts.edit(raw)).trim()}
  return {edited: false, kind: 'use', raw}
}

/** False without a terminal or in a CI environment. */
export function isInteractive(env: NodeJS.ProcessEnv = process.env, tty: boolean = Boolean(process.stdin.isTTY)): boolean {
  return tty && !env.CI
}
