import { useCallback, useEffect, useMemo, useReducer, type SetStateAction } from 'react'

import {
  navigateToView,
  parseAuthenticatedView,
  type AuthenticatedView
} from '@/components/app-shared'
import {
  ACCESS_REQUEST_EXIT_WARNING,
  createEmptyRegistration,
  createRegistrationFromSnapshotUser,
  formatAppError,
  hasAccessRequestProgress,
  type AssessmentPatientMode
} from '@/features/app/app-flow'
import { useAssessmentController } from '@/features/assessment/use-assessment-controller'
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

export const defaultRemoteAuth: AuthSnapshot['remoteAuth'] = {
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

type AppState = {
  view: AuthenticatedView
  authSnapshot: AuthSnapshot | null
  dashboardSnapshot: DashboardSnapshot | null
  adminSnapshot: AdminSnapshot | null
  dashboardError: string | null
  adminError: string | null
  authError: string | null
  loading: boolean
  authPending: boolean
  dashboardPending: boolean
  adminPending: boolean
  email: string
  password: string
  registration: PsychologistRegistrationInput
  authMode: AuthFormMode
  authNotice: AuthNotice
  activeSessionId: string | null
  assessmentPatientMode: AssessmentPatientMode
  startAssessmentDialogOpen: boolean
  startAssessmentPending: boolean
  startAssessmentError: string | null
}

type AppAction = {
  type: 'set'
  key: keyof AppState
  value: unknown | ((current: unknown) => unknown)
}

function createInitialAppState(): AppState {
  return {
    view: parseAuthenticatedView(window.location.hash),
    authSnapshot: null,
    dashboardSnapshot: null,
    adminSnapshot: null,
    dashboardError: null,
    adminError: null,
    authError: null,
    loading: true,
    authPending: false,
    dashboardPending: false,
    adminPending: false,
    email: '',
    password: '',
    registration: createEmptyRegistration(),
    authMode: 'request_access',
    authNotice: null,
    activeSessionId: null,
    assessmentPatientMode: null,
    startAssessmentDialogOpen: false,
    startAssessmentPending: false,
    startAssessmentError: null
  }
}

function appReducer(state: AppState, action: AppAction): AppState {
  const currentValue = state[action.key]
  const nextValue = typeof action.value === 'function' ? action.value(currentValue) : action.value

  return { ...state, [action.key]: nextValue } as AppState
}

function useAppState() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState)

  const setField = useCallback(
    <K extends keyof AppState>(key: K, value: SetStateAction<AppState[K]>): void => {
      dispatch({
        type: 'set',
        key,
        value: value as unknown as AppAction['value']
      })
    },
    []
  )

  const setters = useMemo(
    () => ({
      setView: (value: SetStateAction<AuthenticatedView>) => setField('view', value),
      setAuthSnapshot: (value: SetStateAction<AuthSnapshot | null>) =>
        setField('authSnapshot', value),
      setDashboardSnapshot: (value: SetStateAction<DashboardSnapshot | null>) =>
        setField('dashboardSnapshot', value),
      setAdminSnapshot: (value: SetStateAction<AdminSnapshot | null>) =>
        setField('adminSnapshot', value),
      setDashboardError: (value: SetStateAction<string | null>) =>
        setField('dashboardError', value),
      setAdminError: (value: SetStateAction<string | null>) => setField('adminError', value),
      setAuthError: (value: SetStateAction<string | null>) => setField('authError', value),
      setLoading: (value: SetStateAction<boolean>) => setField('loading', value),
      setAuthPending: (value: SetStateAction<boolean>) => setField('authPending', value),
      setDashboardPending: (value: SetStateAction<boolean>) => setField('dashboardPending', value),
      setAdminPending: (value: SetStateAction<boolean>) => setField('adminPending', value),
      setEmail: (value: SetStateAction<string>) => setField('email', value),
      setPassword: (value: SetStateAction<string>) => setField('password', value),
      setRegistration: (value: SetStateAction<PsychologistRegistrationInput>) =>
        setField('registration', value),
      setAuthMode: (value: SetStateAction<AuthFormMode>) => setField('authMode', value),
      setAuthNotice: (value: SetStateAction<AuthNotice>) => setField('authNotice', value),
      setActiveSessionId: (value: SetStateAction<string | null>) =>
        setField('activeSessionId', value),
      setAssessmentPatientMode: (value: SetStateAction<AssessmentPatientMode>) =>
        setField('assessmentPatientMode', value),
      setStartAssessmentDialogOpen: (value: SetStateAction<boolean>) =>
        setField('startAssessmentDialogOpen', value),
      setStartAssessmentPending: (value: SetStateAction<boolean>) =>
        setField('startAssessmentPending', value),
      setStartAssessmentError: (value: SetStateAction<string | null>) =>
        setField('startAssessmentError', value)
    }),
    [setField]
  )

  return { ...state, ...setters }
}

export function useAppController() {
  const {
    view,
    setView,
    authSnapshot,
    setAuthSnapshot,
    dashboardSnapshot,
    setDashboardSnapshot,
    adminSnapshot,
    setAdminSnapshot,
    dashboardError,
    setDashboardError,
    adminError,
    setAdminError,
    authError,
    setAuthError,
    loading,
    setLoading,
    authPending,
    setAuthPending,
    dashboardPending,
    setDashboardPending,
    adminPending,
    setAdminPending,
    email,
    setEmail,
    password,
    setPassword,
    registration,
    setRegistration,
    authMode,
    setAuthMode,
    authNotice,
    setAuthNotice,
    activeSessionId,
    setActiveSessionId,
    assessmentPatientMode,
    setAssessmentPatientMode,
    startAssessmentDialogOpen,
    setStartAssessmentDialogOpen,
    startAssessmentPending,
    setStartAssessmentPending,
    startAssessmentError,
    setStartAssessmentError
  } = useAppState()

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

  const applyAuthSnapshot = useCallback(
    (snapshot: AuthSnapshot): void => {
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
    },
    [setAuthSnapshot, setEmail, setRegistration, setDashboardSnapshot]
  )

  const handleNavigate = useCallback(
    (nextView: AuthenticatedView): void => {
      navigateToView(nextView)
      setView(nextView)
    },
    [setView]
  )

  const clearAssessmentContext = useCallback((): void => {
    setActiveSessionId(null)
    setAssessmentPatientMode(null)
  }, [setActiveSessionId, setAssessmentPatientMode])

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
  }, [authSnapshot?.user, setDashboardPending, setDashboardSnapshot, setDashboardError])

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
  }, [authSnapshot?.user, setAdminPending, setAdminSnapshot, setAdminError])

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
  }, [
    applyAuthSnapshot,
    handleNavigate,
    setAuthMode,
    setAdminSnapshot,
    setAdminError,
    setDashboardSnapshot,
    setDashboardError,
    setAuthError,
    setLoading
  ])

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
  }, [authSnapshot?.user, setView])

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
  }, [assessment.state.session, setDashboardSnapshot])

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
    [refreshDashboard, setDashboardSnapshot]
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

  return {
    view,
    authSnapshot,
    dashboardSnapshot,
    adminSnapshot,
    dashboardError,
    adminError,
    authError,
    loading,
    authPending,
    dashboardPending,
    adminPending,
    email,
    password,
    registration,
    authMode,
    authNotice,
    assessmentPatientMode,
    startAssessmentDialogOpen,
    startAssessmentPending,
    startAssessmentError,
    patientChoices,
    startAssessmentDisabled,
    assessment,
    setEmail,
    setPassword,
    setRegistration,
    setStartAssessmentDialogOpen,
    handleNavigate,
    handleAuthModeChange,
    handleRegistrationDocumentChange,
    handleSignIn,
    handleSubmitAccessRequest,
    handleUpdateProfile,
    handleUpdateEmail,
    handleChangePassword,
    handleSignOut,
    handleResetLocalData,
    handleStartAssessment,
    handleCreateNewAssessment,
    handleCreateExistingPatientAssessment,
    handleOpenSession,
    handleAbortSession,
    handleDeleteSessionRecordings,
    handleSavePostAssessmentNote,
    handleReviewAccessRequest,
    handleAssessmentExit,
    isDevelopmentModeEnabled
  }
}
