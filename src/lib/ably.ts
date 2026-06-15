import * as Ably from 'ably'
import { supabase } from './supabase.js'

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
    if (!url) return callback('XMIT_SERVER_URL not set', null)
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return callback('not signed in', null)
    const res = await fetch(`${url}/ably/token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return callback(`token request failed (${res.status})`, null)
    callback(null, await res.json())
  } catch (e) {
    callback(e instanceof Error ? e.message : 'auth error', null)
  }
}

export function getAblyClient(handle: string): Ably.Realtime {
  if (client) return client
  const key = process.env.ABLY_API_KEY
  if (serverUrl()) {
    client = new Ably.Realtime({
      clientId: handle,
      echoMessages: true,
      authCallback: (_params, callback) => void requestToken(callback as AuthCb),
    })
  } else if (key) {
    client = new Ably.Realtime({ key, clientId: handle, echoMessages: true })
  } else {
    throw new Error('No Ably config — set XMIT_SERVER_URL or ABLY_API_KEY')
  }
  return client
}

export function getChannel(handle: string, slug: string): Ably.RealtimeChannel {
  return getAblyClient(handle).channels.get(channelName(slug))
}

export function getGlobalChannel(handle: string): Ably.RealtimeChannel {
  return getAblyClient(handle).channels.get(GLOBAL_CHANNEL)
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
