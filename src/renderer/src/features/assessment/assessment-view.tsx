import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  CheckIcon,
  HeartIcon,
  Loader2Icon,
  MicIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon
} from 'lucide-react'

import {
  AppPanel,
  AppTextField,
  ChoiceChip,
  Eyebrow,
  InfoRow,
  PageHeading,
  ProgressBar,
  SignalMeter,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { QUESTION_COUNT, QUESTION_SCALE_VALUES, STIMULUS_COUNT } from '../../../../shared/contracts'
import { APP_DEBUG } from '../../../../shared/debug'
import {
  STIMULUS_EXPOSURE_DURATION_MS,
  STIMULUS_RESPONSE_PROMPT,
  questionnaireSections,
  scaleLabels,
  stimulusVideos
} from '@/features/assessment/model'
import type { AssessmentController } from '@/features/assessment/use-assessment-controller'
import type { ExistingPatientOption } from '@/features/session/session-record-utils'

type AssessmentViewProps = {
  controller: AssessmentController
  patientMode?: 'new' | 'existing' | null
  existingPatientOptions?: ExistingPatientOption[]
  modelRuntimeReady?: boolean
  onExitAssessment: () => void
}

const CONSENT_DISPLAY_STATEMENT =
  'ATTACHED adalah sistem pendukung keputusan klinis yang membantu psikolog meninjau indikasi Attachment Style dari respons multimodal peserta. Dalam sesi ini, peserta akan melihat rangkaian stimulus gambar, memberikan respons verbal, dan mengisi kuesioner ECR-RS.\n\nAplikasi akan merekam respons video, respons audio, serta jawaban kuesioner untuk diproses oleh pipeline analisis lokal pada perangkat ini. Setelah hasil keluar, psikolog dapat menandai apakah hasil sesuai atau tidak sesuai dengan penilaian klinis. Feedback tersebut disimpan sebagai bagian dari trace sesi lokal dan dapat dibuat menjadi report terstruktur untuk audit serta persiapan dataset pelatihan ulang model.\n\nPeserta memahami bahwa keluaran ATTACHED digunakan sebagai bahan pertimbangan klinis, bukan diagnosis otomatis dan bukan pengganti penilaian profesional psikolog. Jika peserta tidak menyetujui penyimpanan lanjutan setelah sesi selesai, data sesi, rekaman, dan report training lokal untuk sesi tersebut dapat dihapus dari perangkat ini.'

export function AssessmentView({
  controller,
  patientMode = null,
  existingPatientOptions = [],
  modelRuntimeReady,
  onExitAssessment
}: AssessmentViewProps): React.JSX.Element {
  const { state, actions, previewVideoRef } = controller
  const [showAbortConfirmation, setShowAbortConfirmation] = useState(false)
  const currentStimulus = stimulusVideos[state.currentSlotIndex]
  const currentCapture = state.captures[state.currentSlotIndex]
  const showDebugShortcut = APP_DEBUG && state.step !== 'running' && state.step !== 'result'
  const debugShortcutDisabled = state.loading || state.saving || state.recordingMode !== null
  const capturePhase = !currentCapture?.exposure
    ? 'exposure'
    : !currentCapture?.response || !currentCapture?.audio
      ? 'response'
      : 'complete'

  if (state.loading) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <section className="mx-auto flex min-h-screen max-w-5xl items-center justify-center p-8">
          <div className="flex items-center gap-3 rounded-[24px] border border-border/60 bg-card/92 px-6 py-5 text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
            Memuat sesi...
          </div>
        </section>
      </main>
    )
  }

  return (
    <section
      className={
        state.step === 'recording' || state.step === 'running'
          ? 'min-h-screen bg-background'
          : 'min-h-screen bg-background p-8 sm:p-10'
      }
    >
      {state.step !== 'recording' && state.error && <TopMessage tone="error" text={state.error} />}
      {state.step !== 'recording' && state.previewError && (
        <TopMessage tone="warning" text={state.previewError} />
      )}
      {state.step !== 'result' &&
      state.step !== 'identity' &&
      state.step !== 'preflight' &&
      state.session ? (
        <AbortSessionButton busy={state.saving} onAbort={() => setShowAbortConfirmation(true)} />
      ) : null}

      {state.step === 'identity' && (
        <EntryStage
          state={state}
          previewVideoRef={previewVideoRef}
          showDebugShortcut={showDebugShortcut}
          debugShortcutDisabled={debugShortcutDisabled}
          onUseTestData={() => void actions.fillDebugSession()}
          onRequestCloseAssessment={() => setShowAbortConfirmation(true)}
          onBackToIdentity={() => void actions.goToIdentity()}
          onFieldChange={actions.updateParticipantField}
          onSaveIdentity={() => void actions.saveIdentity()}
          patientMode={patientMode}
          existingPatientOptions={existingPatientOptions}
          onSelectExistingPatient={(patient) =>
            void actions.selectExistingPatient({
              participantId: patient.participantId,
              participantName: patient.name,
              age: patient.age,
              notes: patient.notes
            })
          }
          onContinue={() => void actions.continueToRecording()}
        />
      )}

      {state.step === 'consent' && (
        <ConsentStage
          state={state}
          onBackToIdentity={() => void actions.goToIdentity()}
          onSubmitConsent={() => void actions.submitConsent()}
        />
      )}

      {state.step === 'preflight' && (
        <EntryStage
          state={state}
          previewVideoRef={previewVideoRef}
          showDebugShortcut={false}
          debugShortcutDisabled={debugShortcutDisabled}
          onUseTestData={() => void actions.fillDebugSession()}
          onRequestCloseAssessment={() => setShowAbortConfirmation(true)}
          onBackToIdentity={() => void actions.goToIdentity()}
          onFieldChange={actions.updateParticipantField}
          onSaveIdentity={() => void actions.saveIdentity()}
          patientMode={patientMode}
          existingPatientOptions={existingPatientOptions}
          onSelectExistingPatient={(patient) =>
            void actions.selectExistingPatient({
              participantId: patient.participantId,
              participantName: patient.name,
              age: patient.age,
              notes: patient.notes
            })
          }
          onContinue={() => void actions.continueToRecording()}
        />
      )}

      {state.step === 'recording' && (
        <RecordingStage
          state={state}
          previewVideoRef={previewVideoRef}
          stimulus={currentStimulus}
          capturePhase={capturePhase}
          onSelectSlot={actions.selectSlot}
          onStartExposure={actions.startExposureRecording}
          onStopExposure={actions.stopExposureRecording}
          onStartResponse={actions.startResponseRecording}
          onStopResponse={actions.stopResponseRecording}
          onContinueToQuestionnaire={() => void actions.continueToQuestionnaire()}
        />
      )}

      {state.step === 'questionnaire' && (
        <QuestionnaireStage
          state={state}
          onAnswer={actions.setAnswer}
          onSave={() => void actions.saveQuestionnaire()}
        />
      )}

      {state.step === 'review' && (
        <ReviewStage
          state={state}
          modelRuntimeReady={modelRuntimeReady}
          onStartInference={() => void actions.startInference()}
        />
      )}

      {state.step === 'running' && <RunningStage state={state} />}

      {state.step === 'result' && (
        <ResultStage
          result={state.result}
          postAssessmentNote={state.postAssessmentNote}
          postAssessmentNoteUpdatedAt={state.postAssessmentNoteUpdatedAt}
          saving={state.saving}
          onSubmitFeedback={(verdict, correctedLabel) =>
            void actions.submitResultFeedback(verdict, correctedLabel)
          }
          onSavePostAssessmentNote={(text) => void actions.savePostAssessmentNote(text)}
          onWipeSession={() => void actions.revokeConsent()}
          onExitAssessment={onExitAssessment}
        />
      )}

      <Dialog open={showAbortConfirmation} onOpenChange={setShowAbortConfirmation}>
        <DialogContent className="rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-lg">
          <DialogHeader>
            <Eyebrow>Tutup asesmen</Eyebrow>
            <DialogTitle className="text-2xl tracking-[-0.04em]">Tutup asesmen ini?</DialogTitle>
            <DialogDescription className="text-base leading-7">
              Sesi ini akan dibatalkan agar workstation bisa memulai asesmen baru. Analisis lokal
              yang sedang berjalan juga akan dihentikan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl bg-card"
              onClick={() => setShowAbortConfirmation(false)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={state.saving}
              onClick={() => {
                setShowAbortConfirmation(false)
                if (state.session?.draft.consent.status === 'given') {
                  void actions.revokeConsent()
                  return
                }
                void actions.abortSession()
              }}
            >
              {state.saving ? 'Menutup...' : 'Batalkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ConsentStage({
  state,
  onBackToIdentity,
  onSubmitConsent
}: {
  state: AssessmentController['state']
  onBackToIdentity: () => void
  onSubmitConsent: () => void
}): React.JSX.Element {
  const [accepted, setAccepted] = useState(false)
  const consentStatement = CONSENT_DISPLAY_STATEMENT

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center gap-8">
      <PageHeading title="Konfirmasi persetujuan peserta." align="center" />

      <AppPanel contentClassName="flex flex-col gap-7 p-8 sm:p-10">
        <div className="space-y-4 rounded-[22px] border border-border/60 bg-background/70 p-5 text-sm leading-7 text-muted-foreground">
          {consentStatement.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <label className="flex cursor-pointer items-start gap-4 rounded-[20px] border border-border/70 bg-card/80 p-5 transition hover:border-primary/30">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-primary"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span className="text-sm leading-6 text-foreground">
            Saya sudah menjelaskan cara kerja ATTACHED, jenis data yang direkam, dan batasan hasil
            sistem kepada peserta. Peserta memberikan persetujuan untuk mengikuti asesmen dan
            mengizinkan data sesi digunakan dalam analisis lokal, review klinisi, dan pembuatan
            report lokal untuk audit atau persiapan pelatihan ulang model. Peserta juga memahami
            bahwa data sesi dapat dihapus setelah hasil ditinjau bila tidak menyetujui penyimpanan
            lanjutan.
          </span>
        </label>
      </AppPanel>

      <div className="flex items-center justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl bg-card"
          disabled={state.saving}
          onClick={onBackToIdentity}
        >
          Kembali
        </Button>
        <Button
          type="button"
          className="rounded-xl"
          disabled={!accepted || state.saving}
          onClick={onSubmitConsent}
        >
          {state.saving ? 'Menyimpan...' : 'Lanjut'}
        </Button>
      </div>
    </div>
  )
}

function EntryStage({
  state,
  previewVideoRef,
  showDebugShortcut,
  debugShortcutDisabled,
  onUseTestData,
  onRequestCloseAssessment,
  onBackToIdentity,
  onFieldChange,
  onSaveIdentity,
  patientMode,
  existingPatientOptions,
  onSelectExistingPatient,
  onContinue
}: {
  state: AssessmentController['state']
  previewVideoRef: AssessmentController['previewVideoRef']
  showDebugShortcut: boolean
  debugShortcutDisabled: boolean
  onUseTestData: () => void
  onRequestCloseAssessment: () => void
  onBackToIdentity: () => void
  onFieldChange: AssessmentController['actions']['updateParticipantField']
  onSaveIdentity: () => void
  patientMode: 'new' | 'existing' | null
  existingPatientOptions: ExistingPatientOption[]
  onSelectExistingPatient: (patient: ExistingPatientOption) => void
  onContinue: () => void
}): React.JSX.Element {
  const isIdentityStep = state.step === 'identity'
  const microphonePercent = Math.round(Math.max(0, Math.min(1, state.microphoneLevel)) * 100)
  const cameraStatus = state.videoReady ? 'Terhubung' : 'Belum tersedia'
  const microphoneStatus = state.microphoneReady
    ? `Terdeteksi (${microphonePercent}%)`
    : `Belum tersedia (${microphonePercent}%)`

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col gap-10">
      <div className="flex items-center justify-between gap-6">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-12 rounded-full bg-card"
          aria-label={isIdentityStep ? 'Tutup asesmen' : 'Kembali ke identitas'}
          onClick={isIdentityStep ? onRequestCloseAssessment : onBackToIdentity}
        >
          {isIdentityStep ? <XIcon className="size-5" /> : <ArrowLeftIcon className="size-5" />}
        </Button>
        <p className="text-sm italic text-muted-foreground">Skrining awal</p>
      </div>

      <div className="flex flex-col gap-4">
        <Eyebrow>Langkah {isIdentityStep ? '1' : '2'} dari 2</Eyebrow>
        <ProgressBar value={isIdentityStep ? 50 : 100} />
      </div>

      {isIdentityStep ? (
        <>
          {patientMode === 'existing' ? (
            <ExistingPatientPicker
              patients={existingPatientOptions}
              busy={state.saving}
              onSelectPatient={onSelectExistingPatient}
            />
          ) : (
            <NewPatientIdentityForm state={state} onFieldChange={onFieldChange} />
          )}

          {showDebugShortcut && patientMode !== 'existing' ? (
            <DebugShortcutCard
              busy={state.saving}
              disabled={debugShortcutDisabled}
              onUseTestData={onUseTestData}
            />
          ) : null}
        </>
      ) : (
        <>
          <PageHeading
            eyebrow="Cek perangkat"
            title="Cek video dan audio."
            description="Periksa kamera dan mikrofon sebelum asesmen dimulai."
          />

          <div className="mx-auto grid w-full max-w-5xl flex-1 gap-6 md:grid-cols-[minmax(0,1fr)_160px]">
            <div className="relative flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-[20px] bg-card/90">
              <p className="absolute left-4 top-4 z-10 rounded-full border border-foreground/10 bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
                Kamera: {cameraStatus}
              </p>
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                className="size-full object-cover [transform:scaleX(-1)]"
              />
              {!state.videoReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
                  Pratinjau kamera
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-border/60 bg-card/94 px-4 py-6 shadow-sm">
              <div className="flex h-full flex-col items-center justify-center gap-10 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-full border border-foreground/8 bg-background/80 shadow-sm">
                    <MicIcon className="size-[18px] text-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Mikrofon</p>
                    <p className="text-xs text-muted-foreground">{microphoneStatus}</p>
                  </div>
                </div>
                <SignalMeter
                  level={state.microphoneLevel}
                  tone="light"
                  orientation="vertical"
                  compact
                />
              </div>
            </div>
          </div>
        </>
      )}

      {isIdentityStep && patientMode === 'existing' ? null : (
        <div className="flex items-center justify-between pt-5">
          <div className="text-sm text-muted-foreground">{isIdentityStep ? '1 / 2' : '2 / 2'}</div>
          <Button
            type="button"
            className="rounded-xl"
            disabled={
              isIdentityStep
                ? !state.identityReady || state.saving
                : !state.videoReady || !state.microphoneReady || state.saving
            }
            onClick={isIdentityStep ? onSaveIdentity : onContinue}
          >
            Lanjut
          </Button>
        </div>
      )}
    </div>
  )
}

function NewPatientIdentityForm({
  state,
  onFieldChange
}: {
  state: AssessmentController['state']
  onFieldChange: AssessmentController['actions']['updateParticipantField']
}): React.JSX.Element {
  return (
    <>
      <PageHeading
        eyebrow="Identitas"
        title="Verifikasi data peserta."
        description="Pastikan profil peserta benar sebelum asesmen dimulai."
      />

      <div className="rounded-[24px] border border-border/60 bg-card/92 p-8 shadow-sm sm:p-10">
        <div className="grid gap-6 md:grid-cols-2">
          <AssessmentField
            label="ID peserta"
            value={state.participantId}
            onChange={(value) => onFieldChange('participantId', value)}
            readOnly
          />
          <AssessmentField
            label="Usia"
            value={state.age}
            onChange={(value) => onFieldChange('age', value)}
            placeholder="Mis. 29"
            inputMode="numeric"
          />
        </div>
        <AssessmentField
          label="Nama lengkap"
          value={state.participantName}
          onChange={(value) => onFieldChange('participantName', value)}
          placeholder="Masukkan nama peserta"
        />
        <AppTextField
          label="Catatan"
          value={state.notes}
          onChange={(value) => onFieldChange('notes', value)}
          placeholder="Tambahkan catatan bila diperlukan"
          multiline
          className="mt-6 md:col-span-2"
        />
      </div>
    </>
  )
}

function ExistingPatientPicker({
  patients,
  busy,
  onSelectPatient
}: {
  patients: ExistingPatientOption[]
  busy: boolean
  onSelectPatient: (patient: ExistingPatientOption) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selectedPatientKey, setSelectedPatientKey] = useState<string | null>(null)
  const visiblePatients = patients.filter((patient) => {
    const normalizedQuery = query.trim().toLowerCase()
    return (
      normalizedQuery.length === 0 ||
      patient.name.toLowerCase().includes(normalizedQuery) ||
      patient.participantId.toLowerCase().includes(normalizedQuery)
    )
  })
  const selectedPatient = patients.find((patient) => patient.key === selectedPatientKey) ?? null

  return (
    <>
      <PageHeading eyebrow="Pasien terdaftar" title="Pilih pasien untuk asesmen ulang." />

      <div className="rounded-[24px] border border-border/60 bg-card/92 p-6 shadow-sm sm:p-8">
        <AppTextField
          label="Cari pasien"
          hideLabel
          value={query}
          onChange={setQuery}
          placeholder="Cari nama atau ID pasien"
          icon={SearchIcon}
          inputClassName="bg-background"
        />

        <div className="mt-5 overflow-x-auto rounded-[18px] border border-border/60 bg-background/60">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[minmax(220px,1.15fr)_minmax(220px,0.95fr)_200px_280px] gap-4 border-b border-border/60 bg-card/60 px-14 py-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>NAMA</span>
              <span>ID</span>
              <span className="text-right whitespace-nowrap">JUMLAH ASESMEN</span>
              <span className="whitespace-nowrap">TANGGAL ASESMEN TERAKHIR</span>
            </div>

            <div className="max-h-[24rem] overflow-y-auto">
              {visiblePatients.length > 0 ? (
                visiblePatients.map((patient) => (
                  <label
                    key={patient.key}
                    className="grid w-full cursor-pointer grid-cols-[28px_minmax(220px,1.15fr)_minmax(220px,0.95fr)_200px_280px] items-center gap-4 border-b border-border/50 px-5 py-4 text-left transition last:border-b-0 hover:bg-muted/45"
                  >
                    <input
                      type="radio"
                      name="existing-patient"
                      className="size-5 accent-primary"
                      checked={selectedPatientKey === patient.key}
                      disabled={busy}
                      onChange={() => setSelectedPatientKey(patient.key)}
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {patient.name}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {patient.participantId}
                    </span>
                    <span className="text-right text-sm font-medium text-foreground">
                      {patient.assessmentCount}
                    </span>
                    <span className="text-sm text-foreground">
                      {formatDate(patient.lastUpdated)}
                    </span>
                  </label>
                ))
              ) : (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Tidak ada pasien yang cocok.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-5">
        <div className="text-sm text-muted-foreground">1 / 2</div>
        <Button
          type="button"
          className="rounded-xl"
          disabled={busy || !selectedPatient}
          onClick={() => {
            if (selectedPatient) onSelectPatient(selectedPatient)
          }}
        >
          {busy ? 'Menyimpan...' : 'Lanjut'}
        </Button>
      </div>
    </>
  )
}

function RecordingStage({
  state,
  previewVideoRef,
  stimulus,
  capturePhase,
  onSelectSlot,
  onStartExposure,
  onStopExposure,
  onStartResponse,
  onStopResponse,
  onContinueToQuestionnaire
}: {
  state: AssessmentController['state']
  previewVideoRef: AssessmentController['previewVideoRef']
  stimulus: { label: string; imageUrl: string }
  capturePhase: 'exposure' | 'response' | 'complete'
  onSelectSlot: (slotIndex: number) => void
  onStartExposure: () => Promise<void>
  onStopExposure: () => void
  onStartResponse: () => Promise<void>
  onStopResponse: () => void
  onContinueToQuestionnaire: () => void
}): React.JSX.Element {
  const autoExposureSlotRef = useRef<string | null>(null)
  const autoResponseSlotRef = useRef<string | null>(null)
  const continueAfterResponseRef = useRef(false)
  const exposureTimeoutRef = useRef<number | null>(null)
  const [confirmedExposureSlotKey, setConfirmedExposureSlotKey] = useState<string | null>(null)
  const [stimulusImageState, setStimulusImageState] = useState<{
    slotKey: string | null
    ready: boolean
  }>({ slotKey: null, ready: false })
  const [playbackIssue, setPlaybackIssue] = useState<{ slotKey: string; message: string } | null>(
    null
  )
  const isLightMode = capturePhase !== 'exposure'
  const slotKey = `${state.session?.id ?? 'session'}:${state.currentSlotIndex}`
  const stimulusImageReady = stimulusImageState.slotKey === slotKey && stimulusImageState.ready
  const playbackError = playbackIssue?.slotKey === slotKey ? playbackIssue.message : null
  const inlineMessages = Array.from(
    new Set(
      [playbackError, state.error, state.previewError].filter((value): value is string =>
        Boolean(value)
      )
    )
  )
  const exposureBlockingMessages = Array.from(
    new Set([playbackError, state.previewError].filter((value): value is string => Boolean(value)))
  )

  const currentCaptureStatus = state.captures[state.currentSlotIndex]
  const awaitingExposureConfirmation =
    capturePhase === 'exposure' &&
    !currentCaptureStatus?.exposure &&
    confirmedExposureSlotKey !== slotKey &&
    state.recordingMode === null
  const showExposurePlayback =
    capturePhase === 'exposure' &&
    confirmedExposureSlotKey === slotKey &&
    stimulusImageReady &&
    exposureBlockingMessages.length === 0
  const showExposureErrorState =
    capturePhase === 'exposure' &&
    !awaitingExposureConfirmation &&
    !showExposurePlayback &&
    inlineMessages.length > 0

  useEffect(() => {
    if (exposureTimeoutRef.current !== null) {
      window.clearTimeout(exposureTimeoutRef.current)
      exposureTimeoutRef.current = null
    }
    autoExposureSlotRef.current = null
    autoResponseSlotRef.current = null
    continueAfterResponseRef.current = false
  }, [slotKey])

  useEffect(() => {
    if (
      capturePhase !== 'exposure' ||
      !state.videoReady ||
      state.saving ||
      state.recordingMode !== null ||
      confirmedExposureSlotKey !== slotKey ||
      !stimulusImageReady ||
      currentCaptureStatus?.exposure ||
      autoExposureSlotRef.current === slotKey
    ) {
      return
    }

    autoExposureSlotRef.current = slotKey

    void (async () => {
      try {
        setPlaybackIssue(null)
        await onStartExposure()
        exposureTimeoutRef.current = window.setTimeout(() => {
          exposureTimeoutRef.current = null
          if (autoExposureSlotRef.current === slotKey) {
            onStopExposure()
          }
        }, STIMULUS_EXPOSURE_DURATION_MS)
      } catch (error) {
        autoExposureSlotRef.current = null
        setConfirmedExposureSlotKey(null)
        if (exposureTimeoutRef.current !== null) {
          window.clearTimeout(exposureTimeoutRef.current)
          exposureTimeoutRef.current = null
        }
        setPlaybackIssue({
          slotKey,
          message: error instanceof Error ? error.message : 'Stimulus gagal ditampilkan.'
        })
      }
    })()
  }, [
    capturePhase,
    confirmedExposureSlotKey,
    currentCaptureStatus?.exposure,
    onStartExposure,
    onStopExposure,
    slotKey,
    stimulusImageReady,
    state.recordingMode,
    state.saving,
    state.videoReady
  ])

  const prepareStimulusExposure = useCallback((): void => {
    if (!state.videoReady || state.saving) {
      return
    }

    setPlaybackIssue(null)
    setStimulusImageState({ slotKey, ready: false })

    const image = new Image()
    image.onload = () => {
      setStimulusImageState({ slotKey, ready: true })
      setConfirmedExposureSlotKey(slotKey)
    }
    image.onerror = () => {
      setStimulusImageState({ slotKey, ready: false })
      setConfirmedExposureSlotKey(null)
      setPlaybackIssue({
        slotKey,
        message: 'Gambar stimulus tidak dapat dimuat di perangkat ini.'
      })
    }
    image.src = stimulus.imageUrl
  }, [slotKey, state.saving, state.videoReady, stimulus.imageUrl])

  useEffect(() => {
    if (
      capturePhase !== 'response' ||
      !state.videoReady ||
      state.saving ||
      state.recordingMode !== null ||
      currentCaptureStatus?.response ||
      currentCaptureStatus?.audio ||
      autoResponseSlotRef.current === slotKey
    ) {
      return
    }

    autoResponseSlotRef.current = slotKey

    void (async () => {
      setPlaybackIssue(null)

      try {
        await onStartResponse()
      } catch (error) {
        autoResponseSlotRef.current = null
        setPlaybackIssue({
          slotKey,
          message: error instanceof Error ? error.message : 'Rekaman respons gagal dimulai.'
        })
      }
    })()
  }, [
    capturePhase,
    currentCaptureStatus?.audio,
    currentCaptureStatus?.response,
    onStartResponse,
    onStopResponse,
    slotKey,
    state.recordingMode,
    state.saving,
    state.videoReady
  ])

  const handleContinue = useCallback((): void => {
    const nextLaterIndex = state.captures.findIndex(
      (capture, index) =>
        index > state.currentSlotIndex && !(capture.exposure && capture.response && capture.audio)
    )
    if (nextLaterIndex !== -1) {
      onSelectSlot(nextLaterIndex)
      return
    }

    const remainingIndex = state.captures.findIndex(
      (capture, index) =>
        index !== state.currentSlotIndex && !(capture.exposure && capture.response && capture.audio)
    )
    if (remainingIndex !== -1) {
      onSelectSlot(remainingIndex)
      return
    }

    onContinueToQuestionnaire()
  }, [onContinueToQuestionnaire, onSelectSlot, state.captures, state.currentSlotIndex])

  useEffect(() => {
    if (!continueAfterResponseRef.current || state.recordingMode !== null || state.saving) {
      return
    }

    if (capturePhase === 'complete') {
      continueAfterResponseRef.current = false
      handleContinue()
      return
    }

    continueAfterResponseRef.current = false
  }, [capturePhase, handleContinue, state.recordingMode, state.saving])

  const handleResponseContinue = (): void => {
    if (state.saving) {
      return
    }

    if (capturePhase === 'response' && state.recordingMode === 'response') {
      continueAfterResponseRef.current = true
      onStopResponse()
      return
    }

    if (capturePhase === 'complete') {
      handleContinue()
    }
  }

  return (
    <div
      className={
        isLightMode
          ? 'assessment-warm-backdrop relative min-h-screen overflow-hidden text-ink'
          : 'relative min-h-screen overflow-hidden bg-capture text-capture-foreground'
      }
    >
      {showExposurePlayback && (
        <img
          src={stimulus.imageUrl}
          alt={stimulus.label}
          className="absolute inset-0 size-full object-contain bg-black"
          onError={() => {
            autoExposureSlotRef.current = null
            if (exposureTimeoutRef.current !== null) {
              window.clearTimeout(exposureTimeoutRef.current)
              exposureTimeoutRef.current = null
            }
            setConfirmedExposureSlotKey(null)
            setPlaybackIssue({
              slotKey,
              message: 'Gambar stimulus tidak dapat dimuat di perangkat ini.'
            })
          }}
        />
      )}
      <video
        ref={previewVideoRef}
        autoPlay
        muted
        playsInline
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
      />
      {capturePhase !== 'exposure' && <div className="assessment-warm-backdrop absolute inset-0" />}
      {capturePhase !== 'exposure' && (
        <>
          <div className="assessment-warm-glow absolute inset-0" />
        </>
      )}

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        {capturePhase !== 'exposure' && (
          <>
            <div className="flex justify-end">
              <p className="rounded-full border border-ink/10 bg-capture-panel px-4 py-2 text-sm italic text-ink-soft shadow-sm backdrop-blur-sm">
                Stimulus {state.currentSlotIndex + 1} dari {STIMULUS_COUNT}
              </p>
            </div>

            <ProgressBar
              value={(state.currentSlotIndex + 1) / STIMULUS_COUNT}
              tone="ink"
              className="mt-6"
            />
          </>
        )}

        <div className="flex flex-1 items-center justify-center px-2 py-12">
          {awaitingExposureConfirmation && (
            <div className="flex w-full max-w-xl flex-col items-center justify-center gap-6 text-center">
              <div className="space-y-3">
                <p className="text-lg text-white/76">Lanjut ke stimulus berikutnya.</p>
              </div>
              <Button
                type="button"
                className="rounded-xl"
                disabled={!state.videoReady || state.saving}
                onClick={prepareStimulusExposure}
              >
                {state.videoReady ? 'Lanjut' : 'Menyiapkan...'}
              </Button>
              {inlineMessages.length > 0 && (
                <div className="w-full rounded-[20px] border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning-container">
                  {inlineMessages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {showExposureErrorState && (
            <div className="flex w-full max-w-xl flex-col items-center justify-center gap-6 text-center">
              <div className="w-full rounded-[20px] border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning-container">
                {inlineMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
              <Button
                type="button"
                className="rounded-xl"
                disabled={!state.videoReady || state.saving}
                onClick={prepareStimulusExposure}
              >
                {state.videoReady ? 'Coba lagi' : 'Menyiapkan...'}
              </Button>
            </div>
          )}

          {capturePhase === 'response' && (
            <div className="flex w-full max-w-2xl flex-col items-center justify-center gap-12 text-center">
              <p
                className={
                  isLightMode
                    ? 'max-w-xl text-lg leading-8 text-ink'
                    : 'max-w-xl text-lg leading-8 text-capture-foreground/88'
                }
              >
                {STIMULUS_RESPONSE_PROMPT}
              </p>
              <MicIcon
                className={
                  isLightMode ? 'size-20 text-ink/92' : 'size-20 text-capture-foreground/92'
                }
              />
              <SignalMeter
                level={state.microphoneLevel}
                tone={isLightMode ? 'light' : 'dark'}
                compact
                className="mx-auto"
              />
              <Button
                type="button"
                className="rounded-xl"
                disabled={state.saving || state.recordingMode !== 'response'}
                onClick={handleResponseContinue}
              >
                {state.saving ? 'Menyimpan...' : 'Lanjut'}
              </Button>
            </div>
          )}

          {capturePhase === 'complete' && (
            <div className="flex w-full justify-center">
              <Button type="button" className="rounded-xl" onClick={handleResponseContinue}>
                Lanjut
              </Button>
            </div>
          )}
        </div>

        <div className="pb-4">
          {capturePhase !== 'exposure' && inlineMessages.length > 0 && (
            <div
              className={
                isLightMode
                  ? 'mx-auto flex w-full max-w-xl flex-col gap-2 rounded-[20px] border border-warning/25 bg-warning-container px-4 py-3 text-sm text-warning-container-foreground'
                  : 'mx-auto flex w-full max-w-xl flex-col gap-2 rounded-[20px] border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning-container'
              }
            >
              {inlineMessages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function QuestionnaireStage({
  state,
  onAnswer,
  onSave
}: {
  state: AssessmentController['state']
  onAnswer: AssessmentController['actions']['setAnswer']
  onSave: () => void
}): React.JSX.Element {
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false)

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col gap-8">
      <PageHeading
        eyebrow="Kuesioner"
        title="ECR-RS"
        description="Isi kuesioner sebelum melanjutkan."
      />

      <AppPanel contentClassName="flex flex-col gap-8 p-8">
        {questionnaireSections.map((section, sectionIndex) => (
          <div key={section.relation} className="flex flex-col gap-4">
            <h3 className="text-xl font-semibold text-foreground">{section.relation}</h3>
            <div className="flex flex-col gap-5">
              {section.items.map((item, itemIndex) => {
                const globalIndex = sectionIndex * section.items.length + itemIndex
                return (
                  <div key={`${section.relation}-${itemIndex}`} className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {globalIndex + 1}. {item}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-6">
                      {QUESTION_SCALE_VALUES.map((value) => (
                        <ChoiceChip
                          key={value}
                          active={state.answers[globalIndex] === value}
                          value={value}
                          label={scaleLabels[value]}
                          onClick={() => onAnswer(globalIndex, value)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </AppPanel>

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          Terisi: {state.answeredCount} / {QUESTION_COUNT}
        </div>
        <Button
          type="button"
          className="rounded-xl"
          disabled={state.answeredCount !== QUESTION_COUNT || state.saving}
          onClick={() => setShowSubmitConfirmation(true)}
        >
          Lanjut
        </Button>
      </div>

      <Dialog open={showSubmitConfirmation} onOpenChange={setShowSubmitConfirmation}>
        <DialogContent className="rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-lg">
          <DialogHeader>
            <Eyebrow>Konfirmasi</Eyebrow>
            <DialogTitle className="text-2xl tracking-[-0.04em]">Kirim jawaban ini?</DialogTitle>
            <DialogDescription className="text-base leading-7">
              Setelah dilanjutkan, kuesioner tidak bisa dibuka ulang dari alur asesmen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl bg-card"
              onClick={() => setShowSubmitConfirmation(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={state.saving}
              onClick={() => {
                setShowSubmitConfirmation(false)
                onSave()
              }}
            >
              {state.saving ? 'Menyimpan...' : 'Lanjut'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReviewStage({
  state,
  modelRuntimeReady,
  onStartInference
}: {
  state: AssessmentController['state']
  modelRuntimeReady?: boolean
  onStartInference: () => void
}): React.JSX.Element {
  const runtimeBlocked = modelRuntimeReady === false
  const sessionId = state.session?.id ?? '-'
  const participantName = state.participantName.trim() || 'Peserta belum diisi'
  const participantId = state.participantId.trim() || sessionId
  const age = state.age.trim() || 'Belum diisi'
  const captureSummary = `${state.captureCompletionCount} / ${STIMULUS_COUNT} stimulus lengkap`
  const questionnaireSummary = `${state.answeredCount} / ${QUESTION_COUNT} item ECR-RS`

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl flex-col justify-center gap-8">
      <div className="rounded-[32px] border border-border/60 bg-card/96 p-10 shadow-[var(--shadow-card)] sm:p-12">
        <PageHeading title="Data Selesai Didapatkan" align="center" />

        {runtimeBlocked ? (
          <StatusNotice tone="warning" title="Analisis lokal belum siap" className="mt-8 text-left">
            Komponen analisis lokal belum lengkap di perangkat ini. Minta pengelola aplikasi
            menyiapkan paket model sebelum memulai analisis.
          </StatusNotice>
        ) : null}

        <AppPanel
          title="Ringkasan pra-inferensi"
          className="mt-8 text-left"
          contentClassName="grid gap-3 pt-2 pb-5 sm:grid-cols-2"
        >
          <InfoRow label="Sesi" value={sessionId} />
          <InfoRow label="Peserta" value={participantName} />
          <InfoRow label="ID peserta" value={participantId} />
          <InfoRow label="Usia" value={age} />
          <InfoRow label="Rekaman" value={captureSummary} />
          <InfoRow label="Kuesioner" value={questionnaireSummary} />
        </AppPanel>

        <div className="mt-10 flex items-center justify-center">
          <Button
            type="button"
            className="rounded-xl"
            disabled={runtimeBlocked || !state.reviewReady || state.saving}
            onClick={onStartInference}
          >
            Lanjut
          </Button>
        </div>
      </div>
    </div>
  )
}

function RunningStage({ state }: { state: AssessmentController['state'] }): React.JSX.Element {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-10">
      <PageHeading eyebrow="Asesmen berjalan" title="Memproses asesmen" align="center" />

      <div className="rounded-[24px] border border-border/60 bg-card/92 p-8 shadow-sm">
        <ProgressBar value={Math.max(0.1, state.inferenceStatus?.progress ?? 0.1)} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {localizeInferenceStage(state.inferenceStatus?.stage) ?? 'Menyiapkan analisis...'}
        </p>
        {state.inferenceStatus && state.inferenceStatus.maxAttempts > 1 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground/80">
            Percobaan {Math.max(1, state.inferenceStatus.attempts)} dari{' '}
            {state.inferenceStatus.maxAttempts}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function ResultStage({
  result,
  postAssessmentNote,
  postAssessmentNoteUpdatedAt,
  saving,
  onSubmitFeedback,
  onSavePostAssessmentNote,
  onWipeSession,
  onExitAssessment
}: {
  result: AssessmentController['state']['result']
  postAssessmentNote: string
  postAssessmentNoteUpdatedAt: string | null
  saving: boolean
  onSubmitFeedback: (
    verdict: 'correct' | 'incorrect',
    correctedLabel?: 'secure' | 'insecure' | null
  ) => void
  onSavePostAssessmentNote: (text: string) => void
  onWipeSession: () => void
  onExitAssessment: () => void
}): React.JSX.Element {
  const [pendingFeedback, setPendingFeedback] = useState<{
    verdict: 'correct' | 'incorrect'
    correctedLabel: 'secure' | 'insecure' | null
  } | null>(null)
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(postAssessmentNote)
  const classification = result ? (result.label === 'secure' ? 'Secure' : 'Insecure') : null
  const oppositeLabel =
    result?.label === 'secure' ? 'insecure' : result?.label === 'insecure' ? 'secure' : null
  const oppositeClassification =
    oppositeLabel === 'secure' ? 'Secure' : oppositeLabel === 'insecure' ? 'Insecure' : null
  const isSecure = result?.label === 'secure'
  const noteDirty = noteDraft !== postAssessmentNote

  useEffect(() => {
    setNoteDraft(postAssessmentNote)
  }, [postAssessmentNote])

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col gap-8">
      <PageHeading
        eyebrow="Sesi selesai"
        title="Hasil asesmen"
        description="Terima kasih telah menyelesaikan sesi asesmen. Berikut adalah ringkasan hasil Anda."
      />

      {result ? (
        <>
          <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card/95 shadow-[var(--shadow-card)]">
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
              <div className="flex items-center gap-5">
                <div
                  className={`relative flex size-24 shrink-0 items-center justify-center rounded-full border ${
                    isSecure
                      ? 'border-success/20 bg-success-container/60 text-success'
                      : 'border-warning/20 bg-warning-container/60 text-warning'
                  }`}
                >
                  <div
                    className={`absolute inset-3 rounded-full ${
                      isSecure ? 'bg-success/8' : 'bg-warning/10'
                    }`}
                  />
                  {isSecure ? (
                    <ShieldCheckIcon className="relative z-10 size-11" />
                  ) : (
                    <ShieldAlertIcon className="relative z-10 size-11" />
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Hasil keseluruhan</p>
                  <h2 className="font-headline text-4xl font-semibold tracking-[-0.055em] text-foreground sm:text-5xl">
                    {classification}
                  </h2>
                  <p className="text-lg text-muted-foreground">
                    Tingkat keyakinan:{' '}
                    <span className={`font-semibold ${isSecure ? 'text-success' : 'text-warning'}`}>
                      {formatPercent(result.confidence)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="border-border/60 lg:border-l lg:pl-8">
                <p className="max-w-md text-xl font-semibold leading-9 text-foreground">
                  {isSecure
                    ? 'Pola yang lebih aman tetap perlu dirawat lewat konsistensi dan refleksi.'
                    : 'Terus lakukan langkah kecil setiap hari. Anda tidak sendiri, dan perubahan itu mungkin.'}
                </p>
                <div className="mt-5 flex items-center gap-3 text-primary">
                  <span className="h-0.5 w-11 rounded-full bg-primary" />
                  <HeartIcon className="size-4 fill-current" />
                  <span className="h-0.5 w-11 rounded-full bg-warning/40" />
                </div>
              </div>
            </div>
          </section>

          {result.lowConfidence ? (
            <StatusNotice tone="warning" title="Keyakinan rendah">
              Keyakinan berada di bawah ambang {formatPercent(result.lowConfidenceThreshold)}.
              Tinjau ulang sebelum digunakan dalam keputusan klinis.
            </StatusNotice>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <ResultCard title="Detail hasil">
              <ResultInfoTable
                rows={[
                  {
                    label: (
                      <InfoLabel tooltip="Tingkat keyakinan model terhadap label yang ditampilkan untuk sesi ini.">
                        Keyakinan
                      </InfoLabel>
                    ),
                    value: formatPercent(result.confidence)
                  },
                  {
                    label: (
                      <InfoLabel tooltip="Versi pipeline model lokal yang digunakan untuk menghasilkan hasil ini.">
                        Versi model
                      </InfoLabel>
                    ),
                    value: formatModelVersion(result.modelVersion)
                  },
                  {
                    label: (
                      <InfoLabel tooltip="Jumlah percobaan inferensi lokal yang dibutuhkan sampai hasil berhasil didapatkan.">
                        Jumlah percobaan
                      </InfoLabel>
                    ),
                    value: `${result.attemptCount}x`
                  },
                  {
                    label: (
                      <InfoLabel tooltip="Lama proses analisis lokal sejak pipeline dijalankan sampai hasil selesai dibuat.">
                        Durasi inferensi
                      </InfoLabel>
                    ),
                    value: formatDuration(result.inferenceDurationMs)
                  },
                  { label: 'Waktu selesai', value: formatDateTime(result.completedAt) }
                ]}
              />
            </ResultCard>

            <ResultCard title="Probabilitas kelas">
              <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
                <ProbabilityDonut
                  secure={result.probabilities.secure}
                  insecure={result.probabilities.insecure}
                />
                <div className="space-y-4">
                  <ProbabilityLegendRow
                    label="Secure"
                    value={formatPercent(result.probabilities.secure)}
                    colorClassName="bg-info/35"
                  />
                  <ProbabilityLegendRow
                    label="Insecure"
                    value={formatPercent(result.probabilities.insecure)}
                    colorClassName="bg-info"
                  />
                  <ProbabilityLegendRow
                    label="Ambang keyakinan"
                    value={formatPercent(result.lowConfidenceThreshold)}
                    colorClassName="bg-warning/60"
                  />
                </div>
              </div>
            </ResultCard>

            {result.ecrRsScores.length > 0 ? (
              <ResultCard title="Skor ECR-RS" className="lg:col-span-2">
                <div className="overflow-hidden rounded-[20px] border border-border/60">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_120px_120px] gap-4 border-b border-border/60 bg-background/50 px-5 py-4 text-sm text-muted-foreground">
                    <div>Aspek</div>
                    <div className="text-right">
                      <InfoLabel tooltip="Rata-rata skor dimensi anxious untuk relasi ini berdasarkan jawaban ECR-RS.">
                        Anxious
                      </InfoLabel>
                    </div>
                    <div className="text-right">
                      <InfoLabel tooltip="Rata-rata skor dimensi avoidance untuk relasi ini berdasarkan jawaban ECR-RS.">
                        Avoidance
                      </InfoLabel>
                    </div>
                  </div>

                  {result.ecrRsScores.map((score) => (
                    <div
                      key={score.relation}
                      className="grid grid-cols-[minmax(0,1.4fr)_120px_120px] gap-4 border-b border-border/50 px-5 py-4 text-sm last:border-b-0"
                    >
                      <div className="font-medium text-foreground">{score.relation}</div>
                      <div className="text-right text-foreground">{score.anxious.toFixed(2)}</div>
                      <div className="text-right text-foreground">{score.avoidance.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </ResultCard>
            ) : null}

            <div className="grid gap-4 lg:col-span-2 lg:grid-cols-[minmax(220px,0.55fr)_minmax(0,2.25fr)]">
              <ResultCard title="Feedback klinisi">
                {result.feedback ? (
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {result.feedback.verdict === 'correct'
                        ? 'Hasil ditandai sesuai.'
                        : `Hasil dikoreksi menjadi ${result.feedback.correctedLabel === 'secure' ? 'Secure' : 'Insecure'}.`}
                    </p>
                    <p>
                      Feedback tersimpan pada trace sesi lokal dan report training di folder
                      artifact aplikasi.
                    </p>
                  </div>
                ) : (
                  <div className="flex min-h-24 flex-col justify-center gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Hasil saat ini
                      </p>
                      <p className="text-sm font-semibold text-foreground">{classification}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-full border-primary/50 px-6 text-primary hover:bg-primary/5"
                        disabled={saving || !oppositeLabel}
                        onClick={() =>
                          oppositeLabel
                            ? setPendingFeedback({
                                verdict: 'incorrect',
                                correctedLabel: oppositeLabel
                              })
                            : null
                        }
                      >
                        Ubah hasil ke {oppositeClassification}
                      </Button>
                    </div>
                  </div>
                )}
              </ResultCard>

              <ResultCard title="Catatan pasca-asesmen">
                <AppTextField
                  label="Catatan pasca-asesmen"
                  hideLabel
                  value={noteDraft}
                  onChange={setNoteDraft}
                  placeholder="Tambahkan catatan klinis pasca-asesmen, misalnya kecenderungan avoidant/anxious atau konteks attachment yang perlu ditinjau."
                  multiline
                  inputClassName="rounded-[16px] bg-card"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {postAssessmentNoteUpdatedAt ? (
                    <p className="text-xs text-muted-foreground">
                      {`Terakhir disimpan ${formatDateTime(postAssessmentNoteUpdatedAt)}`}
                    </p>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    className="h-11 rounded-xl px-6"
                    disabled={saving || !noteDirty}
                    onClick={() => onSavePostAssessmentNote(noteDraft)}
                  >
                    {saving ? 'Menyimpan...' : 'Simpan catatan'}
                  </Button>
                </div>
              </ResultCard>
            </div>
          </div>

          <div className="rounded-[20px] border border-info/15 bg-info-container/45 px-5 py-4 text-info-container-foreground shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-6 items-center justify-center rounded-full border border-current/25">
                i
              </div>
              <div>
                <p className="font-semibold">Hanya pendukung keputusan klinis</p>
                <p className="mt-1 text-sm text-info-container-foreground/80">
                  Hasil ini mendukung tinjauan klinisi. Ini bukan diagnosis otomatis atau
                  rekomendasi terapi.
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-[32px] border border-destructive/20 bg-destructive/8 px-6 py-10 text-center text-sm text-destructive">
          Tidak ada prediksi untuk sesi ini.
        </div>
      )}

      <Dialog
        open={Boolean(pendingFeedback)}
        onOpenChange={(open) => {
          if (!open) setPendingFeedback(null)
        }}
      >
        <DialogContent className="rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl tracking-[-0.04em]">Ubah hasil asesmen?</DialogTitle>
            <DialogDescription className="text-base leading-7">
              {pendingFeedback?.verdict === 'correct'
                ? `Hasil akan ditandai sesuai sebagai ${classification}.`
                : `Hasil akan ditandai tidak sesuai dan dikoreksi menjadi ${
                    pendingFeedback?.correctedLabel === 'secure' ? 'Secure' : 'Insecure'
                  }.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl bg-card"
              disabled={saving}
              onClick={() => setPendingFeedback(null)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={saving || !pendingFeedback}
              onClick={() => {
                if (!pendingFeedback) return
                onSubmitFeedback(pendingFeedback.verdict, pendingFeedback.correctedLabel)
                setPendingFeedback(null)
              }}
            >
              {saving ? 'Menyimpan...' : 'Ubah hasil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl bg-card px-5"
          onClick={() => setWipeDialogOpen(true)}
        >
          <Trash2Icon className="size-4" />
          Hapus data sesi
        </Button>
        <Button type="button" className="h-11 rounded-xl px-6" onClick={onExitAssessment}>
          <CheckIcon className="size-4" />
          Selesai
        </Button>
      </div>

      <Dialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
        <DialogContent className="rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl tracking-[-0.04em]">Hapus data sesi?</DialogTitle>
            <DialogDescription className="text-base leading-7">
              Gunakan ini jika peserta tidak menyetujui penyimpanan data setelah hasil dilihat.
              Sesi, rekaman lokal, output model, dan report training untuk sesi ini akan dihapus
              dari perangkat ini.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl bg-card"
              disabled={saving}
              onClick={() => setWipeDialogOpen(false)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={saving}
              onClick={() => {
                setWipeDialogOpen(false)
                onWipeSession()
              }}
            >
              {saving ? 'Menghapus...' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ResultCard({
  title,
  className,
  children
}: {
  title: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={`rounded-[24px] border border-border/70 bg-card/95 p-6 shadow-[var(--shadow-card)] ${
        className ?? ''
      }`}
    >
      <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">{title}</h3>
      <div className="mt-5">{children}</div>
    </div>
  )
}

function ResultInfoTable({
  rows
}: {
  rows: Array<{ label: React.ReactNode; value: React.ReactNode }>
}): React.JSX.Element {
  return (
    <div className="divide-y divide-border/60 rounded-[20px] border border-border/60">
      {rows.map((row) => (
        <div
          key={typeof row.label === 'string' ? row.label : String(row.value)}
          className="flex items-center justify-between gap-6 px-5 py-4 text-sm"
        >
          <div className="text-muted-foreground">{row.label}</div>
          <div className="text-right font-medium text-foreground">{row.value}</div>
        </div>
      ))}
    </div>
  )
}

function ProbabilityDonut({
  secure,
  insecure
}: {
  secure: number
  insecure: number
}): React.JSX.Element {
  const secureDegrees = Math.max(0, Math.min(360, secure * 360))

  return (
    <div className="flex items-center justify-center">
      <div
        className="flex size-40 items-center justify-center rounded-full"
        style={{
          backgroundImage: `conic-gradient(var(--info-container) 0deg ${secureDegrees}deg, var(--info) ${secureDegrees}deg 360deg)`
        }}
        aria-label={`Probabilitas secure ${formatPercent(secure)} dan insecure ${formatPercent(insecure)}`}
      >
        <div className="flex size-24 items-center justify-center rounded-full border border-card/80 bg-card" />
      </div>
    </div>
  )
}

function ProbabilityLegendRow({
  label,
  value,
  colorClassName
}: {
  label: string
  value: string
  colorClassName: string
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className={`size-3 rounded-full ${colorClassName}`} />
        <span>{label}</span>
      </div>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function formatPercent(value: number): string {
  const percent = value * 100

  if (percent > 0 && percent < 0.1) {
    return '<0.1%'
  }

  if (percent < 100 && percent > 99.9) {
    return '>99.9%'
  }

  return `${percent.toFixed(1)}%`
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`
  }

  return `${(durationMs / 1000).toFixed(1)} s`
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('id-ID')
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  }).format(new Date(value))
}

function formatModelVersion(value: string): string {
  return value || 'v1.0'
}

function InfoLabel({
  children,
  tooltip
}: {
  children: React.ReactNode
  tooltip: React.ReactNode
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{children}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-4 items-center justify-center rounded-full border border-border/70 text-[10px] font-medium leading-none text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={`Info ${typeof children === 'string' ? children : 'label'}`}
            >
              ?
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8} className="max-w-64 leading-5">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  )
}

function localizeInferenceStage(stage?: string | null): string | null {
  if (!stage) return null

  const labels: Record<string, string> = {
    'Preparing local model inputs': 'Menyiapkan input model lokal',
    'Inference failed': 'Inferensi gagal',
    'Session cancelled': 'Sesi dibatalkan',
    'Inference complete': 'Inferensi selesai',
    'Waiting to start': 'Menunggu dimulai'
  }

  return labels[stage] ?? stage
}

function AssessmentField({
  label,
  value,
  onChange,
  description,
  helper,
  readOnly = false,
  placeholder,
  inputMode
}: {
  label: string
  value: string
  onChange: (value: string) => void
  description?: string
  helper?: string
  readOnly?: boolean
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
}): React.JSX.Element {
  return (
    <AppTextField
      label={label}
      value={value}
      onChange={onChange}
      description={description}
      helper={helper}
      readOnly={readOnly}
      placeholder={placeholder}
      inputMode={inputMode}
    />
  )
}

function DebugShortcutCard({
  busy,
  disabled,
  onUseTestData
}: {
  busy: boolean
  disabled: boolean
  onUseTestData: () => void
}): React.JSX.Element {
  return (
    <AppPanel
      tone="warm"
      className="border-info/18 bg-info/5"
      contentClassName="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-2">
        <Eyebrow className="text-info">Mode uji</Eyebrow>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Isi sesi ini lebih cepat dengan contoh identitas, rekaman, dan jawaban kuesioner sebelum
          mulai stimulus.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="rounded-xl bg-card sm:min-w-40"
        disabled={disabled}
        onClick={onUseTestData}
      >
        {busy ? 'Mengisi...' : 'Gunakan data uji'}
      </Button>
    </AppPanel>
  )
}

function AbortSessionButton({
  busy,
  onAbort
}: {
  busy: boolean
  onAbort: () => void
}): React.JSX.Element {
  return (
    <div className="fixed left-4 top-4 z-40 sm:left-8 sm:top-6">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 rounded-full border-border/60 bg-card/96 shadow-[var(--shadow-floating)] backdrop-blur-sm"
        aria-label="Tutup asesmen"
        disabled={busy}
        onClick={onAbort}
      >
        <XIcon className="size-5" />
      </Button>
    </div>
  )
}

function TopMessage({
  tone,
  text
}: {
  tone: 'error' | 'warning'
  text: string
}): React.JSX.Element {
  return (
    <StatusNotice
      tone={tone}
      title={tone === 'error' ? 'Masalah asesmen' : 'Perhatian perangkat'}
      className="mx-auto mb-6 max-w-6xl"
    >
      {text}
    </StatusNotice>
  )
}
