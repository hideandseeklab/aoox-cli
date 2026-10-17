#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

// dev.js only ever runs from a checkout (never from the published package),
// so importing straight from src/ — instead of duplicating
// windows-exit-fix.ts here — is fine.
// eslint-disable-next-line n/no-unpublished-import
import {executeCli} from '../src/lib/interrupt.js'
// eslint-disable-next-line n/no-unpublished-import
import {applySystemCa} from '../src/lib/system-ca.js'
// eslint-disable-next-line n/no-unpublished-import
import {applyWindowsExitFix} from '../src/lib/windows-exit-fix.js'

// Must run before any command (and any fetch()) — see the doc comment on
// applyWindowsExitFix for why.
applyWindowsExitFix()

// Trust the OS certificate store too (antivirus HTTPS scanning, corporate proxies).
// Runs before the first fetch(); opt out with AOOX_SYSTEM_CA=0.
applySystemCa()

await executeCli({development: true, dir: import.meta.url})
