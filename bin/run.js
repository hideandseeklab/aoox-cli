#!/usr/bin/env node

import {applyWindowsExitFix} from '../dist/lib/windows-exit-fix.js'

// Must run before any command (and any fetch()) — see the doc comment on
// applyWindowsExitFix for why.
applyWindowsExitFix()

const {execute} = await import('@oclif/core')

await execute({dir: import.meta.url})
