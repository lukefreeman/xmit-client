import React from 'react'
import { Text } from 'ink'
import { Panel } from './Panel.js'
import { ScrollList } from './ScrollList.js'
import { theme } from '../theme.js'
import { fmtTime, padRow } from '../lib/format.js'
import type { Track } from '../types/index.js'

interface Props {
  releaseTitle: string
  tracks: Track[]
  index: number
  focused: boolean
  playingId: string | null
  accent: string
  width: number // inner content width
}

export function TracksPanel({
  releaseTitle,
  tracks,
  index,
  focused,
  playingId,
  accent,
  width,
}: Props): React.ReactElement {
  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0)

  const rows = tracks.map((t, i) => {
    const active = i === index
    const playing = t.id === playingId
    const line = padRow(width, `${playing ? '♪' : ' '} ${t.title}`, fmtTime(t.duration))
    if (active) {
      return (
        <Text key={t.id} backgroundColor={accent} color={theme.bg} bold wrap="truncate-end">
          {line}
        </Text>
      )
    }
    return (
      <Text key={t.id} color={playing ? accent : theme.muted} bold={playing} wrap="truncate-end">
        {line}
      </Text>
    )
  })

  return (
    <Panel
      title="TRACKS"
      accent={accent}
      focused={focused}
      grow={2}
      right={<Text color={focused ? accent : theme.dim}>◎</Text>}
    >
      <Text color={theme.dim}>{(releaseTitle || '—').toLowerCase()}</Text>
      {tracks.length === 0 ? (
        <Text color={theme.dim}>—</Text>
      ) : (
        <ScrollList rows={rows} selectedIndex={index} follow="selection" accent={accent} />
      )}
      <Text color={theme.dim}>
        — {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'} · {fmtTime(total)} total
      </Text>
    </Panel>
  )
}
