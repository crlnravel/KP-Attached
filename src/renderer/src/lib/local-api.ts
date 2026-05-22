import type {
  AdminSnapshot,
  AuthSnapshot,
  ChangePasswordInput,
  DashboardSnapshot,
  InferenceStatus,
  ReviewAccessRequestInput,
  SaveArtifactInput,
  SaveQuestionnaireInput,
  SessionIdentityInput,
  SessionRecord,
  SessionStep,
  SignInInput,
  SubmitConsentInput,
  SubmitResultFeedbackInput,
  SubmitAccessRequestInput,
  SubmitAccessRequestResult,
  UpdateAccountEmailInput,
  UpdatePsychologistProfileInput
} from '../../../shared/contracts'
export { createEmptyVerificationDocuments } from '../../../shared/contracts'

export const attachedApi = {
  auth: {
    getSnapshot: (): Promise<AuthSnapshot> => window.attached.auth.getSnapshot(),
    signIn: (input: SignInInput): Promise<AuthSnapshot> => window.attached.auth.signIn(input),
    submitAccessRequest: (input: SubmitAccessRequestInput): Promise<SubmitAccessRequestResult> =>
      window.attached.auth.submitAccessRequest(input),
    signOut: (): Promise<AuthSnapshot> => window.attached.auth.signOut(),
    resetLocalData: (): Promise<AuthSnapshot> => window.attached.auth.resetLocalData(),
    updateProfile: (input: UpdatePsychologistProfileInput): Promise<AuthSnapshot> =>
      window.attached.auth.updateProfile(input),
    updateEmail: (input: UpdateAccountEmailInput): Promise<AuthSnapshot> =>
      window.attached.auth.updateEmail(input),
    changePassword: (input: ChangePasswordInput): Promise<AuthSnapshot> =>
      window.attached.auth.changePassword(input)
  },
  admin: {
    getSnapshot: (): Promise<AdminSnapshot> => window.attached.admin.getSnapshot(),
    reviewAccessRequest: (input: ReviewAccessRequestInput): Promise<AdminSnapshot> =>
      window.attached.admin.reviewAccessRequest(input)
  },
  dashboard: {
    getSnapshot: (): Promise<DashboardSnapshot> => window.attached.dashboard.getSnapshot()
  },
  sessions: {
    list: (): Promise<SessionRecord[]> => window.attached.sessions.list(),
    create: (): Promise<SessionRecord> => window.attached.sessions.create(),
    get: (sessionId: string): Promise<SessionRecord> => window.attached.sessions.get(sessionId),
    abort: (sessionId: string): Promise<SessionRecord> => window.attached.sessions.abort(sessionId),
    seedDebug: (sessionId: string): Promise<SessionRecord> =>
      window.attached.sessions.seedDebug(sessionId),
    updateIdentity: (sessionId: string, input: SessionIdentityInput): Promise<SessionRecord> =>
      window.attached.sessions.updateIdentity(sessionId, input),
    submitConsent: (input: SubmitConsentInput): Promise<SessionRecord> =>
      window.attached.sessions.submitConsent(input),
    revokeConsent: (sessionId: string): Promise<SessionRecord> =>
      window.attached.sessions.revokeConsent(sessionId),
    updateStep: (sessionId: string, step: SessionStep): Promise<SessionRecord> =>
      window.attached.sessions.updateStep(sessionId, step),
    saveArtifact: (input: SaveArtifactInput): Promise<SessionRecord> =>
      window.attached.sessions.saveArtifact(input),
    saveQuestionnaire: (input: SaveQuestionnaireInput): Promise<SessionRecord> =>
      window.attached.sessions.saveQuestionnaire(input)
  },
  inference: {
    start: (sessionId: string): Promise<InferenceStatus> =>
      window.attached.inference.start(sessionId),
    getStatus: (sessionId: string): Promise<InferenceStatus> =>
      window.attached.inference.getStatus(sessionId),
    submitFeedback: (input: SubmitResultFeedbackInput): Promise<SessionRecord> =>
      window.attached.inference.submitFeedback(input)
  }
}

export type {
  AdminSnapshot,
  AuthSnapshot,
  ChangePasswordInput,
  DashboardSnapshot,
  InferenceStatus,
  LocalUser,
  AuthFormMode,
  PsychologistRegistrationInput,
  ReviewAccessRequestInput,
  SessionRecord,
  SessionStep,
  SubmitConsentInput,
  SubmitAccessRequestResult,
  UpdateAccountEmailInput,
  UpdatePsychologistProfileInput,
  VerificationDocument,
  VerificationDocumentKind
} from '../../../shared/contracts'
