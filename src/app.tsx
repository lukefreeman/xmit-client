import React, { useEffect, useState } from 'react'
import { Box, Text, useApp, useStdout } from 'ink'
import { Logo } from './components/Logo.js'
import { AuthScreen } from './screens/AuthScreen.js'
import { StationSelectScreen } from './screens/StationSelectScreen.js'
import { TuneInScreen } from './screens/TuneInScreen.js'
import { ManageScreen } from './screens/ManageScreen.js'
import { theme, MIN_COLS, MIN_ROWS } from './theme.js'
import { hasSupabaseConfig } from './lib/supabase.js'
import { logout } from './lib/auth.js'
import { getGlobalChannel, hasAblyConfig, subscribeRealtimeStatus, type RealtimeStatus } from './lib/ably.js'
import { accentColor } from './lib/color.js'
import { mpv } from './lib/mpv.js'
import { checkForUpdate } from './lib/update.js'
import type { Label, Screen, User } from './types/index.js'

export function App(): React.ReactElement {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [booting, setBooting] = useState(true)
  const [screen, setScreen] = useState<Screen>('auth')
  const [user, setUser] = useState<User | null>(null)
  const [label, setLabel] = useState<Label | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [online, setOnline] = useState(0)
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting')
  const [update, setUpdate] = useState<string | null>(null)

  // track realtime connection status so the UI can show a degraded indicator
  // instead of mistaking a dead connection for "nobody online"
  useEffect(() => {
    if (!user || !hasAblyConfig()) return
    return subscribeRealtimeStatus(user.handle, setRealtime)
  }, [user])

  // global presence: one shared channel drives the header's "N online"
  useEffect(() => {
    if (!user || !hasAblyConfig()) return
    let channel: ReturnType<typeof getGlobalChannel>
    try {
      channel = getGlobalChannel(user.handle)
    } catch {
      return // realtime unavailable → header just shows no presence
    }
    let active = true
    const refresh = async (): Promise<void> => {
      try {
        const members = await channel.presence.get()
        if (active) setOnline(members.length)
      } catch {}
    }
    void (async () => {
      try {
        await channel.presence.enter({ handle: user.handle })
        await channel.presence.subscribe(['enter', 'leave', 'update'], () => void refresh())
        await refresh()
      } catch {}
    })()
    return () => {
      active = false
      setOnline(0)
      void (async () => {
        try {
          channel.presence.unsubscribe()
          await channel.presence.leave()
          channel.detach()
        } catch {}
      })()
    }
  }, [user])

  // re-render on resize so JS-computed panel sizes recompute
  const [, setResizeTick] = useState(0)
  useEffect(() => {
    const onResize = (): void => setResizeTick((n) => n + 1)
    process.stdout.on('resize', onResize)
    return () => {
      process.stdout.off('resize', onResize)
    }
  }, [])

  // boot: validate config and warm up mpv
  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setFatal('Missing SUPABASE_URL / SUPABASE_ANON_KEY. Copy .env.example to .env and fill it in.')
      setBooting(false)
      return
    }
    // mpv optional: playback disabled if absent
    mpv.start().catch(() => {})
    setBooting(false)
    void checkForUpdate().then(setUpdate)
  }, [])

  const cols = stdout?.columns ?? 120
  const rows = stdout?.rows ?? 30
  const tooSmall = cols < MIN_COLS || rows < MIN_ROWS

  if (fatal) {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={2}>
        <Logo />
        <Box marginTop={1} borderStyle="round" borderColor={theme.error} paddingX={2} paddingY={1}>
          <Text color={theme.error}>✕ {fatal}</Text>
        </Box>
        <Text color={theme.dim}>press Ctrl+C to exit</Text>
      </Box>
    )
  }

  if (booting) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>
        <Logo />
        <Box marginTop={1}>
          <Text color={accentColor(theme.accent)}>· connecting to the grid…</Text>
        </Box>
      </Box>
    )
  }

  if (tooSmall) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color={theme.error}>terminal too small</Text>
        <Text color={theme.muted}>
          need at least {MIN_COLS}×{MIN_ROWS} — current {cols}×{rows}
        </Text>
        <Text color={theme.dim}>resize and it'll redraw</Text>
      </Box>
    )
  }

  const quit = (): void => exit()

  if (screen === 'auth' || !user) {
    return (
      <AuthScreen
        onAuthed={(u) => {
          setUser(u)
          setScreen('stations')
        }}
        onQuit={quit}
      />
    )
  }

  if (screen === 'stations') {
    return (
      <StationSelectScreen
        user={user}
        online={hasAblyConfig() ? online : undefined}
        realtimeOffline={hasAblyConfig() && realtime === 'offline'}
        update={update}
        onTuneIn={(l) => {
          setLabel(l)
          setScreen('tunein')
        }}
        onLogout={() => {
          void logout()
          setUser(null)
          setLabel(null)
          setScreen('auth')
        }}
        onManage={() => setScreen('manage')}
        onQuit={quit}
      />
    )
  }

  if (screen === 'manage') {
    return <ManageScreen user={user} onExit={() => setScreen('stations')} />
  }

  if (screen === 'tunein' && label) {
    return (
      <TuneInScreen
        user={user}
        label={label}
        online={hasAblyConfig() ? online : undefined}
        onLeave={() => {
          mpv.stop()
          setLabel(null)
          setScreen('stations')
        }}
        onQuit={quit}
      />
    )
  }

  return (
    <Box>
      <Text color={theme.muted}>…</Text>
    </Box>
  )
}
