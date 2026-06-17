import './boot-color.js' // must precede ink (sets COLORTERM)
import React from 'react'
import { render } from 'ink'
import { App } from './app.js'
import { mpv } from './lib/mpv.js'
import { closeAbly } from './lib/ably.js'
import { wipeSessions } from './lib/session.js'
import { logDebug } from './lib/debug.js'
import { theme } from './theme.js'

const ALT_SCREEN_ON = '\x1b[?1049h'
const ALT_SCREEN_OFF = '\x1b[?1049l'
const CLEAR = '\x1b[2J\x1b[3J\x1b[H'
const SHOW_CURSOR = '\x1b[?25h'
// OSC 10/11 force fg/bg; 110/111 reset. Holds our colours on light themes.
const SET_COLORS = `\x1b]10;${theme.text}\x07\x1b]11;${theme.bg}\x07`
const RESET_COLORS = '\x1b]110\x07\x1b]111\x07'

const isTTY = Boolean(process.stdout.isTTY)

if (isTTY) process.stdout.write(ALT_SCREEN_ON + SET_COLORS + CLEAR)

// clear before Ink repaints; otherwise it ghosts after a width reflow
const onResize = (): void => {
  if (isTTY) process.stdout.write(CLEAR)
}
process.stdout.on('resize', onResize)

let cleanedUp = false
function cleanup(): void {
  if (cleanedUp) return
  cleanedUp = true
  process.stdout.off('resize', onResize)
  closeAbly()
  mpv.kill()
  wipeSessions()
  if (isTTY) process.stdout.write(RESET_COLORS + ALT_SCREEN_OFF + SHOW_CURSOR)
}

// Graceful degradation is load-bearing: a stray rejection from the OPTIONAL
// realtime/presence layer (e.g. Ably's ~10s connection timeout firing from
// inside the library, past our try/catch) must NOT kill the app. Bun would
// otherwise terminate the process on an unhandled rejection. Log and continue.
process.on('unhandledRejection', (reason) => {
  logDebug('unhandledRejection', reason)
})

// An uncaught exception is genuinely unrecoverable. Restore the terminal BEFORE
// printing, otherwise the trace lands in the alt-screen buffer and is wiped on
// exit — which reads as a silent exit (notably in Warp, which clears it).
process.on('uncaughtException', (err) => {
  logDebug('uncaughtException', err)
  cleanup()
  // eslint-disable-next-line no-console
  console.error('\nxmit crashed:\n', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})

const { waitUntilExit } = render(React.createElement(App), {
  exitOnCtrlC: true,
})

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    cleanup()
    process.exit(0)
  })
}

waitUntilExit()
  .then(() => {
    cleanup()
    process.exit(0)
  })
  .catch((err) => {
    logDebug('render', err)
    cleanup()
    // eslint-disable-next-line no-console
    console.error('\nxmit crashed:\n', err instanceof Error ? (err.stack ?? err.message) : err)
    process.exit(1)
  })
