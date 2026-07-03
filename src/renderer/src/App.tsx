import { useCallback, useEffect, useMemo, useState } from 'react'
import { Code2Icon } from 'lucide-react'

import { AppShell } from '@/components/app-shell'
import {
  navigateToView,
  parseAuthenticatedView,
  type AuthenticatedView
} from '@/components/app-shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AssessmentView } from '@/features/assessment/assessment-view'
import { useAssessmentController } from '@/features/assessment/use-assessment-controller'
import { AdminView } from '@/features/admin/admin-view'
import {
  ACCESS_REQUEST_EXIT_WARNING,
  createEmptyRegistration,
  createRegistrationFromSnapshotUser,
  formatAppError,
  hasAccessRequestProgress,
  type AssessmentPatientMode
} from '@/features/app/app-flow'
import { StartAssessmentDialog } from '@/features/app/start-assessment-dialog'
import { LoginView } from '@/features/auth/login-view'
import { ContactDeveloperView } from '@/features/contact/contact-developer-view'
import { DashboardView } from '@/features/dashboard/dashboard-view'
import { ProfileView } from '@/features/profile/profile-view'
import {
  buildExistingPatientOptions,
  isActiveSessionState,
  mergeSessionIntoDashboard
} from '@/features/session/session-record-utils'
import { attachedApi } from '@/lib/local-api'
import type {
  AdminSnapshot,
  AuthFormMode,
  AuthSnapshot,
  ChangePasswordInput,
  DashboardSnapshot,
  PsychologistRegistrationInput,
  ReviewAccessRequestInput,
  UpdateAccountEmailInput,
  UpdatePsychologistProfileInput,
  VerificationDocument,
  VerificationDocumentKind
} from '@/lib/local-api'

const coverImageUrl = new URL('../../../resources/cover-image-login.avif', import.meta.url).href

const defaultRemoteAuth: AuthSnapshot['remoteAuth'] = {
  requestAccessEnabled: false,
  approvalSyncEnabled: false,
  debugAutoApprovalEnabled: false
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
    () => buildExistingPatientOptions(dashboardSnapshot?.sessions ?? []),
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

  const handleNavigate = useCallback((nextView: AuthenticatedView): void => {
    navigateToView(nextView)
    setView(nextView)
  }, [])

  const clearAssessmentContext = useCallback((): void => {
    setActiveSessionId(null)
    setAssessmentPatientMode(null)
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
      clearAssessmentContext()
      handleNavigate('dashboard')
      void refreshDashboard()
    }
  })

  useEffect(() => {
    let isCancelled = false

    const loadInitialState = async (): Promise<void> => {
      try {
        const snapshot = await attachedApi.auth.getSnapshot()
        if (isCancelled) {
          return
        }

        applyAuthSnapshot(snapshot)
        setAuthMode(snapshot.user || snapshot.initialized ? 'sign_in' : 'request_access')

        if (!snapshot.user) {
          return
        }

        if (snapshot.user.role === 'admin') {
          handleNavigate('admin')
          const nextAdminSnapshot = await attachedApi.admin.getSnapshot()

          if (isCancelled) {
            return
          }

          setAdminSnapshot(nextAdminSnapshot)
          setAdminError(null)
          return
        }

        const nextDashboardSnapshot = await attachedApi.dashboard.getSnapshot()

        if (isCancelled) {
          return
        }

        setDashboardSnapshot(nextDashboardSnapshot)
        setDashboardError(null)
      } catch (error) {
        if (!isCancelled) {
          setAuthError(formatAppError(error, 'Gagal membuka workspace.'))
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialState()

    return () => {
      isCancelled = true
    }
  }, [applyAuthSnapshot, handleNavigate])

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

  const handleSignIn = async (): Promise<void> => {
    setAuthPending(true)
    setAuthError(null)
    setAuthNotice(null)

    try {
      const snapshot = await attachedApi.auth.signIn({ username: email, password })

      applyAuthSnapshot(snapshot)
      setPassword('')
      setAuthMode('sign_in')
      setRegistration(createEmptyRegistration())

      const followup: SignInFollowup =
        snapshot.user?.role === 'admin'
          ? {
              kind: 'admin',
              snapshot: await attachedApi.admin.getSnapshot()
            }
          : {
              kind: 'dashboard',
              snapshot: await attachedApi.dashboard.getSnapshot()
            }

      if (followup.kind === 'admin') {
        setAdminSnapshot(followup.snapshot)
        setDashboardSnapshot(null)
        handleNavigate('admin')
        return
      }

      setDashboardSnapshot(followup.snapshot)
      setAdminSnapshot(null)
      handleNavigate('dashboard')
    } catch (error) {
      setAuthError(formatAppError(error, 'Gagal masuk.'))
    } finally {
      setAuthPending(false)
    }
  }

  const handleSubmitAccessRequest = async (): Promise<void> => {
    setAuthPending(true)
    setAuthError(null)
    setAuthNotice(null)

    try {
      const result = await attachedApi.auth.submitAccessRequest({
        username: email,
        password,
        registration
      })

      applyAuthSnapshot(result.snapshot)
      setPassword('')
      setAuthMode('sign_in')

      if (result.status !== 'verified') {
        setAuthNotice({
          tone: result.status === 'rejected' ? 'warning' : 'info',
          title: result.status === 'rejected' ? 'Permintaan akses ditolak' : 'Permintaan terkirim',
          message: result.message
        })
      }
    } catch (error) {
      setAuthError(formatAppError(error, 'Gagal mengirim permintaan akses.'))
    } finally {
      setAuthPending(false)
    }
  }

  const handleUpdateProfile = async (input: UpdatePsychologistProfileInput): Promise<void> => {
    const snapshot = await attachedApi.auth.updateProfile(input)
    applyAuthSnapshot(snapshot)
  }

  const handleUpdateEmail = async (input: UpdateAccountEmailInput): Promise<void> => {
    const snapshot = await attachedApi.auth.updateEmail(input)
    applyAuthSnapshot(snapshot)
  }

  const handleChangePassword = async (input: ChangePasswordInput): Promise<void> => {
    const snapshot = await attachedApi.auth.changePassword(input)
    applyAuthSnapshot(snapshot)
  }

  const handleSignOut = async (): Promise<void> => {
    try {
      const snapshot = await attachedApi.auth.signOut()

      applyAuthSnapshot(snapshot)
      setDashboardSnapshot(null)
      setAdminSnapshot(null)
      setPassword('')
      clearAssessmentContext()
      setAuthMode('sign_in')
      setAuthNotice(null)
      window.location.hash = ''
      setView('dashboard')
    } catch (error) {
      setAuthError(formatAppError(error, 'Gagal keluar.'))
    }
  }

  const handleResetLocalData = async (): Promise<void> => {
    const snapshot = await attachedApi.auth.resetLocalData()

    applyAuthSnapshot(snapshot)
    setDashboardSnapshot(null)
    setAdminSnapshot(null)
    setDashboardError(null)
    setAdminError(null)
    clearAssessmentContext()
    setPassword('')
    setAuthMode(snapshot.initialized ? 'sign_in' : 'request_access')
    setAuthNotice({
      tone: 'info',
      title: 'Data lokal dihapus',
      message: 'Semua akun, sesi, dan artefak lokal pada workstation ini telah dibersihkan.'
    })
    window.location.hash = ''
    setView('dashboard')
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

  const createAssessment = async (
    patientMode: Exclude<AssessmentPatientMode, null>
  ): Promise<void> => {
    setStartAssessmentPending(true)
    setStartAssessmentError(null)

    try {
      const session = await attachedApi.sessions.create()

      setActiveSessionId(session.id)
      setAssessmentPatientMode(patientMode)
      setStartAssessmentDialogOpen(false)
      handleNavigate('assessment')
      await refreshDashboard()
    } catch (error) {
      setStartAssessmentError(
        error instanceof Error ? error.message : 'Gagal membuat sesi asesmen.'
      )
    } finally {
      setStartAssessmentPending(false)
    }
  }

  const handleCreateNewAssessment = async (): Promise<void> => {
    await createAssessment('new')
  }

  const handleCreateExistingPatientAssessment = async (): Promise<void> => {
    await createAssessment('existing')
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
        clearAssessmentContext()
      }

      await refreshDashboard()
    },
    [activeSessionId, clearAssessmentContext, refreshDashboard]
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

  const handleReviewAccessRequest = async (input: ReviewAccessRequestInput): Promise<void> => {
    setAdminPending(true)
    setAdminError(null)

    try {
      const snapshot = await attachedApi.admin.reviewAccessRequest(input)
      setAdminSnapshot(snapshot)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Gagal memperbarui status akses.')
    } finally {
      setAdminPending(false)
    }
  }

  const handleAssessmentExit = (): void => {
    if (assessment.state.session && !isActiveSessionState(assessment.state.session.state)) {
      clearAssessmentContext()
    }

    handleNavigate('dashboard')
    void refreshDashboard()
  }

  const isDevelopmentModeEnabled =
    authSnapshot?.remoteAuth.debugAutoApprovalEnabled ?? defaultRemoteAuth.debugAutoApprovalEnabled

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
          remoteAuth={authSnapshot?.remoteAuth ?? defaultRemoteAuth}
          onAuthModeChange={handleAuthModeChange}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onRegistrationChange={(field, value) =>
            setRegistration((current) => ({ ...current, [field]: value }))
          }
          onRegistrationDocumentChange={handleRegistrationDocumentChange}
          onSignIn={() => void handleSignIn()}
          onSubmitAccessRequest={() => void handleSubmitAccessRequest()}
          coverImageUrl={coverImageUrl}
          notice={authNotice}
          error={authError}
          isSubmitting={authPending}
        />
        {isDevelopmentModeEnabled ? <DevModeMarker /> : null}
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
          onExitAssessment={handleAssessmentExit}
        />
        {isDevelopmentModeEnabled ? <DevModeMarker /> : null}
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
        onSignOut={() => void handleSignOut()}
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
              void handleReviewAccessRequest({ userId, decision })
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
        onCreateNew={() => void handleCreateNewAssessment()}
        onSelectExisting={() => void handleCreateExistingPatientAssessment()}
      />
      {isDevelopmentModeEnabled ? <DevModeMarker /> : null}
    </main>
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
