import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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
import { CHANNELS } from '../shared/ipc'

const attachedApi = {
  auth: {
    getSnapshot: (): Promise<AuthSnapshot> => ipcRenderer.invoke(CHANNELS.getAuthSnapshot),
    signIn: (input: SignInInput): Promise<AuthSnapshot> =>
      ipcRenderer.invoke(CHANNELS.signIn, input),
    submitAccessRequest: (input: SubmitAccessRequestInput): Promise<SubmitAccessRequestResult> =>
      ipcRenderer.invoke(CHANNELS.submitAccessRequest, input),
    signOut: (): Promise<AuthSnapshot> => ipcRenderer.invoke(CHANNELS.signOut),
    resetLocalData: (): Promise<AuthSnapshot> => ipcRenderer.invoke(CHANNELS.resetLocalData),
    updateProfile: (input: UpdatePsychologistProfileInput): Promise<AuthSnapshot> =>
      ipcRenderer.invoke(CHANNELS.updateProfile, input),
    updateEmail: (input: UpdateAccountEmailInput): Promise<AuthSnapshot> =>
      ipcRenderer.invoke(CHANNELS.updateEmail, input),
    changePassword: (input: ChangePasswordInput): Promise<AuthSnapshot> =>
      ipcRenderer.invoke(CHANNELS.changePassword, input)
  },
  admin: {
    getSnapshot: (): Promise<AdminSnapshot> => ipcRenderer.invoke(CHANNELS.getAdminSnapshot),
    reviewAccessRequest: (input: ReviewAccessRequestInput): Promise<AdminSnapshot> =>
      ipcRenderer.invoke(CHANNELS.reviewAccessRequest, input)
  },
  dashboard: {
    getSnapshot: (): Promise<DashboardSnapshot> => ipcRenderer.invoke(CHANNELS.getDashboard)
  },
  sessions: {
    list: (): Promise<SessionRecord[]> => ipcRenderer.invoke(CHANNELS.listSessions),
    create: (): Promise<SessionRecord> => ipcRenderer.invoke(CHANNELS.createSession),
    get: (sessionId: string): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.getSession, sessionId),
    abort: (sessionId: string): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.abortSession, sessionId),
    seedDebug: (sessionId: string): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.seedDebugSession, sessionId),
    updateIdentity: (sessionId: string, input: SessionIdentityInput): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.updateIdentity, sessionId, input),
    submitConsent: (input: SubmitConsentInput): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.submitConsent, input),
    revokeConsent: (sessionId: string): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.revokeConsent, sessionId),
    updateStep: (sessionId: string, step: SessionStep): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.updateStep, sessionId, step),
    saveArtifact: (input: SaveArtifactInput): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.saveArtifact, input),
    saveQuestionnaire: (input: SaveQuestionnaireInput): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.saveQuestionnaire, input)
  },
  inference: {
    start: (sessionId: string): Promise<InferenceStatus> =>
      ipcRenderer.invoke(CHANNELS.startInference, sessionId),
    getStatus: (sessionId: string): Promise<InferenceStatus> =>
      ipcRenderer.invoke(CHANNELS.getInferenceStatus, sessionId),
    submitFeedback: (input: SubmitResultFeedbackInput): Promise<SessionRecord> =>
      ipcRenderer.invoke(CHANNELS.submitResultFeedback, input)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('attached', attachedApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.attached = attachedApi
}
