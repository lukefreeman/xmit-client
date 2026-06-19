import React, { useEffect, useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import { StatusBar } from '../components/StatusBar.js'
import { Panel } from '../components/Panel.js'
import { theme } from '../theme.js'
import { fetchLabels } from '../lib/supabase.js'
import { fetchPresenceCount, hasAblyConfig } from '../lib/ably.js'
import { accentColor } from '../lib/color.js'
import type { Label, User } from '../types/index.js'

interface Props {
  user: User
  online?: number
  realtimeOffline?: boolean // realtime connection down → presence/chat degraded
  update?: string | null // newer version available, if any
  onTuneIn: (label: Label) => void
  onLogout: () => void
  onManage: () => void
  onQuit: () => void
}

export function StationSelectScreen({ user, online, realtimeOffline, update, onTuneIn, onLogout, onManage, onQuit }: Props): React.ReactElement {
  const { stdout } = useStdout()
  const rows = stdout?.rows ?? 30
  const accent = accentColor(theme.accent)
  const [labels, setLabels] = useState<Label[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchLabels()
        if (cancelled) return
        setLabels(data)
        setLoading(false)
        if (hasAblyConfig()) {
          const entries = await Promise.all(
            data.map(async (l) => [l.slug, await fetchPresenceCount(l.slug)] as const),
          )
          if (!cancelled) setCounts(Object.fromEntries(entries))
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load stations')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useInput((input, key) => {
    if (key.escape) {
      onLogout()
      return
    }
    if (input === 'q' || input === 'Q') {
      onQuit()
      return
    }
    if (input === 'n' || input === 'N') {
      onManage()
      return
    }
    if (labels.length === 0) return
    if (key.upArrow || input === 'k') setIndex((i) => (i - 1 + labels.length) % labels.length)
    if (key.downArrow || input === 'j') setIndex((i) => (i + 1) % labels.length)
    if (key.return) {
      const label = labels[index]
      if (label) onTuneIn(label)
    }
  })

  return (
    <Box flexDirection="column" height={rows - 1} overflow="hidden" paddingX={1}>
      <StatusBar
        title="XMIT / STATIONS"
        handle={user.handle}
        accent={accent}
        online={online}
        keys="↑/↓ · enter tune in · n my stations · esc log out · Q quit"
      />

      {realtimeOffline ? (
        <Box paddingX={1}>
          <Text color={theme.error}>○ realtime offline</Text>
          <Text color={theme.dim}>{'  ·  presence & chat unavailable — live counts may be wrong'}</Text>
        </Box>
      ) : null}

      {update ? (
        <Box paddingX={1}>
          <Text color={accent}>↑ xmit v{update} available</Text>
          <Text color={theme.dim}>{'  ·  curl -fsSL https://raw.githubusercontent.com/lukefreeman/xmit-client/main/packaging/install.sh | sh  ·  or https://xmit.netlify.app/'}</Text>
        </Box>
      ) : null}

      <Box flexGrow={1}>
        <Panel title="STATIONS" count={labels.length} accent={accent} focused grow>
          <Box flexDirection="column" marginTop={1}>
            {loading ? (
              <Text color={theme.dim}>scanning the airwaves…</Text>
            ) : error ? (
              <Text color={theme.error}>✕ {error}</Text>
            ) : labels.length === 0 ? (
              <Text color={theme.dim}>no stations on air — press n to create one</Text>
            ) : (
              labels.map((l, i) => {
                const active = i === index
                const count = counts[l.slug] ?? 0
                const ac = accent
                return (
                  <Box key={l.id} flexDirection="column" marginBottom={1}>
                    <Box>
                      <Text color={active ? ac : theme.dim}>{active ? '▶ ' : '  '}</Text>
                      <Text color={ac} bold={active}>
                        {l.name}
                      </Text>
                      <Text color={theme.dim}>{'   '}</Text>
                      <Text color={count > 0 ? theme.success : theme.dim}>● {count} live</Text>
                    </Box>
                    <Box paddingLeft={2}>
                      <Text color={active ? theme.muted : theme.dim} wrap="truncate-end">
                        {l.description}
                      </Text>
                    </Box>
                  </Box>
                )
              })
            )}
          </Box>
        </Panel>
      </Box>
    </Box>
  )
}
