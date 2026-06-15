import React from 'react'
import { Text } from 'ink'
import { Panel } from './Panel.js'
import { ScrollList } from './ScrollList.js'
import { theme } from '../theme.js'
import { padRow } from '../lib/format.js'
import type { Release } from '../types/index.js'

interface Props {
  releases: Release[]
  index: number
  focused: boolean
  accent: string
  width: number // inner content width
  loading: boolean
}

export function ReleasesPanel({ releases, index, focused, accent, width, loading }: Props): React.ReactElement {
  const rows = releases.map((r, i) => {
    const active = i === index
    // pad one cell short: the ▶ marker can render wider than measured
    const line = padRow(width - 1, `${active ? '▶' : ' '} ${r.title}`, `${r.track_count ?? 0} trx`)
    return (
      <Text
        key={r.id}
        color={active ? (focused ? accent : theme.text) : theme.muted}
        bold={active}
        wrap="truncate-end"
      >
        {line}
      </Text>
    )
  })

  return (
    <Panel title="RELEASES" count={releases.length} accent={accent} focused={focused} grow={1}>
      {loading ? (
        <Text color={theme.dim}>loading…</Text>
      ) : releases.length === 0 ? (
        <Text color={theme.dim}>no releases yet</Text>
      ) : (
        <ScrollList rows={rows} selectedIndex={index} follow="selection" accent={accent} />
      )}
    </Panel>
  )
}
