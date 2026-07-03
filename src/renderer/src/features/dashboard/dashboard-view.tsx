import { useMemo, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowUpDownIcon,
  CalendarClockIcon,
  SearchIcon,
  Trash2Icon
} from 'lucide-react'

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
import {
  buildPatientRows,
  isActiveSession,
  type PatientRow
} from '@/features/session/session-record-utils'
import { cn } from '@/lib/utils'
import type { DashboardSnapshot, SessionRecord } from '@/lib/local-api'

type DashboardViewProps = {
  snapshot: DashboardSnapshot | null
  isLoading: boolean
  error: string | null
  onOpenSession: (sessionId: string) => void
  onAbortSession: (sessionId: string) => Promise<void>
  onDeleteSessionRecordings: (sessionId: string) => Promise<void>
  onSavePostAssessmentNote: (sessionId: string, text: string) => Promise<void>
}

enum AssessmentStatus {
  Secure = 'Secure',
  Insecure = 'Insecure',
  Error = 'Galat',
  Unfinished = 'Belum selesai',
  Cancelled = 'Dibatalkan'
}

type SortKey = 'name' | 'id' | 'date' | 'count'
type SortDirection = 'asc' | 'desc'

export function DashboardView({
  snapshot,
  isLoading,
  error,
  onOpenSession,
  onAbortSession,
  onDeleteSessionRecordings,
  onSavePostAssessmentNote
}: DashboardViewProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc'
  })
  const [selectedPatientKey, setSelectedPatientKey] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [confirmAbortSessionId, setConfirmAbortSessionId] = useState<string | null>(null)
  const [confirmDeleteRecordingsSessionId, setConfirmDeleteRecordingsSessionId] = useState<
    string | null
  >(null)
  const [busyAbortSessionId, setBusyAbortSessionId] = useState<string | null>(null)
  const [busyDeleteRecordingsSessionId, setBusyDeleteRecordingsSessionId] = useState<string | null>(
    null
  )
  const [busyNoteSessionId, setBusyNoteSessionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const patientRows = useMemo<PatientRow[]>(() => {
    return buildPatientRows(snapshot?.sessions ?? [])
  }, [snapshot?.sessions])

  const activeSession = useMemo(() => {
    return (snapshot?.sessions ?? []).find((session) => isActiveSession(session)) ?? null
  }, [snapshot?.sessions])

  const selectedSession = useMemo(() => {
    return snapshot?.sessions.find((session) => session.id === selectedSessionId) ?? null
  }, [selectedSessionId, snapshot?.sessions])

  const selectedPatient = useMemo(() => {
    return patientRows.find((row) => row.key === selectedPatientKey) ?? null
  }, [patientRows, selectedPatientKey])

  const filteredPatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const visibleRows = patientRows.filter((row) => {
      return (
        normalizedQuery.length === 0 ||
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.participantId.toLowerCase().includes(normalizedQuery)
      )
    })

    return [...visibleRows].sort((a, b) => compareRows(a, b, sort))
  }, [patientRows, query, sort])

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

  const submitDeleteRecordings = async (): Promise<void> => {
    if (!confirmDeleteRecordingsSessionId) {
      return
    }

    setBusyDeleteRecordingsSessionId(confirmDeleteRecordingsSessionId)
    setActionError(null)
    try {
      await onDeleteSessionRecordings(confirmDeleteRecordingsSessionId)
      setConfirmDeleteRecordingsSessionId(null)
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error ? deleteError.message : 'Gagal menghapus rekaman sesi.'
      )
    } finally {
      setBusyDeleteRecordingsSessionId(null)
    }
  }

  const submitPostAssessmentNote = async (sessionId: string, text: string): Promise<void> => {
    setBusyNoteSessionId(sessionId)
    setActionError(null)
    try {
      await onSavePostAssessmentNote(sessionId, text)
    } catch (noteError) {
      setActionError(
        noteError instanceof Error ? noteError.message : 'Gagal menyimpan catatan pasca-asesmen.'
      )
    } finally {
      setBusyNoteSessionId(null)
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
          onDeleteRecordings={() => setConfirmDeleteRecordingsSessionId(selectedSession.id)}
          onSavePostAssessmentNote={(text) =>
            void submitPostAssessmentNote(selectedSession.id, text)
          }
          noteSaving={busyNoteSessionId === selectedSession.id}
          actionError={actionError}
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
        <DeleteRecordingsDialog
          sessionId={confirmDeleteRecordingsSessionId}
          busySessionId={busyDeleteRecordingsSessionId}
          onClose={() => setConfirmDeleteRecordingsSessionId(null)}
          onConfirm={() => void submitDeleteRecordings()}
        />
      </>
    )
  }

  if (selectedPatient) {
    return (
      <PatientDetailPage
        patient={selectedPatient}
        onBack={() => setSelectedPatientKey(null)}
        onOpenAssessment={setSelectedSessionId}
      />
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
            placeholder="Cari nama atau ID pasien"
            icon={SearchIcon}
            className="w-full max-w-sm"
            inputClassName="bg-card"
          />
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
          <Table className="min-w-[1120px] table-fixed">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[24%]" />
              <col className="w-[18%]" />
              <col className="w-[24%]" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
              <TableRow className="border-border hover:bg-transparent">
                <SortableHead label="NAMA" sortKey="name" sort={sort} onSort={handleSort} />
                <SortableHead label="ID" sortKey="id" sort={sort} onSort={handleSort} />
                <SortableHead
                  label="JUMLAH ASESMEN"
                  sortKey="count"
                  sort={sort}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHead
                  label="TANGGAL ASESMEN TERAKHIR"
                  sortKey="date"
                  sort={sort}
                  onSort={handleSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPatients.map((row) => (
                <TableRow
                  key={row.key}
                  tabIndex={0}
                  className="cursor-pointer border-border transition hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  onClick={() => setSelectedPatientKey(row.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedPatientKey(row.key)
                    }
                  }}
                >
                  <TableCell className="truncate font-medium text-foreground">{row.name}</TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {row.participantId}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-medium text-foreground">
                      {row.assessmentCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-foreground">{formatDate(row.lastUpdated)}</TableCell>
                </TableRow>
              ))}
              {filteredPatients.length === 0 && (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Tidak ada pasien yang cocok.
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

function PatientDetailPage({
  patient,
  onBack,
  onOpenAssessment
}: {
  patient: PatientRow
  onBack: () => void
  onOpenAssessment: (sessionId: string) => void
}): React.JSX.Element {
  return (
    <div className="detail-enter flex h-full min-h-0 flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button type="button" variant="outline" className="rounded-xl bg-card" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Kembali ke dasbor
        </Button>
        <StatusBadge tone="info" className="px-4 py-1.5 text-sm">
          {patient.assessmentCount} asesmen
        </StatusBadge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-8 pb-2">
          <PageHeading
            eyebrow="Detail pasien"
            title={patient.name}
            description={`ID ${patient.participantId}`}
          />

          <div className="grid gap-5 lg:grid-cols-3">
            <AppPanel
              title="Profil pasien"
              className="lg:col-span-2"
              contentClassName="grid gap-3 md:grid-cols-2"
            >
              <InfoRow label="Nama" value={patient.name} />
              <InfoRow label="ID" value={patient.participantId} />
              <InfoRow label="Usia" value={patient.age || 'Belum diisi'} />
              <InfoRow label="Catatan" value={patient.notes || 'Tidak ada catatan'} />
            </AppPanel>
            <AppPanel title="Ringkasan" contentClassName="flex flex-col gap-3">
              <InfoRow label="Jumlah asesmen" value={String(patient.assessmentCount)} />
              <InfoRow label="Terakhir diperbarui" value={formatDate(patient.lastUpdated)} />
            </AppPanel>
          </div>

          <AppPanel title="Riwayat asesmen" contentClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Sesi</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.sessions.map((session) => {
                  const status = resolveAssessmentStatus(session)
                  return (
                    <TableRow key={session.id}>
                      <TableCell className="pl-6">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-foreground">{session.id}</span>
                          <span className="text-xs text-muted-foreground">
                            {session.postAssessmentNote.text
                              ? 'Memiliki catatan pasca-asesmen'
                              : 'Belum ada catatan pasca-asesmen'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(session.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-xl bg-card"
                          onClick={() => onOpenAssessment(session.id)}
                        >
                          Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </AppPanel>
        </div>
      </div>
    </div>
  )
}

function AssessmentDetailPage({
  session,
  onBack,
  onResumeSession,
  onAbortSession,
  onDeleteRecordings,
  onSavePostAssessmentNote,
  noteSaving,
  actionError
}: {
  session: SessionRecord
  onBack: () => void
  onResumeSession: () => void
  onAbortSession: () => void
  onDeleteRecordings: () => void
  onSavePostAssessmentNote: (text: string) => void
  noteSaving: boolean
  actionError: string | null
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
  const hasRecordings = session.draft.captures.some(
    (capture) => capture.exposure || capture.response || capture.audio
  )
  const recordingsDeletedAt = session.draft.recordingsDeletedAt
  const answeredCount = session.draft.questionnaireAnswers.filter((value) => value !== null).length
  const [noteDraft, setNoteDraft] = useState(session.postAssessmentNote.text)
  const noteDirty = noteDraft !== session.postAssessmentNote.text

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
                label="Status rekaman"
                value={
                  recordingsDeletedAt
                    ? `Dihapus ${formatDateTime(recordingsDeletedAt)}`
                    : hasRecordings
                      ? 'Tersimpan lokal'
                      : 'Belum tersedia'
                }
              />
              <InfoRow
                label="Kuesioner"
                value={`${answeredCount} / ${session.draft.questionnaireAnswers.length}`}
              />
              <InfoRow label="Status sesi" value={humanizeToken(session.state)} />
              {hasRecordings ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 rounded-xl border-destructive/25 bg-card text-destructive hover:bg-destructive/8 hover:text-destructive"
                  onClick={onDeleteRecordings}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Hapus rekaman
                </Button>
              ) : null}
            </AppPanel>
          </div>

          {session.result ? (
            <AppPanel title="Catatan pasca-asesmen" contentClassName="flex flex-col gap-4">
              <AppTextField
                label="Catatan pasca-asesmen"
                hideLabel
                value={noteDraft}
                onChange={setNoteDraft}
                placeholder="Tambahkan catatan klinis pasca-asesmen, misalnya kecenderungan avoidant/anxious atau konteks attachment yang perlu ditinjau."
                multiline
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {session.postAssessmentNote.updatedAt
                    ? `Terakhir disimpan ${formatDateTime(session.postAssessmentNote.updatedAt)}`
                    : 'Belum ada catatan pasca-asesmen.'}
                </p>
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={noteSaving || !noteDirty}
                  onClick={() => onSavePostAssessmentNote(noteDraft)}
                >
                  {noteSaving ? 'Menyimpan...' : 'Simpan catatan'}
                </Button>
              </div>
            </AppPanel>
          ) : null}

          {session.failureMessage ? (
            <StatusNotice tone="error" title="Masalah sesi">
              {session.failureMessage}
            </StatusNotice>
          ) : null}

          {actionError ? (
            <StatusNotice tone="error" title="Aksi sesi gagal">
              {actionError}
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

function DeleteRecordingsDialog({
  sessionId,
  busySessionId,
  onClose,
  onConfirm
}: {
  sessionId: string | null
  busySessionId: string | null
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const busy = Boolean(sessionId && busySessionId === sessionId)

  return (
    <Dialog
      open={sessionId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">Hapus rekaman sesi?</DialogTitle>
          <DialogDescription className="text-base leading-7">
            File exposure, respons video, dan audio mikrofon akan dihapus dari perangkat ini. Detail
            asesmen, kuesioner, hasil model, dan feedback klinisi tetap tersimpan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-xl bg-card" onClick={onClose}>
            Kembali
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-xl"
            disabled={!sessionId || busy}
            onClick={onConfirm}
          >
            {busy ? 'Menghapus...' : 'Hapus rekaman'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          'inline-flex w-full items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition hover:text-foreground',
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
  first: PatientRow,
  second: PatientRow,
  sort: { key: SortKey; direction: SortDirection }
): number {
  const direction = sort.direction === 'asc' ? 1 : -1
  const comparison = (() => {
    if (sort.key === 'date') return first.sortTime - second.sortTime
    if (sort.key === 'count') return first.assessmentCount - second.assessmentCount
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
