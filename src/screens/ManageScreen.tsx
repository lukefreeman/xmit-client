import React, { useEffect, useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import TextInput from 'ink-text-input'
import { basename } from 'node:path'
import { StatusBar } from '../components/StatusBar.js'
import { Panel } from '../components/Panel.js'
import { ScrollList } from '../components/ScrollList.js'
import { theme } from '../theme.js'
import { fmtTime } from '../lib/format.js'
import { fetchReleases, fetchTracks } from '../lib/supabase.js'
import {
  fetchMyStations,
  createStation,
  updateStation,
  deleteStation,
  createRelease,
  updateRelease,
  deleteRelease,
  updateTrack,
  deleteTrack,
  addTrack,
} from '../lib/library.js'
import { findAudioFiles, readAudioMeta } from '../lib/metadata.js'
import { uploadAudio, deleteAudio } from '../lib/upload.js'
import { redeemInvite } from '../lib/auth.js'
import { accentColor } from '../lib/color.js'
import type { Label, Release, Track, User } from '../types/index.js'

const MAX_TRACKS_PER_RELEASE = 10

type View =
  | 'gate'
  | 'list'
  | 'newStation'
  | 'editStation'
  | 'station'
  | 'newRelease'
  | 'release'
  | 'renameRelease'
  | 'renameTrack'
  | 'addTracks'

interface UploadRow {
  name: string
  status: string
}
type Confirm = { kind: 'station' | 'release' | 'track'; name: string } | null

interface Props {
  user: User
  onExit: () => void
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function ManageScreen({ user, onExit }: Props): React.ReactElement {
  const { stdout } = useStdout()
  const [canPublish, setCanPublish] = useState(user.canPublish)
  const [view, setView] = useState<View>(user.canPublish ? 'list' : 'gate')
  const [code, setCode] = useState('')
  const [stations, setStations] = useState<Label[]>([])
  const [stationIdx, setStationIdx] = useState(0)
  const [station, setStation] = useState<Label | null>(null)
  const [releases, setReleases] = useState<Release[]>([])
  const [releaseIdx, setReleaseIdx] = useState(0)
  const [release, setRelease] = useState<Release | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [trackIdx, setTrackIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  // forms
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [field, setField] = useState(0)
  const [relTitle, setRelTitle] = useState('')
  const [rename, setRename] = useState('')
  const [path, setPath] = useState('~/Music')
  const [uploads, setUploads] = useState<UploadRow[]>([])

  const loadStations = async (): Promise<void> => {
    try {
      setStations(await fetchMyStations(user.id))
    } catch (e) {
      setError(msg(e))
    }
  }
  const loadReleases = async (labelId: string): Promise<void> => {
    try {
      setReleases(await fetchReleases(labelId))
    } catch (e) {
      setError(msg(e))
    }
  }
  const loadTracks = async (releaseId: string): Promise<void> => {
    try {
      setTracks(await fetchTracks(releaseId))
    } catch (e) {
      setError(msg(e))
    }
  }

  useEffect(() => {
    if (canPublish) void loadStations()
  }, [])

  const flash = (m: string): void => {
    setInfo(m)
    setError(null)
  }

  const submitCode = async (): Promise<void> => {
    if (busy) return
    if (!code.trim()) {
      setError('Enter an invite code')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await redeemInvite(code)
      setCanPublish(true)
      setView('list')
      await loadStations()
      flash('publishing unlocked — welcome aboard')
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const submitStation = async (): Promise<void> => {
    if (busy) return
    if (!name.trim()) {
      setError('Station needs a name')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (editing && station) {
        await updateStation(station.id, { name, description: desc })
        setStation({ ...station, name, description: desc })
        await loadStations()
        setView('station')
        flash('station updated')
      } else {
        const s = await createStation(user, { name, description: desc, accent_color: theme.accent })
        await loadStations()
        setStation(s)
        await loadReleases(s.id)
        setReleaseIdx(0)
        setView('station')
        flash(`created ${s.name}`)
      }
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const submitRelease = async (): Promise<void> => {
    if (busy || !station) return
    if (!relTitle.trim()) {
      setError('Release needs a title')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createRelease(user, station.id, relTitle)
      await loadReleases(station.id)
      setView('station')
      flash('release added')
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const submitRenameRelease = async (): Promise<void> => {
    if (busy || !release || !station) return
    if (!rename.trim()) return
    setBusy(true)
    try {
      await updateRelease(release.id, rename)
      setRelease({ ...release, title: rename })
      await loadReleases(station.id)
      setView('release')
      flash('release renamed')
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const submitRenameTrack = async (): Promise<void> => {
    if (busy || !release) return
    const t = tracks[trackIdx]
    if (!t || !rename.trim()) return
    setBusy(true)
    try {
      await updateTrack(t.id, rename)
      await loadTracks(release.id)
      setView('release')
      flash('track renamed')
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const submitTracks = async (): Promise<void> => {
    if (busy || !station || !release) return
    const files = findAudioFiles(path)
    if (!files.length) {
      setError('No audio files found at that path')
      return
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const existing = await fetchTracks(release.id)
      const room = MAX_TRACKS_PER_RELEASE - existing.length
      if (room <= 0) {
        setError(`Release is full — max ${MAX_TRACKS_PER_RELEASE} tracks`)
        return
      }
      if (files.length > room) {
        setError(
          `Too many tracks — ${files.length} found, room for ${room} more (max ${MAX_TRACKS_PER_RELEASE} per release)`,
        )
        return
      }
      setUploads(files.map((f) => ({ name: basename(f), status: 'queued' })))
      const patch = (i: number, row: Partial<UploadRow>): void =>
        setUploads((u) => u.map((x, idx) => (idx === i ? { ...x, ...row } : x)))
      let n = existing.length
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!
        patch(i, { status: 'reading tags…' })
        const meta = await readAudioMeta(f)
        patch(i, { name: meta.title, status: 'uploading…' })
        const up = await uploadAudio(station.slug, f)
        n += 1
        await addTrack(user, release.id, {
          title: meta.title,
          audio_url: up.url,
          duration: meta.duration,
          track_number: meta.trackNumber ?? n,
          storage_provider: up.provider,
          storage_key: up.key,
          bytes: up.bytes,
        })
        patch(i, { status: 'done ✓' })
      }
      await loadTracks(release.id)
      await loadReleases(station.id)
      flash(`uploaded ${files.length} track${files.length === 1 ? '' : 's'} — live now`)
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  // best-effort: remove the backing audio objects for these rows. Must be
  // called with rows fetched BEFORE the DB delete — the cascade wipes the
  // storage_key references. Never throws (deleteAudio is itself best-effort).
  const purgeAudio = async (items: Array<Track | Release>): Promise<void> => {
    await Promise.all(
      items.map((it) =>
        it.audio_url
          ? deleteAudio({
              audio_url: it.audio_url,
              storage_provider: it.storage_provider,
              storage_key: it.storage_key,
            }).catch(() => {})
          : Promise.resolve(),
      ),
    )
  }

  const doDelete = async (c: Confirm): Promise<void> => {
    if (!c) return
    setBusy(true)
    setConfirm(null)
    try {
      if (c.kind === 'station' && station) {
        // gather all audio under the station before the cascade wipes the rows
        const rels = await fetchReleases(station.id)
        const trackLists = await Promise.all(rels.map((r) => fetchTracks(r.id)))
        await deleteStation(station.id)
        await purgeAudio([...rels, ...trackLists.flat()])
        await loadStations()
        setStation(null)
        setView('list')
        flash('station deleted')
      } else if (c.kind === 'release' && release && station) {
        const trks = await fetchTracks(release.id)
        await deleteRelease(release.id)
        await purgeAudio([release, ...trks])
        await loadReleases(station.id)
        setRelease(null)
        setView('station')
        flash('release deleted')
      } else if (c.kind === 'track' && release) {
        const t = tracks[trackIdx]
        if (t) {
          await deleteTrack(t.id)
          await deleteAudio(t)
          await loadTracks(release.id)
          await loadReleases(station!.id)
          setTrackIdx((i) => Math.max(0, Math.min(i, tracks.length - 2)))
          flash('track deleted')
        }
      }
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const openEditStation = (): void => {
    if (!station) return
    setEditing(true)
    setName(station.name)
    setDesc(station.description ?? '')
    setField(0)
    setError(null)
    setView('editStation')
  }

  useInput((input, key) => {
    if (busy) return

    if (confirm) {
      if (input === 'y' || input === 'Y') void doDelete(confirm)
      else if (input === 'n' || input === 'N' || key.escape) setConfirm(null)
      return
    }

    if (key.escape) {
      setError(null)
      setInfo(null)
      if (view === 'list' || view === 'gate') onExit()
      else if (view === 'newStation' || view === 'editStation') setView(editing ? 'station' : 'list')
      else if (view === 'station') {
        setStation(null)
        setView('list')
      } else if (view === 'newRelease') setView('station')
      else if (view === 'release') {
        setRelease(null)
        setView('station')
      } else if (view === 'renameRelease' || view === 'addTracks') setView('release')
      else if (view === 'renameTrack') setView('release')
      return
    }

    if (view === 'list') {
      if (input === 'n') {
        setEditing(false)
        setName('')
        setDesc('')
        setField(0)
        setError(null)
        setView('newStation')
      } else if ((key.upArrow || input === 'k') && stations.length) {
        setStationIdx((i) => (i - 1 + stations.length) % stations.length)
      } else if ((key.downArrow || input === 'j') && stations.length) {
        setStationIdx((i) => (i + 1) % stations.length)
      } else if (key.return && stations[stationIdx]) {
        const s = stations[stationIdx]!
        setStation(s)
        setReleaseIdx(0)
        void loadReleases(s.id)
        setView('station')
      }
      return
    }

    if (view === 'newStation' || view === 'editStation') {
      if (key.tab || key.downArrow || key.upArrow) setField((f) => (f + 1) % 2)
      return
    }

    if (view === 'station') {
      if (input === 'r') {
        setRelTitle('')
        setError(null)
        setView('newRelease')
      } else if (input === 'e') {
        openEditStation()
      } else if (input === 'x') {
        if (station) setConfirm({ kind: 'station', name: station.name })
      } else if ((key.upArrow || input === 'k') && releases.length) {
        setReleaseIdx((i) => (i - 1 + releases.length) % releases.length)
      } else if ((key.downArrow || input === 'j') && releases.length) {
        setReleaseIdx((i) => (i + 1) % releases.length)
      } else if (key.return && releases[releaseIdx]) {
        const r = releases[releaseIdx]!
        setRelease(r)
        setTrackIdx(0)
        void loadTracks(r.id)
        setView('release')
      }
      return
    }

    if (view === 'release') {
      if (input === 'a') {
        setUploads([])
        setPath('~/Music')
        setError(null)
        setView('addTracks')
      } else if (input === 'e') {
        setRename(release?.title ?? '')
        setError(null)
        setView('renameRelease')
      } else if (input === 'x') {
        if (release) setConfirm({ kind: 'release', name: release.title })
      } else if (input === 'd') {
        const t = tracks[trackIdx]
        if (t) setConfirm({ kind: 'track', name: t.title })
      } else if ((key.upArrow || input === 'k') && tracks.length) {
        setTrackIdx((i) => (i - 1 + tracks.length) % tracks.length)
      } else if ((key.downArrow || input === 'j') && tracks.length) {
        setTrackIdx((i) => (i + 1) % tracks.length)
      } else if (key.return && tracks[trackIdx]) {
        setRename(tracks[trackIdx]!.title)
        setError(null)
        setView('renameTrack')
      }
      return
    }
    // text-input views: the TextInput owns keystrokes; esc handled above
  })

  const accent = accentColor(theme.accent)
  const rows = stdout?.rows ?? 30

  let title = 'MY STATIONS'
  if (view === 'gate') title = 'PUBLISHING ACCESS'
  else if (view === 'newStation') title = 'NEW STATION'
  else if (view === 'editStation') title = 'EDIT STATION'
  else if (view === 'station' && station) title = station.name.toUpperCase()
  else if (view === 'newRelease') title = 'NEW RELEASE'
  else if ((view === 'release' || view === 'renameRelease' || view === 'addTracks' || view === 'renameTrack') && release)
    title = release.title.toUpperCase()

  return (
    <Box flexDirection="column" height={rows - 1} overflow="hidden" paddingX={1}>
      <StatusBar title="XMIT / MY STATIONS" handle={user.handle} accent={accent} keys={keysFor(view, confirm)} />

      <Box flexGrow={1}>
        <Panel title={title} accent={accent} focused grow>
          <Box flexDirection="column" marginTop={1} flexGrow={1}>
            {view === 'gate' && (
              <Box flexDirection="column">
                <Text color={theme.text}>Publishing is invite-only.</Text>
                <Text color={theme.dim}>Listening is open to everyone — but creating stations and</Text>
                <Text color={theme.dim}>uploading tracks needs an invite code.</Text>
                <Box marginTop={1}>
                  <Field label="invite code">
                    <TextInput
                      value={code}
                      onChange={setCode}
                      onSubmit={() => void submitCode()}
                      focus={!busy}
                      placeholder="XMIT-xxxxxxxx"
                    />
                  </Field>
                </Box>
              </Box>
            )}
            {view === 'list' && <ListView stations={stations} idx={stationIdx} />}
            {(view === 'newStation' || view === 'editStation') && (
              <StationForm
                heading={editing ? 'edit station' : 'new station'}
                name={name}
                desc={desc}
                field={field}
                busy={busy}
                onName={setName}
                onDesc={setDesc}
                onSubmit={() => void submitStation()}
              />
            )}
            {view === 'station' && station && <StationView station={station} releases={releases} idx={releaseIdx} />}
            {view === 'release' && release && (
              <ReleaseView release={release} tracks={tracks} idx={trackIdx} accent={accent} />
            )}
            {view === 'newRelease' && (
              <Field label="release title">
                <TextInput value={relTitle} onChange={setRelTitle} onSubmit={() => void submitRelease()} focus={!busy} placeholder="First Transmission" />
              </Field>
            )}
            {view === 'renameRelease' && (
              <Field label="new title">
                <TextInput value={rename} onChange={setRename} onSubmit={() => void submitRenameRelease()} focus={!busy} />
              </Field>
            )}
            {view === 'renameTrack' && (
              <Field label="new title">
                <TextInput value={rename} onChange={setRename} onSubmit={() => void submitRenameTrack()} focus={!busy} />
              </Field>
            )}
            {view === 'addTracks' && (
              <AddTracksView path={path} uploads={uploads} busy={busy} onPath={setPath} onSubmit={() => void submitTracks()} />
            )}

            <Box marginTop={1}>
              {confirm ? (
                <Text color={theme.error}>
                  delete {confirm.kind} “{confirm.name}”? {confirm.kind !== 'track' ? '(and everything in it) ' : ''}
                  <Text color={theme.muted}>y / n</Text>
                </Text>
              ) : busy ? (
                <Text color={accent}>· working…</Text>
              ) : error ? (
                <Text color={theme.error}>✕ {error}</Text>
              ) : info ? (
                <Text color={theme.success}>✓ {info}</Text>
              ) : null}
            </Box>
          </Box>
        </Panel>
      </Box>
    </Box>
  )
}

function keysFor(view: View, confirm: Confirm): string {
  if (confirm) return 'y confirm · n cancel'
  switch (view) {
    case 'gate':
      return 'enter redeem invite · esc back'
    case 'list':
      return 'n new · ↑/↓ · enter manage · esc back'
    case 'newStation':
      return 'tab field · enter create · esc cancel'
    case 'editStation':
      return 'tab field · enter save · esc cancel'
    case 'station':
      return 'r new release · e edit · x delete · ↑/↓ · enter open · esc back'
    case 'newRelease':
      return 'enter create · esc cancel'
    case 'release':
      return 'a add tracks · e rename · x delete · ↑/↓ · enter rename track · d delete track · esc back'
    case 'renameRelease':
    case 'renameTrack':
      return 'enter save · esc cancel'
    case 'addTracks':
      return 'enter scan + upload · esc back'
  }
}

function ListView({ stations, idx }: { stations: Label[]; idx: number }): React.ReactElement {
  if (stations.length === 0) {
    return <Text color={theme.dim}>none yet — press n to create one</Text>
  }
  const rows = stations.map((s, i) => (
    <Text key={s.id} color={i === idx ? accentColor(theme.accent) : theme.muted} bold={i === idx} wrap="truncate-end">
      {i === idx ? '▶ ' : '  '}
      {s.name}
      <Text color={theme.dim}> /{s.slug}</Text>
    </Text>
  ))
  return <ScrollList rows={rows} selectedIndex={idx} follow="selection" accent={accentColor(theme.accent)} />
}

function StationView({
  station,
  releases,
  idx,
}: {
  station: Label
  releases: Release[]
  idx: number
}): React.ReactElement {
  const ac = accentColor(theme.accent)
  const rows = releases.map((r, i) => (
    <Text key={r.id} color={i === idx ? ac : theme.muted} bold={i === idx} wrap="truncate-end">
      {i === idx ? '▶ ' : '  '}
      {r.title}
      <Text color={theme.dim}> · {r.track_count ?? 0} tk</Text>
    </Text>
  ))
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text color={theme.muted}>releases</Text>
      {releases.length === 0 ? (
        <Text color={theme.dim}>none yet — press r to add a release</Text>
      ) : (
        <ScrollList rows={rows} selectedIndex={idx} follow="selection" accent={ac} />
      )}
    </Box>
  )
}

function ReleaseView({
  release,
  tracks,
  idx,
  accent,
}: {
  release: Release
  tracks: Track[]
  idx: number
  accent: string
}): React.ReactElement {
  const rows = tracks.map((t, i) => (
    <Text key={t.id} color={i === idx ? accent : theme.muted} bold={i === idx} wrap="truncate-end">
      {i === idx ? '▶ ' : '  '}
      {t.title}
      <Text color={theme.dim}> {fmtTime(t.duration)}</Text>
    </Text>
  ))
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text color={theme.muted}>tracks · {tracks.length}</Text>
      {tracks.length === 0 ? (
        <Text color={theme.dim}>none yet — press a to add tracks</Text>
      ) : (
        <ScrollList rows={rows} selectedIndex={idx} follow="selection" accent={accent} />
      )}
    </Box>
  )
}

function AddTracksView({
  path,
  uploads,
  busy,
  onPath,
  onSubmit,
}: {
  path: string
  uploads: UploadRow[]
  busy: boolean
  onPath: (v: string) => void
  onSubmit: () => void
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Field label="folder or file">
        <TextInput value={path} onChange={onPath} onSubmit={onSubmit} focus={!busy} placeholder="~/Music/MyEP" />
      </Field>
      <Box marginTop={1} flexDirection="column">
        {uploads.map((u, i) => (
          <Text key={i} color={u.status.includes('done') ? theme.success : theme.muted} wrap="truncate-end">
            ♪ {u.name}
            <Text color={theme.dim}> {u.status}</Text>
          </Text>
        ))}
      </Box>
    </Box>
  )
}

function StationForm({
  heading,
  name,
  desc,
  field,
  busy,
  onName,
  onDesc,
  onSubmit,
}: {
  heading: string
  name: string
  desc: string
  field: number
  busy: boolean
  onName: (v: string) => void
  onDesc: (v: string) => void
  onSubmit: () => void
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>{heading}</Text>
      <Field label="name  " active={field === 0}>
        <TextInput value={name} onChange={onName} onSubmit={onSubmit} focus={!busy && field === 0} placeholder="Nocturne Records" />
      </Field>
      <Field label="about " active={field === 1}>
        <TextInput value={desc} onChange={onDesc} onSubmit={onSubmit} focus={!busy && field === 1} placeholder="dark ambient & industrial" />
      </Field>
    </Box>
  )
}

function Field({
  label,
  active,
  children,
}: {
  label?: string
  active?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Box>
      <Text color={active ? theme.accent : theme.muted}>{active ? '▶ ' : '  '}</Text>
      {label ? <Text color={active ? theme.text : theme.muted}>{label} </Text> : null}
      <Text color={theme.dim}>│ </Text>
      {children}
    </Box>
  )
}
