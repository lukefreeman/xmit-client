import { supabase, hasSupabaseConfig } from './supabase.js'
import type { User } from '../types/index.js'

// handles map to synthetic emails under this domain. keep STABLE: changing it
// orphans every existing account (stays 'bane.local' despite the XMIT rename).
const EMAIL_DOMAIN = 'bane.local'
const handleToEmail = (handle: string): string => `${handle.toLowerCase()}@${EMAIL_DOMAIN}`

export const HANDLE_RE = /^[a-z0-9_]{2,24}$/i

function assertConfig(): void {
  if (!hasSupabaseConfig()) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not set — copy .env.example to .env')
  }
}

async function profileInfo(id: string, fallbackHandle: string): Promise<{ handle: string; canPublish: boolean }> {
  const { data } = await supabase.from('profiles').select('handle, can_publish').eq('id', id).single()
  return { handle: data?.handle ?? fallbackHandle, canPublish: Boolean(data?.can_publish) }
}

// Redeem an invite code to unlock publishing for the signed-in user.
// Throws with a human-readable message on any failure.
export async function redeemInvite(code: string): Promise<void> {
  const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code.trim() })
  if (error) throw new Error(error.message || 'Could not redeem invite')
  if (!data) throw new Error('Invalid invite code')
}

export async function register(handle: string, password: string): Promise<User> {
  assertConfig()
  if (!HANDLE_RE.test(handle)) {
    throw new Error('Handle must be 2-24 chars: letters, numbers, underscore')
  }
  if (password.length < 6) throw new Error('Password must be at least 6 characters')

  // pre-check for a clean error; the unique index is the real race guard
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', handle)
    .maybeSingle()
  if (existing) throw new Error('Handle already taken')

  const { data, error } = await supabase.auth.signUp({
    email: handleToEmail(handle),
    password,
  })
  if (error) {
    if (/already registered/i.test(error.message)) throw new Error('Handle already taken')
    throw new Error(error.message)
  }
  const uid = data.user?.id
  if (!uid) throw new Error('Registration failed')

  const { error: pErr } = await supabase.from('profiles').insert({ id: uid, handle })
  if (pErr) {
    if (/duplicate|unique/i.test(pErr.message)) throw new Error('Handle already taken')
    throw new Error('Could not reserve handle')
  }

  // sign in explicitly if signUp didn't establish a session
  if (!data.session) {
    await supabase.auth.signInWithPassword({ email: handleToEmail(handle), password })
  }
  // new accounts can listen but not publish until they redeem an invite
  return { id: uid, handle, canPublish: false }
}

export async function login(handle: string, password: string): Promise<User> {
  assertConfig()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: handleToEmail(handle),
    password,
  })
  if (error || !data.user) throw new Error('Invalid handle or password')
  const info = await profileInfo(data.user.id, handle)
  return { id: data.user.id, handle: info.handle, canPublish: info.canPublish }
}

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {}
}
