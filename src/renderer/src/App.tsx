import { useCallback, useEffect, useState } from 'react'
import { Code2Icon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { AppShell } from '@/components/app-shell'
import {
  navigateToView,
  parseAuthenticatedView,
  type AuthenticatedView
} from '@/components/app-shared'
import { AssessmentView } from '@/features/assessment/assessment-view'
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
  const activeSession =
    dashboardSnapshot?.sessions.find((session) => isActiveSessionState(session.state)) ?? null
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
      handleNavigate('assessment')
      return
    }

    void attachedApi.sessions
      .create()
      .then((session) => {
        setActiveSessionId(session.id)
        handleNavigate('assessment')
        return refreshDashboard()
      })
      .catch((error) => {
        setDashboardError(error instanceof Error ? error.message : 'Gagal membuat sesi asesmen.')
      })
  }

  const handleOpenSession = (sessionId: string): void => {
    setActiveSessionId(sessionId)
    handleNavigate('assessment')
  }

  const handleAbortSession = useCallback(
    async (sessionId: string): Promise<void> => {
      await attachedApi.sessions.abort(sessionId)
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
      }
      await refreshDashboard()
    },
    [activeSessionId, refreshDashboard]
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
          onExitAssessment={() => {
            if (assessment.state.session && !isActiveSessionState(assessment.state.session.state)) {
              setActiveSessionId(null)
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
      {authSnapshot.remoteAuth.debugAutoApprovalEnabled ? <DevModeMarker /> : null}
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
