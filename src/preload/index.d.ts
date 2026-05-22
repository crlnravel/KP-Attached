import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AdminSnapshot,
  AuthSnapshot,
  ChangePasswordInput,
  DashboardSnapshot,
  InferenceStatus,
  ReviewAccessRequestInput,
  SubmitResultFeedbackInput,
  UpdateAccountEmailInput,
  UpdatePsychologistProfileInput,
  SaveArtifactInput,
  SaveQuestionnaireInput,
  SessionIdentityInput,
  SessionRecord,
  SessionStep,
  SignInInput,
  SubmitConsentInput,
  SubmitAccessRequestInput,
  SubmitAccessRequestResult
} from '../shared/contracts'

type AttachedApi = {
  auth: {
    getSnapshot: () => Promise<AuthSnapshot>
    signIn: (input: SignInInput) => Promise<AuthSnapshot>
    submitAccessRequest: (input: SubmitAccessRequestInput) => Promise<SubmitAccessRequestResult>
    signOut: () => Promise<AuthSnapshot>
    resetLocalData: () => Promise<AuthSnapshot>
    updateProfile: (input: UpdatePsychologistProfileInput) => Promise<AuthSnapshot>
    updateEmail: (input: UpdateAccountEmailInput) => Promise<AuthSnapshot>
    changePassword: (input: ChangePasswordInput) => Promise<AuthSnapshot>
  }
  admin: {
    getSnapshot: () => Promise<AdminSnapshot>
    reviewAccessRequest: (input: ReviewAccessRequestInput) => Promise<AdminSnapshot>
  }
  dashboard: {
    getSnapshot: () => Promise<DashboardSnapshot>
  }
  sessions: {
    list: () => Promise<SessionRecord[]>
    create: () => Promise<SessionRecord>
    get: (sessionId: string) => Promise<SessionRecord>
    abort: (sessionId: string) => Promise<SessionRecord>
    seedDebug: (sessionId: string) => Promise<SessionRecord>
    updateIdentity: (sessionId: string, input: SessionIdentityInput) => Promise<SessionRecord>
    submitConsent: (input: SubmitConsentInput) => Promise<SessionRecord>
    revokeConsent: (sessionId: string) => Promise<SessionRecord>
    updateStep: (sessionId: string, step: SessionStep) => Promise<SessionRecord>
    saveArtifact: (input: SaveArtifactInput) => Promise<SessionRecord>
    saveQuestionnaire: (input: SaveQuestionnaireInput) => Promise<SessionRecord>
  }
  inference: {
    start: (sessionId: string) => Promise<InferenceStatus>
    getStatus: (sessionId: string) => Promise<InferenceStatus>
    submitFeedback: (input: SubmitResultFeedbackInput) => Promise<SessionRecord>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    attached: AttachedApi
  }
}
