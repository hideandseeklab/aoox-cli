#!/usr/bin/env node

import {applySystemCa} from '../dist/lib/system-ca.js'
import {applyWindowsExitFix} from '../dist/lib/windows-exit-fix.js'

// Must run before any command (and any fetch()) — see the doc comment on
// applyWindowsExitFix for why.
applyWindowsExitFix()

// Trust the OS certificate store too (antivirus HTTPS scanning, corporate proxies).
// Runs before the first fetch(); opt out with AOOX_SYSTEM_CA=0.
applySystemCa()

const {execute} = await import('@oclif/core')

await execute({dir: import.meta.url})
