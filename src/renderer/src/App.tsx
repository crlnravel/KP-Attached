import { useCallback, useEffect, useMemo, useState } from 'react'
import { Code2Icon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { AppShell } from '@/components/app-shell'
import { StatusNotice } from '@/components/app-ui'
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
  navigateToView,
  parseAuthenticatedView,
  type AuthenticatedView
} from '@/components/app-shared'
import { AssessmentView, type ExistingPatientOption } from '@/features/assessment/assessment-view'
import { useAssessmentController } from '@/features/assessment/use-assessment-controller'
import { AdminView } from '@/features/admin/admin-view'
import { ContactDeveloperView } from '@/features/contact/contact-developer-view'
import { DashboardView } from '@/features/dashboard/dashboard-view'
import { LoginView } from '@/features/auth/login-view'
import { ProfileView } from '@/features/profile/profile-view'
import { attachedApi } from '@/lib/local-api'
import type {
  AdminSnapshot,
  AuthFormMode,
  AuthSnapshot,
  ChangePasswordInput,
  DashboardSnapshot,
  PsychologistRegistrationInput,
  ReviewAccessRequestInput,
  SessionRecord,
  UpdateAccountEmailInput,
  UpdatePsychologistProfileInput,
  VerificationDocument,
  VerificationDocumentKind
} from '@/lib/local-api'
import { createEmptyVerificationDocuments } from '@/lib/local-api'

const coverImageUrl = new URL('../../../resources/cover-image-login.avif', import.meta.url).href
const ACCESS_REQUEST_EXIT_WARNING = 'Permintaan akses belum dikirim. Tinggalkan halaman ini?'

function isActiveSessionState(state: DashboardSnapshot['sessions'][number]['state']): boolean {
  return state === 'draft' || state === 'ready_for_inference' || state === 'running_inference'
}

function buildDashboardSummary(sessions: SessionRecord[]): DashboardSnapshot['summary'] {
  return {
    totalSessions: sessions.length,
    completedSessions: sessions.filter((session) => session.state === 'completed').length,
    lowConfidenceSessions: sessions.filter((session) => session.state === 'low_confidence').length,
    failedSessions: sessions.filter((session) => session.state === 'failed').length,
    pendingSessions: sessions.filter((session) => isActiveSessionState(session.state)).length
  }
}

function mergeSessionIntoDashboard(
  snapshot: DashboardSnapshot,
  session: SessionRecord
): DashboardSnapshot {
  const existingIndex = snapshot.sessions.findIndex((current) => current.id === session.id)
  const nextSessions =
    existingIndex === -1
      ? [session, ...snapshot.sessions]
      : snapshot.sessions.map((current) => (current.id === session.id ? session : current))

  nextSessions.sort(
    (first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
  )

  return {
    ...snapshot,
    sessions: nextSessions,
    summary: buildDashboardSummary(nextSessions)
  }
}

type PatientChoice = ExistingPatientOption

type AssessmentPatientMode = 'new' | 'existing' | null

function getPatientChoiceKey(session: SessionRecord): string {
  return (
    session.draft.participantId.trim().toLowerCase() ||
    session.draft.participantName.trim().toLowerCase() ||
    session.id
  )
}

function buildPatientChoices(sessions: SessionRecord[]): PatientChoice[] {
  const groups = new Map<string, SessionRecord[]>()
  for (const session of sessions) {
    if (!session.draft.participantId.trim() && !session.draft.participantName.trim()) {
      continue
    }

    const key = getPatientChoiceKey(session)
    groups.set(key, [...(groups.get(key) ?? []), session])
  }

  return Array.from(groups.entries())
    .map(([key, groupSessions]) => {
      const sortedSessions = [...groupSessions].sort(
        (first, second) =>
          new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
      )
      const latestSession = sortedSessions[0]
      return {
        key,
        name: latestSession.draft.participantName || 'Peserta belum diisi',
        participantId: latestSession.draft.participantId || latestSession.id,
        age: latestSession.draft.age,
        notes: latestSession.draft.notes,
        lastUpdated: latestSession.updatedAt,
        assessmentCount: sortedSessions.length
      }
    })
    .sort(
      (first, second) =>
        new Date(second.lastUpdated).getTime() - new Date(first.lastUpdated).getTime()
    )
}

function createEmptyRegistration(): PsychologistRegistrationInput {
  return {
    legalName: '',
    professionalPhone: '',
    licenseType: 'licensed_psychologist',
    licenseNumber: '',
    licenseJurisdiction: '',
    issuingBoard: '',
    licenseIssuedAt: '',
    licenseExpiresAt: '',
    npiNumber: '',
    doctoralDegree: '',
    degreeInstitution: '',
    degreeGraduationYear: '',
    practiceOrganization: '',
    practiceAddress: '',
    specialtyArea: '',
    documents: createEmptyVerificationDocuments()
  }
}

function createRegistrationFromSnapshotUser(
  user: NonNullable<AuthSnapshot['knownUser']>
): PsychologistRegistrationInput {
  return {
    legalName: user.profile.legalName,
    professionalPhone: user.profile.professionalPhone,
    licenseType: user.profile.licenseType,
    licenseNumber: user.profile.licenseNumber,
    licenseJurisdiction: user.profile.licenseJurisdiction,
    issuingBoard: user.profile.issuingBoard,
    licenseIssuedAt: user.profile.licenseIssuedAt,
    licenseExpiresAt: user.profile.licenseExpiresAt,
    npiNumber: user.profile.npiNumber,
    doctoralDegree: user.profile.doctoralDegree,
    degreeInstitution: user.profile.degreeInstitution,
    degreeGraduationYear: user.profile.degreeGraduationYear,
    practiceOrganization: user.profile.practiceOrganization,
    practiceAddress: user.profile.practiceAddress,
    specialtyArea: user.profile.specialtyArea,
    documents: {
      ...createEmptyVerificationDocuments(),
      ...user.profile.documents
    }
  }
}

function hasAccessRequestProgress(
  email: string,
  password: string,
  registration: PsychologistRegistrationInput
): boolean {
  return (
    email.trim().length > 0 ||
    password.trim().length > 0 ||
    Object.entries(registration).some(([field, value]) => {
      if (field === 'documents') {
        return Object.values(registration.documents).some(Boolean)
      }

      if (field === 'licenseType') {
        return value !== 'licensed_psychologist'
      }

      return typeof value === 'string' && value.trim().length > 0
    })
  )
}

function formatAppError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback
  }

  const message = error.message
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '')
    .trim()

  return message.length > 0 ? message : fallback
}

type AuthNotice = {
  tone: 'info' | 'success' | 'warning'
  title: string
  message: string
} | null

type SignInFollowup =
  | { kind: 'admin'; snapshot: AdminSnapshot }
  | { kind: 'dashboard'; snapshot: DashboardSnapshot }

function App(): React.JSX.Element {
  const [view, setView] = useState<AuthenticatedView>(() =>
    parseAuthenticatedView(window.location.hash)
  )
  const [authSnapshot, setAuthSnapshot] = useState<AuthSnapshot | null>(null)
  const [dashboardSnapshot, setDashboardSnapshot] = useState<DashboardSnapshot | null>(null)
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot | null>(null)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [authPending, setAuthPending] = useState(false)
  const [dashboardPending, setDashboardPending] = useState(false)
  const [adminPending, setAdminPending] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [registration, setRegistration] =
    useState<PsychologistRegistrationInput>(createEmptyRegistration())
  const [authMode, setAuthMode] = useState<AuthFormMode>('request_access')
  const [authNotice, setAuthNotice] = useState<AuthNotice>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [assessmentPatientMode, setAssessmentPatientMode] = useState<AssessmentPatientMode>(null)
  const [startAssessmentDialogOpen, setStartAssessmentDialogOpen] = useState(false)
  const [startAssessmentPending, setStartAssessmentPending] = useState(false)
  const [startAssessmentError, setStartAssessmentError] = useState<string | null>(null)
  const activeSession =
    dashboardSnapshot?.sessions.find((session) => isActiveSessionState(session.state)) ?? null
  const patientChoices = useMemo(
    () => buildPatientChoices(dashboardSnapshot?.sessions ?? []),
    [dashboardSnapshot?.sessions]
  )
  const startAssessmentDisabled = dashboardPending || authSnapshot?.user?.role === 'admin'
  const hasUnsubmittedAccessRequest =
    !authSnapshot?.user &&
    authMode === 'request_access' &&
    hasAccessRequestProgress(email, password, registration)

  const applyAuthSnapshot = useCallback((snapshot: AuthSnapshot): void => {
    setAuthSnapshot(snapshot)
    setEmail(snapshot.user?.username ?? '')
    if (snapshot.user) {
      setRegistration(createRegistrationFromSnapshotUser(snapshot.user))
    } else {
      setRegistration(createEmptyRegistration())
    }
    setDashboardSnapshot((current) => {
      if (!current || !snapshot.user) {
        return current
      }

      return { ...current, user: snapshot.user }
    })
  }, [])

  const refreshDashboard = useCallback(async (): Promise<void> => {
    if (!authSnapshot?.user || authSnapshot.user.role !== 'psychologist') {
      return
    }

    setDashboardPending(true)
    try {
      const snapshot = await attachedApi.dashboard.getSnapshot()
      setDashboardSnapshot(snapshot)
      setDashboardError(null)
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Gagal memuat ulang dasbor.')
    } finally {
      setDashboardPending(false)
    }
  }, [authSnapshot?.user])

  const refreshAdmin = useCallback(async (): Promise<void> => {
    if (!authSnapshot?.user || authSnapshot.user.role !== 'admin') {
      return
    }

    setAdminPending(true)
    try {
      const snapshot = await attachedApi.admin.getSnapshot()
      setAdminSnapshot(snapshot)
      setAdminError(null)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Gagal memuat halaman admin.')
    } finally {
      setAdminPending(false)
    }
  }, [authSnapshot?.user])

  const assessment = useAssessmentController({
    sessionId: activeSessionId,
    isActive: Boolean(authSnapshot?.user) && view === 'assessment',
    onSessionChanged: () => {
      void refreshDashboard()
    },
    onSessionAborted: () => {
      setActiveSessionId(null)
      handleNavigate('dashboard')
      void refreshDashboard()
    }
  })

  useEffect(() => {
    void attachedApi.auth
      .getSnapshot()
      .then((snapshot) => {
        applyAuthSnapshot(snapshot)
        setAuthMode(snapshot.user || snapshot.initialized ? 'sign_in' : 'request_access')
        if (snapshot.user) {
          if (snapshot.user.role === 'admin') {
            handleNavigate('admin')
            return attachedApi.admin.getSnapshot().then((admin) => {
              setAdminSnapshot(admin)
              setAdminError(null)
            })
          }

          return attachedApi.dashboard.getSnapshot().then((dashboard) => {
            setDashboardSnapshot(dashboard)
            setDashboardError(null)
          })
        }
        return undefined
      })
      .catch((error) => {
        setAuthError(formatAppError(error, 'Gagal membuka workspace.'))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [applyAuthSnapshot])

  useEffect(() => {
    if (!authSnapshot?.user) {
      return
    }
    const syncViewFromHash = (): void => {
      const parsedView = parseAuthenticatedView(window.location.hash)
      if (
        authSnapshot.user?.role === 'admin' &&
        (parsedView === 'dashboard' || parsedView === 'assessment')
      ) {
        setView('admin')
        return
      }
      setView(parsedView)
    }

    syncViewFromHash()
    window.addEventListener('hashchange', syncViewFromHash)
    return () => window.removeEventListener('hashchange', syncViewFromHash)
  }, [authSnapshot?.user])

  useEffect(() => {
    if (!hasUnsubmittedAccessRequest) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent): string => {
      event.preventDefault()
      event.returnValue = ACCESS_REQUEST_EXIT_WARNING
      return ACCESS_REQUEST_EXIT_WARNING
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsubmittedAccessRequest])

  useEffect(() => {
    if (view === 'admin') {
      void refreshAdmin()
    }
  }, [refreshAdmin, view])

  useEffect(() => {
    const currentAssessmentSession = assessment.state.session
    if (!currentAssessmentSession) {
      return
    }

    setDashboardSnapshot((current) => {
      if (!current) {
        return current
      }

      return mergeSessionIntoDashboard(current, currentAssessmentSession)
    })
  }, [assessment.state.session])

  const handleNavigate = (nextView: AuthenticatedView): void => {
    navigateToView(nextView)
    setView(nextView)
  }

  const handleAuthModeChange = (value: AuthFormMode): boolean => {
    if (value === authMode) {
      return true
    }

    if (
      authMode === 'request_access' &&
      value !== 'request_access' &&
      hasUnsubmittedAccessRequest &&
      !window.confirm(ACCESS_REQUEST_EXIT_WARNING)
    ) {
      return false
    }

    setAuthMode(value)
    setAuthError(null)
    setAuthNotice(null)
    return true
  }

  const handleRegistrationDocumentChange = (
    kind: VerificationDocumentKind,
    document: VerificationDocument | null
  ): void => {
    setRegistration((current) => ({
      ...current,
      documents: {
        ...current.documents,
        [kind]: document
      }
    }))
  }

  const handleSignIn = (): void => {
    setAuthPending(true)
    setAuthError(null)
    setAuthNotice(null)

    void attachedApi.auth
      .signIn({ username: email, password })
      .then(async (snapshot): Promise<SignInFollowup> => {
        applyAuthSnapshot(snapshot)
        setPassword('')
        setAuthMode('sign_in')
        setRegistration(createEmptyRegistration())
        if (snapshot.user?.role === 'admin') {
          return {
            kind: 'admin',
            snapshot: await attachedApi.admin.getSnapshot()
          }
        }
        return {
          kind: 'dashboard',
          snapshot: await attachedApi.dashboard.getSnapshot()
        }
      })
      .then((result) => {
        if (result.kind === 'admin') {
          setAdminSnapshot(result.snapshot)
          setDashboardSnapshot(null)
          handleNavigate('admin')
          return
        }

        setDashboardSnapshot(result.snapshot)
        setAdminSnapshot(null)
        handleNavigate('dashboard')
      })
      .catch((error) => {
        setAuthError(formatAppError(error, 'Gagal masuk.'))
      })
      .finally(() => {
        setAuthPending(false)
      })
  }

  const handleSubmitAccessRequest = (): void => {
    setAuthPending(true)
    setAuthError(null)
    setAuthNotice(null)

    void attachedApi.auth
      .submitAccessRequest({ username: email, password, registration })
      .then((result) => {
        applyAuthSnapshot(result.snapshot)
        setPassword('')
        setAuthMode('sign_in')
        if (result.status !== 'verified') {
          setAuthNotice({
            tone: result.status === 'rejected' ? 'warning' : 'info',
            title:
              result.status === 'rejected' ? 'Permintaan akses ditolak' : 'Permintaan terkirim',
            message: result.message
          })
        }
      })
      .catch((error) => {
        setAuthError(formatAppError(error, 'Gagal mengirim permintaan akses.'))
      })
      .finally(() => {
        setAuthPending(false)
      })
  }

  const handleUpdateProfile = (input: UpdatePsychologistProfileInput): Promise<void> => {
    return attachedApi.auth.updateProfile(input).then((snapshot) => {
      applyAuthSnapshot(snapshot)
    })
  }

  const handleUpdateEmail = (input: UpdateAccountEmailInput): Promise<void> => {
    return attachedApi.auth.updateEmail(input).then((snapshot) => {
      applyAuthSnapshot(snapshot)
    })
  }

  const handleChangePassword = (input: ChangePasswordInput): Promise<void> => {
    return attachedApi.auth.changePassword(input).then((snapshot) => {
      applyAuthSnapshot(snapshot)
    })
  }

  const handleSignOut = (): void => {
    void attachedApi.auth
      .signOut()
      .then((snapshot) => {
        applyAuthSnapshot(snapshot)
        setDashboardSnapshot(null)
        setAdminSnapshot(null)
        setPassword('')
        setActiveSessionId(null)
        setAssessmentPatientMode(null)
        setAuthMode('sign_in')
        setAuthNotice(null)
        window.location.hash = ''
        setView('dashboard')
      })
      .catch((error) => {
        setAuthError(formatAppError(error, 'Gagal keluar.'))
      })
  }

  const handleResetLocalData = (): Promise<void> => {
    return attachedApi.auth.resetLocalData().then((snapshot) => {
      applyAuthSnapshot(snapshot)
      setDashboardSnapshot(null)
      setAdminSnapshot(null)
      setDashboardError(null)
      setAdminError(null)
      setActiveSessionId(null)
      setAssessmentPatientMode(null)
      setPassword('')
      setAuthMode(snapshot.initialized ? 'sign_in' : 'request_access')
      setAuthNotice({
        tone: 'info',
        title: 'Data lokal dihapus',
        message: 'Semua akun, sesi, dan artefak lokal pada workstation ini telah dibersihkan.'
      })
      window.location.hash = ''
      setView('dashboard')
    })
  }

  const handleStartAssessment = (): void => {
    if (authSnapshot?.user?.role === 'admin') {
      handleNavigate('admin')
      return
    }

    if (activeSession) {
      setDashboardError(null)
      setActiveSessionId(activeSession.id)
      setAssessmentPatientMode(null)
      handleNavigate('assessment')
      return
    }

    setStartAssessmentError(null)
    setStartAssessmentDialogOpen(true)
  }

  const handleCreateNewAssessment = (): void => {
    setStartAssessmentPending(true)
    setStartAssessmentError(null)

    void attachedApi.sessions
      .create()
      .then((session) => {
        setActiveSessionId(session.id)
        setAssessmentPatientMode('new')
        setStartAssessmentDialogOpen(false)
        handleNavigate('assessment')
        return refreshDashboard()
      })
      .catch((error) => {
        setStartAssessmentError(
          error instanceof Error ? error.message : 'Gagal membuat sesi asesmen.'
        )
      })
      .finally(() => {
        setStartAssessmentPending(false)
      })
  }

  const handleCreateExistingPatientAssessment = (): void => {
    setStartAssessmentPending(true)
    setStartAssessmentError(null)

    void attachedApi.sessions
      .create()
      .then((session) => {
        setActiveSessionId(session.id)
        setAssessmentPatientMode('existing')
        setStartAssessmentDialogOpen(false)
        handleNavigate('assessment')
        return refreshDashboard()
      })
      .catch((error) => {
        setStartAssessmentError(
          error instanceof Error ? error.message : 'Gagal membuat sesi asesmen.'
        )
      })
      .finally(() => {
        setStartAssessmentPending(false)
      })
  }

  const handleOpenSession = (sessionId: string): void => {
    setActiveSessionId(sessionId)
    setAssessmentPatientMode(null)
    handleNavigate('assessment')
  }

  const handleAbortSession = useCallback(
    async (sessionId: string): Promise<void> => {
      await attachedApi.sessions.abort(sessionId)
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
        setAssessmentPatientMode(null)
      }
      await refreshDashboard()
    },
    [activeSessionId, refreshDashboard]
  )

  const handleDeleteSessionRecordings = useCallback(
    async (sessionId: string): Promise<void> => {
      await attachedApi.sessions.deleteRecordings(sessionId)
      await refreshDashboard()
    },
    [refreshDashboard]
  )

  const handleSavePostAssessmentNote = useCallback(
    async (sessionId: string, text: string): Promise<void> => {
      const session = await attachedApi.sessions.savePostAssessmentNote({ sessionId, text })
      setDashboardSnapshot((current) =>
        current ? mergeSessionIntoDashboard(current, session) : current
      )
      await refreshDashboard()
    },
    [refreshDashboard]
  )

  const handleReviewAccessRequest = (input: ReviewAccessRequestInput): void => {
    setAdminPending(true)
    setAdminError(null)

    void attachedApi.admin
      .reviewAccessRequest(input)
      .then((snapshot) => {
        setAdminSnapshot(snapshot)
      })
      .catch((error) => {
        setAdminError(error instanceof Error ? error.message : 'Gagal memperbarui status akses.')
      })
      .finally(() => {
        setAdminPending(false)
      })
  }

  if (loading) {
    return <main className="min-h-screen bg-background" />
  }

  if (!authSnapshot?.user) {
    return (
      <>
        <LoginView
          email={email}
          password={password}
          registration={registration}
          authMode={authMode}
          knownUser={authSnapshot?.knownUser ?? null}
          remoteAuth={
            authSnapshot?.remoteAuth ?? {
              requestAccessEnabled: false,
              approvalSyncEnabled: false,
              debugAutoApprovalEnabled: false
            }
          }
          onAuthModeChange={handleAuthModeChange}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onRegistrationChange={(field, value) =>
            setRegistration((current) => ({ ...current, [field]: value }))
          }
          onRegistrationDocumentChange={handleRegistrationDocumentChange}
          onSignIn={handleSignIn}
          onSubmitAccessRequest={handleSubmitAccessRequest}
          coverImageUrl={coverImageUrl}
          notice={authNotice}
          error={authError}
          isSubmitting={authPending}
        />
        {authSnapshot?.remoteAuth.debugAutoApprovalEnabled ? <DevModeMarker /> : null}
      </>
    )
  }

  if (view === 'assessment' && authSnapshot.user.role === 'psychologist') {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <AssessmentView
          controller={assessment}
          modelRuntimeReady={dashboardSnapshot?.modelRuntimeReady}
          patientMode={assessmentPatientMode}
          existingPatientOptions={patientChoices}
          onExitAssessment={() => {
            if (assessment.state.session && !isActiveSessionState(assessment.state.session.state)) {
              setActiveSessionId(null)
              setAssessmentPatientMode(null)
            }
            handleNavigate('dashboard')
            void refreshDashboard()
          }}
        />
        {authSnapshot.remoteAuth.debugAutoApprovalEnabled ? <DevModeMarker /> : null}
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AppShell
        currentView={view}
        onNavigate={handleNavigate}
        onStartAssessment={handleStartAssessment}
        startAssessmentDisabled={startAssessmentDisabled}
        onSignOut={handleSignOut}
        userRole={authSnapshot.user.role}
        showUser={false}
        userName={authSnapshot.user.fullName}
      >
        {view === 'dashboard' && (
          <DashboardView
            snapshot={dashboardSnapshot}
            isLoading={dashboardPending}
            error={dashboardError}
            onOpenSession={handleOpenSession}
            onAbortSession={handleAbortSession}
            onDeleteSessionRecordings={handleDeleteSessionRecordings}
            onSavePostAssessmentNote={handleSavePostAssessmentNote}
          />
        )}
        {view === 'admin' && (
          <AdminView
            snapshot={adminSnapshot}
            isLoading={adminPending}
            error={adminError}
            onReviewAccessRequest={(userId, decision) =>
              handleReviewAccessRequest({ userId, decision })
            }
          />
        )}
        {view === 'profile' && (
          <ProfileView
            user={authSnapshot.user}
            onUpdateProfile={handleUpdateProfile}
            onUpdateEmail={handleUpdateEmail}
            onChangePassword={handleChangePassword}
            onResetLocalData={handleResetLocalData}
          />
        )}
        {view === 'contact' && <ContactDeveloperView />}
      </AppShell>
      <StartAssessmentDialog
        open={startAssessmentDialogOpen}
        hasExistingPatients={patientChoices.length > 0}
        isSubmitting={startAssessmentPending}
        error={startAssessmentError}
        onOpenChange={setStartAssessmentDialogOpen}
        onCreateNew={handleCreateNewAssessment}
        onSelectExisting={handleCreateExistingPatientAssessment}
      />
      {authSnapshot.remoteAuth.debugAutoApprovalEnabled ? <DevModeMarker /> : null}
    </main>
  )
}

function StartAssessmentDialog({
  open,
  hasExistingPatients,
  isSubmitting,
  error,
  onOpenChange,
  onCreateNew,
  onSelectExisting
}: {
  open: boolean
  hasExistingPatients: boolean
  isSubmitting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onCreateNew: () => void
  onSelectExisting: () => void
}): React.JSX.Element {
  const [selectedMode, setSelectedMode] = useState<'new' | 'existing' | null>(null)

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setSelectedMode(null)
    }
    onOpenChange(nextOpen)
  }

  const submitSelection = (): void => {
    if (selectedMode === 'new') {
      setSelectedMode(null)
      onCreateNew()
      return
    }

    if (selectedMode === 'existing') {
      setSelectedMode(null)
      onSelectExisting()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">Mulai asesmen</DialogTitle>
          <DialogDescription className="text-base leading-7">
            Pilih jenis pasien untuk menentukan tampilan langkah pertama asesmen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {error ? (
            <StatusNotice tone="error" title="Asesmen gagal dibuat">
              {error}
            </StatusNotice>
          ) : null}

          <label className="flex cursor-pointer items-start gap-4 rounded-[22px] border border-border/70 bg-background/70 p-5 transition hover:border-primary/30 hover:bg-muted/35">
            <input
              type="radio"
              name="assessment-patient-mode"
              className="mt-1 size-5 accent-primary"
              checked={selectedMode === 'new'}
              disabled={isSubmitting}
              onChange={() => setSelectedMode('new')}
            />
            <div>
              <p className="font-medium text-foreground">Pasien baru</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Langkah pertama menampilkan form identitas peserta seperti biasa.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-4 rounded-[22px] border border-border/70 bg-background/70 p-5 transition hover:border-primary/30 hover:bg-muted/35">
            <input
              type="radio"
              name="assessment-patient-mode"
              className="mt-1 size-5 accent-primary"
              checked={selectedMode === 'existing'}
              disabled={isSubmitting || !hasExistingPatients}
              onChange={() => setSelectedMode('existing')}
            />
            <div>
              <p className="font-medium text-foreground">Pasien terdaftar</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Langkah pertama diganti menjadi pencarian dan pemilihan pasien.
              </p>
              {!hasExistingPatients ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Belum ada pasien lama yang bisa dipilih.
                </p>
              ) : null}
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl bg-card"
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={isSubmitting || selectedMode === null}
            onClick={submitSelection}
          >
            {isSubmitting ? 'Membuat...' : 'Pilih'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DevModeMarker(): React.JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="fixed right-5 bottom-4 z-50 flex size-11 cursor-help items-center justify-center rounded-full border border-warning/30 bg-background/88 text-warning-container-foreground shadow-[0_12px_30px_rgb(17_24_39_/_0.08)] backdrop-blur-md"
            aria-label="Mode pengembangan aktif"
          >
            <Code2Icon className="size-4.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={10}>
          Versi ini berjalan dalam mode pengembangan.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default App
