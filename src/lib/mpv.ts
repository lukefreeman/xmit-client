import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

// unix socket on macOS/Linux, named pipe on Windows
const SOCKET =
  process.platform === 'win32' ? `\\\\.\\pipe\\xmit-mpv-${process.pid}` : '/tmp/xmit-mpv.sock'

// override → bundled next to the executable → system mpv on PATH
function resolveMpv(): string {
  const override = process.env.XMIT_MPV_PATH
  if (override && existsSync(override)) return override
  const dir = dirname(process.execPath)
  const exe = process.platform === 'win32' ? 'mpv.exe' : 'mpv'
  const candidates = [
    join(dir, exe),
    join(dir, 'bin', exe),
    join(dir, 'mpv', exe),
    join(dir, 'vendor', exe),
    join(dir, 'mpv.app', 'Contents', 'MacOS', 'mpv'),
  ]
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c
    } catch {}
  }
  return 'mpv'
}

const MPV_BIN = resolveMpv()

// drives a single idle mpv instance over its JSON IPC socket
class MpvController {
  private proc: ChildProcess | null = null
  private socket: net.Socket | null = null
  private connected = false
  private reqId = 100
  private pending = new Map<number, (value: unknown) => void>()
  private buffer = ''

  // false if mpv isn't installed or the socket never comes up
  available = false
  lastError: string | null = null

  async start(): Promise<void> {
    if (this.proc) return
    try {
      if (existsSync(SOCKET)) rmSync(SOCKET)
    } catch {}

    try {
      this.proc = spawn(
        MPV_BIN,
        ['--no-video', '--idle=yes', '--really-quiet', '--no-terminal', `--input-ipc-server=${SOCKET}`],
        { stdio: 'ignore' },
      )
    } catch {
      this.available = false
      this.lastError = 'mpv not found — install it (e.g. `brew install mpv`) to enable playback'
      throw new Error(this.lastError)
    }

    this.proc.on('error', () => {
      this.available = false
      this.lastError = 'mpv not found — install it (e.g. `brew install mpv`) to enable playback'
    })
    this.proc.on('exit', () => {
      this.connected = false
      this.available = false
    })

    await this.connectSocket()
    this.available = true
  }

  private connectSocket(retries = 50): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = (n: number): void => {
        const sock = net.createConnection(SOCKET)
        sock.once('connect', () => {
          this.socket = sock
          this.connected = true
          sock.on('data', (d) => this.onData(d))
          sock.on('close', () => {
            this.connected = false
          })
          resolve()
        })
        sock.once('error', () => {
          sock.destroy()
          if (n <= 0) {
            this.lastError = 'Could not connect to mpv IPC socket'
            reject(new Error(this.lastError))
            return
          }
          setTimeout(() => attempt(n - 1), 100)
        })
      }
      attempt(retries)
    })
  }

  private onData(data: Buffer | string): void {
    this.buffer += data.toString()
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 1)
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as { request_id?: number; error?: string; data?: unknown }
        if (msg.request_id && this.pending.has(msg.request_id)) {
          const resolver = this.pending.get(msg.request_id)!
          this.pending.delete(msg.request_id)
          resolver(msg.error === 'success' ? msg.data : null)
        }
      } catch {}
    }
  }

  private send(command: unknown[]): void {
    if (!this.socket || !this.connected) return
    try {
      this.socket.write(JSON.stringify({ command }) + '\n')
    } catch {}
  }

  private request(command: unknown[]): Promise<unknown> {
    return new Promise((resolve) => {
      if (!this.socket || !this.connected) {
        resolve(null)
        return
      }
      const id = this.reqId++
      this.pending.set(id, resolve)
      try {
        this.socket.write(JSON.stringify({ command, request_id: id }) + '\n')
      } catch {
        this.pending.delete(id)
        resolve(null)
        return
      }
      // don't let a missing reply wedge the poller
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve(null)
        }
      }, 1000)
    })
  }

  play(url: string): void {
    this.send(['loadfile', url])
    this.send(['set_property', 'pause', false])
  }
  pause(): void {
    this.send(['cycle', 'pause'])
  }
  seek(seconds: number): void {
    this.send(['seek', seconds, 'relative'])
  }
  volume(delta: number): void {
    this.send(['add', 'volume', delta])
  }
  stop(): void {
    this.send(['stop'])
  }

  async getPosition(): Promise<number> {
    const v = await this.request(['get_property', 'time-pos'])
    return typeof v === 'number' ? v : 0
  }
  async getDuration(): Promise<number> {
    const v = await this.request(['get_property', 'duration'])
    return typeof v === 'number' ? v : 0
  }
  async isPaused(): Promise<boolean> {
    return Boolean(await this.request(['get_property', 'pause']))
  }
  async getBitrate(): Promise<number> {
    const v = await this.request(['get_property', 'audio-bitrate'])
    return typeof v === 'number' ? Math.round(v / 1000) : 0 // kbps
  }

  kill(): void {
    try {
      this.socket?.destroy()
    } catch {}
    try {
      this.proc?.kill('SIGTERM')
    } catch {}
    try {
      if (existsSync(SOCKET)) rmSync(SOCKET)
    } catch {}
    this.proc = null
    this.socket = null
    this.connected = false
  }
}

export const mpv = new MpvController()
