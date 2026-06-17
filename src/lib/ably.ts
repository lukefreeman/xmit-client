import * as Ably from 'ably'
import { supabase } from './supabase.js'
import { logDebug } from './debug.js'

// High-latency clients (e.g. AU↔UK token-server round-trip) need more than
// Ably's 10s default to complete the auth + connection handshake, or the
// operation rejects and the connection never establishes.
const REALTIME_REQUEST_TIMEOUT = 20_000
const TOKEN_FETCH_TIMEOUT = 15_000

// server mode: XMIT_SERVER_URL set, token server auth. key mode: ABLY_API_KEY direct.
const serverUrl = (): string | undefined => process.env.XMIT_SERVER_URL?.replace(/\/+$/, '')

let client: Ably.Realtime | null = null

export function hasAblyConfig(): boolean {
  return Boolean(serverUrl() || process.env.ABLY_API_KEY)
}

export function channelName(slug: string): string {
  return `station:${slug}`
}

// global presence channel every logged-in user joins
export const GLOBAL_CHANNEL = 'xmit:online'

// fetch a signed Ably TokenRequest from the server; keeps the secret off the client
type AuthCb = (error: unknown, token: unknown) => void
async function requestToken(callback: AuthCb): Promise<void> {
  try {
    const url = serverUrl()
    if (!url) {
      logDebug('ably.token', 'XMIT_SERVER_URL not set')
      return callback('XMIT_SERVER_URL not set', null)
    }
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) {
      logDebug('ably.token', 'no Supabase access token (not signed in)')
      return callback('not signed in', null)
    }
    const res = await fetch(`${url}/ably/token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT),
    })
    if (!res.ok) {
      logDebug('ably.token', `token request failed: ${res.status} ${res.statusText}`)
      return callback(`token request failed (${res.status})`, null)
    }
    callback(null, await res.json())
  } catch (e) {
    // AbortError here means the token server didn't respond within the timeout —
    // the most likely failure for a far-away client hitting a single-region server.
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : 'auth error'
    logDebug('ably.token', `fetch threw — ${msg}`)
    callback(msg, null)
  }
}

export function getAblyClient(handle: string): Ably.Realtime {
  if (client) return client
  const key = process.env.ABLY_API_KEY
  if (serverUrl()) {
    client = new Ably.Realtime({
      clientId: handle,
      echoMessages: true,
      realtimeRequestTimeout: REALTIME_REQUEST_TIMEOUT,
      authCallback: (_params, callback) => void requestToken(callback as AuthCb),
    })
  } else if (key) {
    client = new Ably.Realtime({
      key,
      clientId: handle,
      echoMessages: true,
      realtimeRequestTimeout: REALTIME_REQUEST_TIMEOUT,
    })
  } else {
    throw new Error('No Ably config — set XMIT_SERVER_URL or ABLY_API_KEY')
  }
  // Log terminal connection failures so empty presence is root-causable; these
  // events would otherwise be invisible (and the optional layer must not crash).
  client.connection.on('failed', (s) => logDebug('ably.connection', `failed — ${s.reason?.message ?? 'unknown'}`))
  client.connection.on('suspended', (s) => logDebug('ably.connection', `suspended — ${s.reason?.message ?? 'no route to realtime'}`))
  return client
}

export function getChannel(handle: string, slug: string): Ably.RealtimeChannel {
  return getAblyClient(handle).channels.get(channelName(slug))
}

export function getGlobalChannel(handle: string): Ably.RealtimeChannel {
  return getAblyClient(handle).channels.get(GLOBAL_CHANNEL)
}

export type RealtimeStatus = 'connecting' | 'online' | 'offline'

// Subscribe to realtime connection status for the UI. Returns an unsubscribe fn.
// Degrades to 'offline' if the client can't even be constructed.
export function subscribeRealtimeStatus(handle: string, cb: (status: RealtimeStatus) => void): () => void {
  let client: Ably.Realtime
  try {
    client = getAblyClient(handle)
  } catch {
    cb('offline')
    return () => {}
  }
  const map = (state: string): RealtimeStatus =>
    state === 'connected' ? 'online' : state === 'failed' || state === 'suspended' ? 'offline' : 'connecting'
  const handler = (change: Ably.ConnectionStateChange): void => cb(map(change.current))
  client.connection.on(handler)
  cb(map(client.connection.state))
  return () => {
    try {
      client.connection.off(handler)
    } catch {}
  }
}

// presence count for the station list
export async function fetchPresenceCount(slug: string): Promise<number> {
  const url = serverUrl()
  if (url) {
    try {
      const res = await fetch(`${url}/presence/${encodeURIComponent(slug)}`)
      if (!res.ok) return 0
      const json = (await res.json()) as { count?: number }
      return json.count ?? 0
    } catch {
      return 0
    }
  }
  const key = process.env.ABLY_API_KEY
  if (!key) return 0
  try {
    const rest = new Ably.Rest({ key })
    const page = await rest.channels.get(channelName(slug)).presence.get()
    return page.items.length
  } catch {
    return 0
  }
}

export function closeAbly(): void {
  try {
    client?.close()
  } catch {}
  client = null
}
