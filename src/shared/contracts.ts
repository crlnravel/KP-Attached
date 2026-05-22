export const STIMULUS_COUNT = 14
export const QUESTION_COUNT = 36
export const QUESTION_SCALE_VALUES = [1, 2, 3, 4, 5, 6] as const
export const LOW_CONFIDENCE_THRESHOLD = 0.6
export const MAX_INFERENCE_ATTEMPTS = 3

export type SessionState =
  | 'draft'
  | 'ready_for_inference'
  | 'running_inference'
  | 'completed'
  | 'low_confidence'
  | 'failed'
  | 'aborted'

export type SessionStep =
  | 'identity'
  | 'consent'
  | 'preflight'
  | 'recording'
  | 'questionnaire'
  | 'review'
  | 'running'
  | 'result'

export type CaptureKind = 'exposure' | 'response' | 'audio'

export type InferenceStatusKind = 'idle' | 'running' | 'completed' | 'low_confidence' | 'failed'

export type EcrRsRelationScore = {
  relation: string
  anxious: number
  avoidance: number
}

export type PsychologistLicenseType =
  | 'licensed_psychologist'
  | 'licensed_psychological_associate'
  | 'licensed_specialist_in_school_psychology'
  | 'other'

export const VERIFICATION_DOCUMENT_KINDS = [
  'license',
  'npi',
  'education',
  'affiliation',
  'liability'
] as const

export type VerificationDocumentKind = (typeof VERIFICATION_DOCUMENT_KINDS)[number]

export type VerificationDocument = {
  fileName: string
  mimeType: string
  sizeBytes: number
  dataUrl: string
  uploadedAt: string
}

export type VerificationDocuments = Record<VerificationDocumentKind, VerificationDocument | null>

export function createEmptyVerificationDocuments(): VerificationDocuments {
  return {
    license: null,
    npi: null,
    education: null,
    affiliation: null,
    liability: null
  }
}

export type VerificationStatus = 'pending_admin_review' | 'verified' | 'rejected'

export type VerificationApprovalMode = 'admin_review' | 'development_auto'

export type PsychologistProfile = {
  legalName: string
  birthDate: string
  professionalPhone: string
  licenseType: PsychologistLicenseType
  licenseNumber: string
  licenseJurisdiction: string
  issuingBoard: string
  licenseIssuedAt: string
  licenseExpiresAt: string
  npiNumber: string
  doctoralDegree: string
  degreeInstitution: string
  degreeGraduationYear: string
  practiceOrganization: string
  practiceAddress: string
  specialtyArea: string
  avatarDataUrl: string
  documents: VerificationDocuments
}

export type UserVerification = {
  status: VerificationStatus
  approvalMode: VerificationApprovalMode
  submittedAt: string
  verifiedAt: string | null
}

export type LocalUser = {
  id: string
  username: string
  fullName: string
  role: 'admin' | 'psychologist'
  createdAt: string
  profile: PsychologistProfile
  verification: UserVerification
}

export type AdminUserSummary = {
  id: string
  username: string
  fullName: string
  role: LocalUser['role']
  createdAt: string
  profile: PsychologistProfile
  verification: UserVerification
}

export type AdminSnapshot = {
  currentUser: LocalUser
  users: AdminUserSummary[]
  summary: {
    pending: number
    verified: number
    rejected: number
  }
}

export type AuthSnapshot = {
  user: LocalUser | null
  knownUser: LocalUser | null
  initialized: boolean
  remoteAuth: {
    requestAccessEnabled: boolean
    approvalSyncEnabled: boolean
    debugAutoApprovalEnabled: boolean
  }
}

export type AuthFormMode = 'sign_in' | 'request_access'

export type CaptureArtifact = {
  path: string
  mimeType: string
  recordedAt: string
  sha256?: string
}

export type StimulusCaptureStatus = {
  slot: number
  exposure: CaptureArtifact | null
  response: CaptureArtifact | null
  audio: CaptureArtifact | null
}

export type ConsentStatus = 'not_given' | 'given' | 'revoked'

export type ConsentRecord = {
  status: ConsentStatus
  version: string
  statement: string
  givenAt: string | null
  revokedAt: string | null
}

export type SessionDraft = {
  participantId: string
  participantName: string
  age: string
  notes: string
  questionnaireAnswers: Array<number | null>
  captures: StimulusCaptureStatus[]
  consent: ConsentRecord
  step: SessionStep
  createdAt: string
  updatedAt: string
  recordingsDeletedAt: string | null
}

export type ResultFeedback = {
  verdict: 'correct' | 'incorrect'
  correctedLabel: 'secure' | 'insecure' | null
  submittedAt: string
}

export type InferenceResult = {
  label: 'secure' | 'insecure'
  labelId: 0 | 1
  confidence: number
  lowConfidence: boolean
  lowConfidenceThreshold: number
  modelVersion: string
  inferenceDurationMs: number
  attemptCount: number
  completedAt: string
  ecrRsScores: EcrRsRelationScore[]
  feedback: ResultFeedback | null
  probabilities: {
    secure: number
    insecure: number
  }
  output: {
    predictionsCsv: string
    summaryJson: string
    outputRoot: string
  }
}

export type SessionRecord = {
  id: string
  state: SessionState
  startedAt: string
  updatedAt: string
  completedAt: string | null
  failureMessage: string | null
  draft: SessionDraft
  result: InferenceResult | null
}

export type DashboardSnapshot = {
  user: LocalUser
  modelRuntimeReady: boolean
  summary: {
    totalSessions: number
    completedSessions: number
    lowConfidenceSessions: number
    failedSessions: number
    pendingSessions: number
  }
  sessions: SessionRecord[]
}

export type InferenceStatus = {
  sessionId: string
  status: InferenceStatusKind
  stage: string
  progress: number
  attempts: number
  maxAttempts: number
  startedAt: string | null
  completedAt: string | null
  error: string | null
  logs: string[]
}

export type SignInInput = {
  username: string
  password: string
}

export type SubmitAccessRequestInput = {
  username: string
  password: string
  registration: PsychologistRegistrationInput
}

export type SubmitAccessRequestResult = {
  snapshot: AuthSnapshot
  status: VerificationStatus
  message: string
}

export type PsychologistRegistrationInput = {
  legalName: string
  professionalPhone: string
  licenseType: PsychologistLicenseType
  licenseNumber: string
  licenseJurisdiction: string
  issuingBoard: string
  licenseIssuedAt: string
  licenseExpiresAt: string
  npiNumber: string
  doctoralDegree: string
  degreeInstitution: string
  degreeGraduationYear: string
  practiceOrganization: string
  practiceAddress: string
  specialtyArea: string
  documents: VerificationDocuments
}

export type UpdatePsychologistProfileInput = {
  legalName: string
  birthDate: string
  professionalPhone: string
  practiceOrganization: string
  practiceAddress: string
  specialtyArea: string
  avatarDataUrl: string
}

export type UpdateAccountEmailInput = {
  username: string
}

export type ChangePasswordInput = {
  currentPassword: string
  newPassword: string
}

export type SessionIdentityInput = {
  participantId: string
  participantName: string
  age: string
  notes: string
}

export type SaveArtifactInput = {
  sessionId: string
  slot: number
  kind: CaptureKind
  mimeType: string
  data: ArrayBuffer
}

export type SaveQuestionnaireInput = {
  sessionId: string
  answers: number[]
}

export type SubmitConsentInput = {
  sessionId: string
  accepted: boolean
}

export type ReviewAccessRequestInput = {
  userId: string
  decision: 'approved' | 'rejected'
}

export type SubmitResultFeedbackInput = {
  sessionId: string
  verdict: ResultFeedback['verdict']
  correctedLabel?: 'secure' | 'insecure' | null
}
