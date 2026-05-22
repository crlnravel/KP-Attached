import { useMemo, useState } from 'react'
import { ArrowLeftIcon, ArrowUpDownIcon, CalendarClockIcon, SearchIcon } from 'lucide-react'

import {
  AppPanel,
  AppTextField,
  InfoRow,
  PageHeading,
  StatusBadge,
  StatusNotice
} from '@/components/app-ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { DashboardSnapshot, SessionRecord } from '@/lib/local-api'

type DashboardViewProps = {
  snapshot: DashboardSnapshot | null
  isLoading: boolean
  error: string | null
  onOpenSession: (sessionId: string) => void
  onAbortSession: (sessionId: string) => Promise<void>
}

enum AssessmentStatus {
  Secure = 'Secure',
  Insecure = 'Insecure',
  Error = 'Galat',
  Unfinished = 'Belum selesai',
  Cancelled = 'Dibatalkan'
}

type SortKey = 'name' | 'id' | 'date' | 'result'
type SortDirection = 'asc' | 'desc'

type HistoryRow = {
  session: SessionRecord
  sessionId: string
  name: string
  participantId: string
  date: string
  sortTime: number
  status: AssessmentStatus
}

function isActiveSession(session: SessionRecord): boolean {
  return (
    session.state === 'draft' ||
    session.state === 'ready_for_inference' ||
    session.state === 'running_inference'
  )
}

const statusOptions: Array<{ value: 'all' | AssessmentStatus; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: AssessmentStatus.Secure, label: AssessmentStatus.Secure },
  { value: AssessmentStatus.Insecure, label: AssessmentStatus.Insecure },
  { value: AssessmentStatus.Error, label: AssessmentStatus.Error },
  { value: AssessmentStatus.Unfinished, label: AssessmentStatus.Unfinished },
  { value: AssessmentStatus.Cancelled, label: AssessmentStatus.Cancelled }
]

const statusSortOrder: Record<AssessmentStatus, number> = {
  [AssessmentStatus.Secure]: 1,
  [AssessmentStatus.Insecure]: 2,
  [AssessmentStatus.Error]: 3,
  [AssessmentStatus.Unfinished]: 4,
  [AssessmentStatus.Cancelled]: 5
}

export function DashboardView({
  snapshot,
  isLoading,
  error,
  onOpenSession,
  onAbortSession
}: DashboardViewProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AssessmentStatus>('all')
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc'
  })
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [confirmAbortSessionId, setConfirmAbortSessionId] = useState<string | null>(null)
  const [busyAbortSessionId, setBusyAbortSessionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const historyRows = useMemo<HistoryRow[]>(() => {
    return (snapshot?.sessions ?? []).map((session) => ({
      session,
      sessionId: session.id,
      name: session.draft.participantName || 'Peserta belum diisi',
      participantId: session.draft.participantId || session.id,
      date: formatDate(session.updatedAt),
      sortTime: new Date(session.updatedAt).getTime(),
      status: resolveAssessmentStatus(session)
    }))
  }, [snapshot?.sessions])

  const activeSession = useMemo(() => {
    return (snapshot?.sessions ?? []).find((session) => isActiveSession(session)) ?? null
  }, [snapshot?.sessions])

  const selectedSession = useMemo(() => {
    return historyRows.find((row) => row.sessionId === selectedSessionId)?.session ?? null
  }, [historyRows, selectedSessionId])

  const filteredHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const visibleRows = historyRows.filter((row) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.participantId.toLowerCase().includes(normalizedQuery) ||
        row.status.toLowerCase().includes(normalizedQuery)

      const matchesStatus = statusFilter === 'all' || row.status === statusFilter
      return matchesQuery && matchesStatus
    })

    return [...visibleRows].sort((a, b) => compareRows(a, b, sort))
  }, [historyRows, query, sort, statusFilter])

  const handleSort = (key: SortKey): void => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  const submitAbort = async (): Promise<void> => {
    if (!confirmAbortSessionId) {
      return
    }

    setBusyAbortSessionId(confirmAbortSessionId)
    setActionError(null)
    try {
      await onAbortSession(confirmAbortSessionId)
      setConfirmAbortSessionId(null)
    } catch (abortError) {
      setActionError(
        abortError instanceof Error ? abortError.message : 'Gagal membatalkan sesi aktif.'
      )
    } finally {
      setBusyAbortSessionId(null)
    }
  }

  if (selectedSession) {
    return (
      <>
        <AssessmentDetailPage
          session={selectedSession}
          onBack={() => setSelectedSessionId(null)}
          onResumeSession={() => onOpenSession(selectedSession.id)}
          onAbortSession={() => setConfirmAbortSessionId(selectedSession.id)}
        />
        <Dialog
          open={confirmAbortSessionId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmAbortSessionId(null)
            }
          }}
        >
          <DialogContent className="rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl tracking-[-0.04em]">
                Batalkan asesmen aktif ini?
              </DialogTitle>
              <DialogDescription className="text-base leading-7">
                Sesi akan ditandai dibatalkan dan tidak lagi menahan asesmen baru di workstation
                ini.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl bg-card"
                onClick={() => setConfirmAbortSessionId(null)}
              >
                Pertahankan sesi
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl"
                disabled={!confirmAbortSessionId || busyAbortSessionId === confirmAbortSessionId}
                onClick={() => void submitAbort()}
              >
                {busyAbortSessionId && confirmAbortSessionId === busyAbortSessionId
                  ? 'Membatalkan...'
                  : 'Batalkan sesi'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <div className="detail-enter flex h-full min-h-0 flex-col gap-8">
      <PageHeading eyebrow={`${getGreeting()}, ${snapshot?.user.fullName ?? 'R'}`} title="Dasbor" />

      <AppPanel
        className="min-h-[32rem] flex-1"
        contentClassName="flex min-h-0 flex-1 flex-col gap-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <AppTextField
            label="Cari"
            hideLabel
            value={query}
            onChange={setQuery}
            placeholder="Cari nama, ID, atau status"
            icon={SearchIcon}
            className="w-full max-w-sm"
            inputClassName="bg-card"
          />
          <label className="flex w-full max-w-[13rem] flex-col gap-2 text-sm font-medium text-foreground">
            <span className="sr-only">Filter status</span>
            <select
              className="h-12 rounded-[18px] border border-border/80 bg-card/80 px-4 text-sm text-foreground shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-primary/25"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | AssessmentStatus)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <StatusNotice tone="error" title="Sesi gagal dimuat">
            {error}
          </StatusNotice>
        ) : null}
        {actionError ? (
          <StatusNotice tone="error" title="Sesi gagal diperbarui">
            {actionError}
          </StatusNotice>
        ) : null}
        {snapshot && !snapshot.modelRuntimeReady ? (
          <StatusNotice tone="warning" title="Analisis lokal belum siap">
            Komponen analisis lokal belum lengkap di perangkat ini. Minta pengelola aplikasi
            menyiapkan paket model sebelum memulai analisis.
          </StatusNotice>
        ) : null}
        {activeSession ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-info/20 bg-info/6 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Sesi aktif sedang berjalan</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Sesi {activeSession.id} masih terbuka. Lanjutkan atau batalkan sebelum memulai
                asesmen baru.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl bg-card"
                onClick={() => onOpenSession(activeSession.id)}
              >
                Lanjutkan
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-destructive/25 bg-card text-destructive hover:bg-destructive/8 hover:text-destructive"
                disabled={busyAbortSessionId === activeSession.id}
                onClick={() => setConfirmAbortSessionId(activeSession.id)}
              >
                {busyAbortSessionId === activeSession.id ? 'Membatalkan...' : 'Batalkan sesi'}
              </Button>
            </div>
          </div>
        ) : null}
        {isLoading ? (
          <StatusNotice tone="info" title="Memuat sesi">
            Memperbarui catatan sesi lokal.
          </StatusNotice>
        ) : null}

        <div className="min-h-[24rem] flex-1 overflow-y-auto rounded-[18px] border border-border/60 bg-card/80">
          <Table className="min-w-[840px] table-fixed">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[27%]" />
              <col className="w-[20%]" />
              <col className="w-[19%]" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
              <TableRow className="border-border hover:bg-transparent">
                <SortableHead label="Nama" sortKey="name" sort={sort} onSort={handleSort} />
                <SortableHead label="ID" sortKey="id" sort={sort} onSort={handleSort} />
                <SortableHead label="Tanggal" sortKey="date" sort={sort} onSort={handleSort} />
                <SortableHead
                  label="Hasil"
                  sortKey="result"
                  sort={sort}
                  onSort={handleSort}
                  align="right"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.map((row) => (
                <TableRow
                  key={row.sessionId}
                  tabIndex={0}
                  className="cursor-pointer border-border transition hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  onClick={() => setSelectedSessionId(row.sessionId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedSessionId(row.sessionId)
                    }
                  }}
                >
                  <TableCell className="truncate font-medium text-foreground">{row.name}</TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {row.participantId}
                  </TableCell>
                  <TableCell className="text-foreground">{row.date}</TableCell>
                  <TableCell className="text-right">
                    <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
              {filteredHistory.length === 0 && (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Tidak ada catatan yang cocok.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </AppPanel>

      <Dialog
        open={confirmAbortSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAbortSessionId(null)
          }
        }}
      >
        <DialogContent className="rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl tracking-[-0.04em]">
              Batalkan asesmen aktif ini?
            </DialogTitle>
            <DialogDescription className="text-base leading-7">
              Sesi akan ditandai dibatalkan dan tidak lagi menahan asesmen baru di workstation ini.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl bg-card"
              onClick={() => setConfirmAbortSessionId(null)}
            >
              Pertahankan sesi
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={!confirmAbortSessionId || busyAbortSessionId === confirmAbortSessionId}
              onClick={() => void submitAbort()}
            >
              {busyAbortSessionId && confirmAbortSessionId === busyAbortSessionId
                ? 'Membatalkan...'
                : 'Batalkan sesi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AssessmentDetailPage({
  session,
  onBack,
  onResumeSession,
  onAbortSession
}: {
  session: SessionRecord
  onBack: () => void
  onResumeSession: () => void
  onAbortSession: () => void
}): React.JSX.Element {
  const status = resolveAssessmentStatus(session)
  const statusToneValue = statusTone(status)
  const isDecided = status === AssessmentStatus.Secure || status === AssessmentStatus.Insecure
  const canResumeSession = isActiveSession(session) || session.state === 'failed'
  const showSessionActions = isActiveSession(session) || canResumeSession
  const completedTime = session.completedAt ?? session.result?.completedAt ?? null
  const capturedCount = session.draft.captures.filter(
    (capture) => capture.exposure && capture.response && capture.audio
  ).length
  const answeredCount = session.draft.questionnaireAnswers.filter((value) => value !== null).length

  return (
    <div className="detail-enter flex h-full min-h-0 flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button type="button" variant="outline" className="rounded-xl bg-card" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Kembali ke dasbor
        </Button>
        <StatusBadge tone={statusToneValue} className="px-4 py-1.5 text-sm">
          {status}
        </StatusBadge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-8 pb-2">
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-end">
            <PageHeading
              eyebrow="Detail asesmen"
              title={session.draft.participantName || 'Peserta belum diisi'}
              description={`ID ${session.draft.participantId || session.id}`}
            />
            {session.result ? (
              <div
                className={cn(
                  'rounded-[28px] border p-7 shadow-sm',
                  session.result.label === 'secure'
                    ? 'border-success/20 bg-success-container/55'
                    : 'border-warning/25 bg-warning-container/60'
                )}
              >
                <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Hasil attachment style
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-foreground">
                  {session.result.label === 'secure' ? 'Secure' : 'Insecure'}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Ditampilkan sebagai ringkasan model untuk ditinjau bersama detail asesmen.
                </p>
              </div>
            ) : (
              <div className="rounded-[28px] border border-border/70 bg-card/80 p-8 text-center shadow-sm">
                <CalendarClockIcon className="mx-auto size-10 text-muted-foreground" />
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Hasil analisis belum tersedia.
                </p>
              </div>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <AppPanel
              title="Waktu"
              className="lg:col-span-2"
              contentClassName="grid gap-3 md:grid-cols-2"
            >
              <InfoRow label="Dimulai" value={formatDateTime(session.startedAt)} />
              <InfoRow label="Terakhir diperbarui" value={formatDateTime(session.updatedAt)} />
              <InfoRow
                label="Selesai"
                value={completedTime ? formatDateTime(completedTime) : 'Belum selesai'}
              />
              <InfoRow label="Langkah saat ini" value={humanizeToken(session.draft.step)} />
            </AppPanel>

            <AppPanel title="Hasil" contentClassName="flex flex-col gap-4">
              <InfoRow label="Hasil" value={status} />
              {session.result ? (
                <>
                  <InfoRow
                    label="Probabilitas Secure"
                    value={formatPercent(session.result.probabilities.secure)}
                  />
                  <InfoRow
                    label="Probabilitas Insecure"
                    value={formatPercent(session.result.probabilities.insecure)}
                  />
                </>
              ) : (
                <InfoRow
                  label="Alasan"
                  value={session.failureMessage ?? 'Asesmen belum mencapai hasil akhir.'}
                />
              )}
            </AppPanel>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <AppPanel
              title="Peserta"
              className="lg:col-span-2"
              contentClassName="grid gap-3 md:grid-cols-2"
            >
              <InfoRow
                label="Nama"
                value={session.draft.participantName || 'Peserta belum diisi'}
              />
              <InfoRow label="ID" value={session.draft.participantId || session.id} />
              <InfoRow label="Usia" value={session.draft.age || 'Belum diisi'} />
              <InfoRow label="Catatan" value={session.draft.notes || 'Tidak ada catatan'} />
            </AppPanel>

            <AppPanel title="Progres rekaman" contentClassName="flex flex-col gap-3">
              <InfoRow
                label="Stimulus direkam"
                value={`${capturedCount} / ${session.draft.captures.length}`}
              />
              <InfoRow
                label="Kuesioner"
                value={`${answeredCount} / ${session.draft.questionnaireAnswers.length}`}
              />
              <InfoRow label="Status sesi" value={humanizeToken(session.state)} />
            </AppPanel>
          </div>

          {session.failureMessage ? (
            <StatusNotice tone="error" title="Masalah sesi">
              {session.failureMessage}
            </StatusNotice>
          ) : null}

          {!isDecided && showSessionActions ? (
            <div className="flex justify-end gap-3">
              {isActiveSession(session) ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-destructive/25 bg-card text-destructive hover:bg-destructive/8 hover:text-destructive"
                  onClick={onAbortSession}
                >
                  Batalkan sesi
                </Button>
              ) : null}
              {canResumeSession ? (
                <Button type="button" className="rounded-xl" onClick={onResumeSession}>
                  Buka alur asesmen
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left'
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; direction: SortDirection }
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}): React.JSX.Element {
  const isActive = sort.key === sortKey

  return (
    <TableHead className={cn('px-4', align === 'right' && 'text-right')}>
      <button
        type="button"
        className={cn(
          'inline-flex w-full items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground transition hover:text-foreground',
          align === 'right' && 'justify-end'
        )}
        aria-sort={isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <ArrowUpDownIcon className={cn('size-3.5', isActive && 'text-foreground')} />
      </button>
    </TableHead>
  )
}

function compareRows(
  first: HistoryRow,
  second: HistoryRow,
  sort: { key: SortKey; direction: SortDirection }
): number {
  const direction = sort.direction === 'asc' ? 1 : -1
  const comparison = (() => {
    if (sort.key === 'date') return first.sortTime - second.sortTime
    if (sort.key === 'result') return statusSortOrder[first.status] - statusSortOrder[second.status]
    if (sort.key === 'id') return first.participantId.localeCompare(second.participantId)
    return first.name.localeCompare(second.name)
  })()

  return comparison * direction
}

function resolveAssessmentStatus(session: SessionRecord): AssessmentStatus {
  if (session.result?.label === 'secure') return AssessmentStatus.Secure
  if (session.result?.label === 'insecure') return AssessmentStatus.Insecure
  if (session.state === 'failed') return AssessmentStatus.Error
  if (session.state === 'aborted') return AssessmentStatus.Cancelled
  return AssessmentStatus.Unfinished
}

function statusTone(
  status: AssessmentStatus
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (status === AssessmentStatus.Secure) return 'success'
  if (status === AssessmentStatus.Insecure || status === AssessmentStatus.Unfinished)
    return 'warning'
  if (status === AssessmentStatus.Error) return 'error'
  return 'default'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  }).format(new Date(value))
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatPercent(value: number): string {
  const percent = value * 100

  if (percent > 0 && percent < 0.1) {
    return '<0.1%'
  }

  if (percent < 100 && percent > 99.9) {
    return '>99.9%'
  }

  return `${Math.round(percent)}%`
}

function humanizeToken(value: string): string {
  const labels: Record<string, string> = {
    identity: 'Identitas',
    consent: 'Consent',
    preflight: 'Cek perangkat',
    recording: 'Perekaman',
    questionnaire: 'Kuesioner',
    review: 'Tinjau',
    running: 'Analisis berjalan',
    result: 'Hasil',
    draft: 'Draf',
    ready_for_inference: 'Siap dianalisis',
    running_inference: 'Analisis berjalan',
    completed: 'Selesai',
    low_confidence: 'Keyakinan rendah',
    failed: 'Gagal',
    aborted: 'Dibatalkan'
  }

  return labels[value] ?? value.replace(/_/g, ' ')
}

function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}
