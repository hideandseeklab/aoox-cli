#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

// dev.js only ever runs from a checkout (never from the published package),
// so importing straight from src/ — instead of duplicating
// windows-exit-fix.ts here — is fine.
// eslint-disable-next-line n/no-unpublished-import
import {applyWindowsExitFix} from '../src/lib/windows-exit-fix.js'

// Must run before any command (and any fetch()) — see the doc comment on
// applyWindowsExitFix for why.
applyWindowsExitFix()

const {execute} = await import('@oclif/core')

await execute({development: true, dir: import.meta.url})
