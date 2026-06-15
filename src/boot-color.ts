// must be imported before ink/chalk evaluate colour support.
// XMIT_TRUECOLOR=1 forces truecolor when COLORTERM isn't forwarded (e.g. SSH).
// don't set it on a 256-colour terminal: forcing 24-bit there renders gray.
if (process.env.XMIT_TRUECOLOR === '1' && process.stdout.isTTY && !process.env.COLORTERM) {
  process.env.COLORTERM = 'truecolor'
}
