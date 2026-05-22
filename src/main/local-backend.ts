import { app, ipcMain } from 'electron'
import { createHash, randomUUID, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

import type {
  AdminSnapshot,
  AdminUserSummary,
  AuthSnapshot,
  ChangePasswordInput,
  CaptureArtifact,
  CaptureKind,
  ConsentRecord,
  DashboardSnapshot,
  InferenceResult,
  InferenceStatus,
  InferenceStatusKind,
  LocalUser,
  PsychologistProfile,
  PsychologistRegistrationInput,
  PsychologistLicenseType,
  ReviewAccessRequestInput,
  SaveArtifactInput,
  SaveQuestionnaireInput,
  SessionDraft,
  SessionIdentityInput,
  SessionRecord,
  SessionState,
  SessionStep,
  SignInInput,
  SubmitConsentInput,
  SubmitResultFeedbackInput,
  SubmitAccessRequestInput,
  SubmitAccessRequestResult,
  StimulusCaptureStatus,
  UpdateAccountEmailInput,
  UpdatePsychologistProfileInput,
  UserVerification
} from '../shared/contracts'
import {
  createEmptyVerificationDocuments,
  LOW_CONFIDENCE_THRESHOLD,
  MAX_INFERENCE_ATTEMPTS,
  QUESTION_COUNT,
  QUESTION_SCALE_VALUES,
  STIMULUS_COUNT
} from '../shared/contracts'
import {
  getRemoteAuthCapabilities,
  submitRemoteAccessRequest,
  syncRemoteApprovalStatus
} from './remote-auth'
import { APP_DEBUG } from '../shared/debug'
import { CHANNELS } from '../shared/ipc'

type SessionRow = {
  id: string
  user_id: string | null
  state: string
  started_at: string
  updated_at: string
  completed_at: string | null
  failure_message: string | null
  draft_json: string
  result_json: string | null
}

type UserRow = {
  id: string
  username: string
  full_name: string
  password_salt: string
  password_hash: string
  created_at: string
  role: LocalUser['role']
  profile_json: string | null
  verification_json: string | null
}

type InferenceJob = InferenceStatus & {
  outputRoot: string
}

const ATTACHMENT_EXPERIMENT = 'rerunacc6522b22_evaq'
const MODEL_VERSION = 'v1.0'
const CONSENT_VERSION = 'local-consent-v1'
const CONSENT_STATEMENT =
  'ATTACHED adalah sistem pendukung keputusan klinis yang membantu psikolog meninjau indikasi Attachment Style dari respons multimodal peserta. Dalam sesi ini, peserta akan melihat rangkaian stimulus gambar, memberikan respons verbal, dan mengisi kuesioner ECR-RS. Aplikasi akan merekam respons video, respons audio, serta jawaban kuesioner untuk diproses oleh pipeline analisis lokal pada perangkat ini. Peserta memahami bahwa keluaran ATTACHED digunakan sebagai bahan pertimbangan klinis, bukan diagnosis otomatis dan bukan pengganti penilaian profesional psikolog.'
const LOCAL_ADMIN_EMAIL = normalizeUsername(
  process.env.ATTACHED_ADMIN_EMAIL ?? 'admin@attached.local'
)
const LOCAL_ADMIN_PASSWORD = process.env.ATTACHED_ADMIN_PASSWORD ?? 'admin12345'
const ACTIVE_SESSION_STATES: SessionState[] = ['draft', 'ready_for_inference', 'running_inference']
const SESSION_RETENTION_MS = 365 * 24 * 60 * 60 * 1000
const SMOKE_TEST_MODE = process.env.ATTACHED_SMOKE_TEST === '1'
const ECR_RS_RELATIONS = ['Ibu', 'Ayah', 'Pasangan', 'Teman dekat'] as const
const DEBUG_SAMPLE_IDENTITY: SessionIdentityInput = {
  participantId: 'DEBUG-001',
  participantName: 'Peserta Uji',
  age: '29',
  notes: 'Sesi uji otomatis dari contoh raw lokal.'
}

function nowIso(): string {
  return new Date().toISOString()
}

function resolveCompletedSessionState(session: SessionRecord): SessionState {
  return session.result?.lowConfidence ? 'low_confidence' : 'completed'
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function sanitizeSubjectName(sessionId: string): string {
  return sessionId.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function createEmptyCaptures(): StimulusCaptureStatus[] {
  return Array.from({ length: STIMULUS_COUNT }, (_, index) => ({
    slot: index + 1,
    exposure: null,
    response: null,
    audio: null
  }))
}

function createEmptyConsent(): ConsentRecord {
  return {
    status: 'not_given',
    version: CONSENT_VERSION,
    statement: CONSENT_STATEMENT,
    givenAt: null,
    revokedAt: null
  }
}

function createEmptyDraft(): SessionDraft {
  const timestamp = nowIso()
  return {
    participantId: '',
    participantName: '',
    age: '',
    notes: '',
    questionnaireAnswers: Array.from({ length: QUESTION_COUNT }, () => null),
    captures: createEmptyCaptures(),
    consent: createEmptyConsent(),
    step: 'identity',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createDebugQuestionnaireAnswers(): number[] {
  return Array.from(
    { length: QUESTION_COUNT },
    (_, index) => QUESTION_SCALE_VALUES[index % QUESTION_SCALE_VALUES.length]
  )
}

function hasAnyCapturedArtifact(draft: SessionDraft): boolean {
  return draft.captures.some((capture) => capture.exposure || capture.response || capture.audio)
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

function calculateEcrRsScores(
  answers: Array<number | null>
): Array<{ relation: string; anxious: number; avoidance: number }> {
  const scaleMin = QUESTION_SCALE_VALUES[0]
  const scaleMax = QUESTION_SCALE_VALUES[QUESTION_SCALE_VALUES.length - 1]
  const reverse = (score: number): number => scaleMin + scaleMax - score

  return ECR_RS_RELATIONS.map((relation, relationIndex) => {
    const baseIndex = relationIndex * 9
    const relationAnswers = answers.slice(baseIndex, baseIndex + 9)
    if (relationAnswers.some((value): value is null => typeof value !== 'number')) {
      return { relation, anxious: 0, avoidance: 0 }
    }

    const numericAnswers = relationAnswers as number[]
    const avoidanceItems = [
      reverse(numericAnswers[0]),
      reverse(numericAnswers[1]),
      reverse(numericAnswers[2]),
      reverse(numericAnswers[3]),
      numericAnswers[4],
      numericAnswers[5]
    ]
    const anxiousItems = [numericAnswers[6], numericAnswers[7], numericAnswers[8]]

    return {
      relation,
      anxious: roundToTwoDecimals(
        anxiousItems.reduce((sum, value) => sum + value, 0) / anxiousItems.length
      ),
      avoidance: roundToTwoDecimals(
        avoidanceItems.reduce((sum, value) => sum + value, 0) / avoidanceItems.length
      )
    }
  })
}

function firstExistingPath(candidates: string[]): string | null {
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function serializeDraft(draft: SessionDraft): string {
  return JSON.stringify(draft)
}

function normalizeConsent(value: Partial<ConsentRecord> | null | undefined): ConsentRecord {
  const fallback = createEmptyConsent()
  if (!value) {
    return fallback
  }

  return {
    status:
      value.status === 'given' || value.status === 'revoked' || value.status === 'not_given'
        ? value.status
        : fallback.status,
    version: typeof value.version === 'string' ? value.version : fallback.version,
    statement: typeof value.statement === 'string' ? value.statement : fallback.statement,
    givenAt: typeof value.givenAt === 'string' ? value.givenAt : null,
    revokedAt: typeof value.revokedAt === 'string' ? value.revokedAt : null
  }
}

function parseDraft(value: string): SessionDraft {
  const parsed = JSON.parse(value) as SessionDraft
  return {
    ...parsed,
    consent: normalizeConsent(parsed.consent)
  }
}

function createDebugAudioBuffer(durationSeconds = 1, sampleRate = 16_000): Buffer {
  const samples = durationSeconds * sampleRate
  const buffer = Buffer.alloc(44 + samples * 2)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)

  for (let index = 0; index < samples; index += 1) {
    const tone = Math.sin((index / sampleRate) * Math.PI * 2 * 220)
    buffer.writeInt16LE(Math.round(tone * 0x1800), 44 + index * 2)
  }

  return buffer
}

function parseResult(value: string | null): InferenceResult | null {
  if (!value) {
    return null
  }

  const parsed = JSON.parse(value) as Partial<InferenceResult>
  return {
    label: parsed.label === 'insecure' ? 'insecure' : 'secure',
    labelId: parsed.labelId === 1 ? 1 : 0,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    lowConfidence: Boolean(parsed.lowConfidence),
    lowConfidenceThreshold:
      typeof parsed.lowConfidenceThreshold === 'number'
        ? parsed.lowConfidenceThreshold
        : LOW_CONFIDENCE_THRESHOLD,
    modelVersion: typeof parsed.modelVersion === 'string' ? parsed.modelVersion : MODEL_VERSION,
    inferenceDurationMs:
      typeof parsed.inferenceDurationMs === 'number' ? parsed.inferenceDurationMs : 0,
    attemptCount: typeof parsed.attemptCount === 'number' ? parsed.attemptCount : 1,
    completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : nowIso(),
    ecrRsScores: Array.isArray(parsed.ecrRsScores) ? parsed.ecrRsScores : [],
    feedback:
      parsed.feedback?.verdict === 'correct' || parsed.feedback?.verdict === 'incorrect'
        ? {
            verdict: parsed.feedback.verdict,
            correctedLabel:
              parsed.feedback.correctedLabel === 'secure' ||
              parsed.feedback.correctedLabel === 'insecure'
                ? parsed.feedback.correctedLabel
                : null,
            submittedAt:
              typeof parsed.feedback.submittedAt === 'string'
                ? parsed.feedback.submittedAt
                : nowIso()
          }
        : null,
    probabilities: {
      secure: typeof parsed.probabilities?.secure === 'number' ? parsed.probabilities.secure : 0,
      insecure:
        typeof parsed.probabilities?.insecure === 'number' ? parsed.probabilities.insecure : 0
    },
    output: {
      predictionsCsv: parsed.output?.predictionsCsv ?? '',
      summaryJson: parsed.output?.summaryJson ?? '',
      outputRoot: parsed.output?.outputRoot ?? ''
    }
  }
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  if (actual.length !== expected.length) {
    return false
  }
  return timingSafeEqual(actual, expected)
}

const psychologistLicenseTypes = new Set<PsychologistLicenseType>([
  'licensed_psychologist',
  'licensed_psychological_associate',
  'licensed_specialist_in_school_psychology',
  'other'
])

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isIndonesianPhoneLike(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return (
    digits.length >= 9 && digits.length <= 15 && (digits.startsWith('62') || digits.startsWith('0'))
  )
}

function isCredentialReferenceLike(value: string): boolean {
  const trimmed = value.trim()
  const compact = trimmed.replace(/[^A-Za-z0-9]/g, '')
  return compact.length >= 4 && /^[A-Za-z0-9][A-Za-z0-9 ./-]*$/.test(trimmed)
}

function isIsoDateLike(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return false
  }

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return (
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  )
}

function isFutureDate(value: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(value).getTime() > today.getTime()
}

function isFutureOrToday(value: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(value).getTime() >= today.getTime()
}

function isGraduationYearLike(value: string): boolean {
  if (!/^\d{4}$/.test(value)) {
    return false
  }

  const year = Number(value)
  return year >= 1950 && year <= new Date().getFullYear()
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`${label} wajib diisi.`)
  }
  return trimmed
}

function requirePassword(value: string, label = 'Kata sandi'): string {
  const trimmed = value.trim()
  if (trimmed.length < 8) {
    throw new Error(`${label} minimal 8 karakter.`)
  }
  return trimmed
}

function createLegacyPsychologistProfile(row: Pick<UserRow, 'full_name'>): PsychologistProfile {
  return {
    legalName: row.full_name,
    birthDate: '',
    professionalPhone: '',
    licenseType: 'other',
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
    avatarDataUrl: '',
    documents: createEmptyVerificationDocuments()
  }
}

function createRemoteSignInProfile(username: string): PsychologistProfile {
  const localName = username
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim()

  return {
    legalName: localName.length > 0 ? localName : username,
    birthDate: '',
    professionalPhone: '',
    licenseType: 'other',
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
    avatarDataUrl: '',
    documents: createEmptyVerificationDocuments()
  }
}

function createLocalAdminProfile(): PsychologistProfile {
  return {
    ...createLegacyPsychologistProfile({ full_name: 'Administrator Lokal' }),
    legalName: 'Administrator Lokal',
    professionalPhone: '081234567890',
    practiceOrganization: 'Attached Local Workstation',
    practiceAddress: 'Local workstation',
    specialtyArea: 'Administrasi akses'
  }
}

function createDevelopmentVerification(submittedAt: string): UserVerification {
  return {
    status: 'verified',
    approvalMode: 'development_auto',
    submittedAt,
    verifiedAt: submittedAt
  }
}

function createAdminReviewVerification(
  submittedAt: string,
  status: UserVerification['status'],
  verifiedAt: string | null
): UserVerification {
  return {
    status,
    approvalMode: 'admin_review',
    submittedAt,
    verifiedAt: status === 'verified' ? (verifiedAt ?? submittedAt) : null
  }
}

function parsePsychologistProfile(row: UserRow): PsychologistProfile {
  const fallback = createLegacyPsychologistProfile(row)

  if (!row.profile_json) {
    return fallback
  }

  try {
    const parsed = JSON.parse(row.profile_json) as Partial<PsychologistProfile>
    return {
      ...fallback,
      ...parsed,
      documents: {
        ...fallback.documents,
        ...parsed.documents
      }
    }
  } catch {
    return fallback
  }
}

function sanitizeVerificationDocuments(
  input: PsychologistRegistrationInput['documents'] | null | undefined
): PsychologistProfile['documents'] {
  const documents = {
    ...createEmptyVerificationDocuments(),
    ...(input ?? {})
  }
  const requiredDocuments: Array<[keyof PsychologistProfile['documents'], string]> = [
    ['license', 'Dokumen STR atau SSP'],
    ['npi', 'Dokumen SIPP/SIPPK atau rekomendasi HIMPSI'],
    ['education', 'Dokumen pendidikan profesi psikologi'],
    ['affiliation', 'Dokumen afiliasi praktik'],
    ['liability', 'Dokumen keanggotaan HIMPSI atau asosiasi']
  ]

  for (const [key, label] of requiredDocuments) {
    const document = documents[key]
    if (!document) {
      throw new Error(`${label} wajib diunggah.`)
    }

    if (!document.fileName.trim()) {
      throw new Error(`${label} harus memiliki nama berkas.`)
    }

    if (!document.dataUrl.startsWith('data:')) {
      throw new Error(`${label} harus diunggah sebagai PDF atau gambar.`)
    }

    if (!document.mimeType.startsWith('image/') && document.mimeType !== 'application/pdf') {
      throw new Error(`${label} harus berupa PDF atau gambar.`)
    }

    if (document.sizeBytes <= 0 || document.sizeBytes > 8_000_000) {
      throw new Error(`${label} harus lebih kecil dari 8 MB.`)
    }
  }

  return documents
}

function parseVerification(row: UserRow): UserVerification {
  if (!row.verification_json) {
    return createDevelopmentVerification(row.created_at)
  }

  try {
    return JSON.parse(row.verification_json) as UserVerification
  } catch {
    return createDevelopmentVerification(row.created_at)
  }
}

function sanitizeRegistrationInput(
  input: PsychologistRegistrationInput | null | undefined
): PsychologistProfile {
  if (!input) {
    throw new Error('Lengkapi formulir verifikasi psikolog Indonesia sebelum membuat akun.')
  }

  const legalName = requireNonEmpty(input.legalName, 'Nama legal')
  const professionalPhone = requireNonEmpty(input.professionalPhone, 'Nomor telepon profesional')
  const licenseType = input.licenseType
  const licenseNumber = requireNonEmpty(input.licenseNumber, 'Nomor STR / SSP')
  const licenseJurisdiction = requireNonEmpty(input.licenseJurisdiction, 'Wilayah HIMPSI')
  const issuingBoard = requireNonEmpty(input.issuingBoard, 'Lembaga penerbit')
  const licenseIssuedAt = requireNonEmpty(input.licenseIssuedAt, 'Tanggal terbit kredensial')
  const licenseExpiresAt = requireNonEmpty(input.licenseExpiresAt, 'Tanggal kedaluwarsa kredensial')
  const npiNumber = requireNonEmpty(input.npiNumber, 'Nomor SIPP / SIPPK')
  const doctoralDegree = requireNonEmpty(input.doctoralDegree, 'Gelar psikologi dasar')
  const degreeInstitution = requireNonEmpty(input.degreeInstitution, 'Institusi pendidikan')
  const degreeGraduationYear = requireNonEmpty(input.degreeGraduationYear, 'Tahun kelulusan')
  const practiceOrganization = requireNonEmpty(input.practiceOrganization, 'Organisasi praktik')
  const practiceAddress = requireNonEmpty(input.practiceAddress, 'Alamat praktik')
  const specialtyArea = requireNonEmpty(input.specialtyArea, 'Area kekhususan')
  const documents = sanitizeVerificationDocuments(input.documents)

  if (!psychologistLicenseTypes.has(licenseType)) {
    throw new Error('Pilih jenis kredensial psikolog Indonesia yang valid.')
  }

  if (legalName.length < 3) {
    throw new Error('Nama legal tampak belum lengkap.')
  }

  if (!isIndonesianPhoneLike(professionalPhone)) {
    throw new Error('Nomor telepon profesional harus berupa nomor Indonesia yang valid.')
  }

  if (!isCredentialReferenceLike(licenseNumber)) {
    throw new Error('Nomor STR/SSP tampak belum lengkap.')
  }

  if (!isCredentialReferenceLike(npiNumber)) {
    throw new Error('Nomor SIPP/SIPPK tampak belum lengkap.')
  }

  if (!isIsoDateLike(licenseIssuedAt) || !isIsoDateLike(licenseExpiresAt)) {
    throw new Error('Tanggal terbit dan kedaluwarsa kredensial harus valid.')
  }

  if (isFutureDate(licenseIssuedAt)) {
    throw new Error('Tanggal terbit kredensial tidak boleh di masa depan.')
  }

  if (new Date(licenseExpiresAt).getTime() < new Date(licenseIssuedAt).getTime()) {
    throw new Error('Tanggal kedaluwarsa kredensial tidak boleh sebelum tanggal terbit.')
  }

  if (!isFutureOrToday(licenseExpiresAt)) {
    throw new Error('Kredensial psikolog Indonesia yang masih aktif wajib digunakan.')
  }

  if (!isGraduationYearLike(degreeGraduationYear)) {
    throw new Error(`Tahun kelulusan harus antara 1950 dan ${new Date().getFullYear()}.`)
  }

  if (doctoralDegree.length < 2) {
    throw new Error('Gelar psikologi dasar tampak belum lengkap.')
  }

  if (degreeInstitution.length < 3) {
    throw new Error('Institusi pendidikan tampak belum lengkap.')
  }

  if (practiceOrganization.length < 3) {
    throw new Error('Organisasi praktik tampak belum lengkap.')
  }

  if (practiceAddress.length < 8) {
    throw new Error('Alamat praktik tampak belum lengkap.')
  }

  if (specialtyArea.length < 3) {
    throw new Error('Area kekhususan tampak belum lengkap.')
  }

  return {
    legalName,
    birthDate: '',
    professionalPhone,
    licenseType,
    licenseNumber,
    licenseJurisdiction,
    issuingBoard,
    licenseIssuedAt,
    licenseExpiresAt,
    npiNumber,
    doctoralDegree,
    degreeInstitution,
    degreeGraduationYear,
    practiceOrganization,
    practiceAddress,
    specialtyArea,
    avatarDataUrl: '',
    documents
  }
}

function sanitizeEditableProfileInput(
  input: UpdatePsychologistProfileInput,
  existingProfile: PsychologistProfile
): PsychologistProfile {
  const legalName = requireNonEmpty(input.legalName, 'Nama lengkap')
  const birthDate = input.birthDate.trim()
  const professionalPhone = input.professionalPhone.trim()
  const practiceOrganization = input.practiceOrganization.trim()
  const practiceAddress = input.practiceAddress.trim()
  const specialtyArea = input.specialtyArea.trim()
  const avatarDataUrl = input.avatarDataUrl.trim()

  if (birthDate.length > 0 && !isIsoDateLike(birthDate)) {
    throw new Error('Tanggal lahir harus valid.')
  }

  if (professionalPhone.length > 0 && professionalPhone.replace(/\D/g, '').length < 7) {
    throw new Error('Nomor telepon profesional tampak belum lengkap.')
  }

  if (avatarDataUrl.length > 0 && !avatarDataUrl.startsWith('data:image/')) {
    throw new Error('Foto profil harus berupa gambar.')
  }

  if (avatarDataUrl.length > 2_500_000) {
    throw new Error('Foto profil terlalu besar. Gunakan gambar di bawah 2 MB.')
  }

  return {
    ...existingProfile,
    legalName,
    birthDate,
    professionalPhone,
    practiceOrganization,
    practiceAddress,
    specialtyArea,
    avatarDataUrl
  }
}

function inferStatusFromSession(session: SessionRecord): InferenceStatusKind {
  switch (session.state) {
    case 'completed':
      return 'completed'
    case 'low_confidence':
      return 'low_confidence'
    case 'failed':
      return 'failed'
    case 'running_inference':
      return 'running'
    default:
      return 'idle'
  }
}

export class LocalBackend {
  private readonly dataRoot: string
  private readonly databasePath: string
  private readonly sessionsRoot: string
  private readonly recordingArtifactsRoot: string
  private readonly db: DatabaseSync
  private readonly projectRoot: string
  private readonly modelRoot: string
  private readonly jobs = new Map<string, InferenceJob>()
  private readonly runningProcesses = new Map<string, ChildProcessWithoutNullStreams>()
  private readonly abortRequested = new Set<string>()

  constructor() {
    this.projectRoot = this.resolveProjectRoot()
    this.modelRoot = join(this.projectRoot, 'data_model_KP')
    this.dataRoot = join(app.getPath('userData'), 'attached-local')
    this.databasePath = join(this.dataRoot, 'attached-local.db')
    this.sessionsRoot = join(this.dataRoot, 'sessions')
    this.recordingArtifactsRoot = join(this.projectRoot, 'web', 'artifacts', 'recordings')

    mkdirSync(this.dataRoot, { recursive: true })
    mkdirSync(this.sessionsRoot, { recursive: true })

    this.db = new DatabaseSync(this.databasePath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'psychologist',
        profile_json TEXT,
        verification_json TEXT
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        state TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        failure_message TEXT,
        draft_json TEXT NOT NULL,
        result_json TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        details_json TEXT
      );
    `)
    this.ensureUserSchema()
    this.ensureSessionSchema()
    this.ensureLocalAdminUser()
  }

  registerIpc(): void {
    this.registerHandler(CHANNELS.getAuthSnapshot, () => this.getAuthSnapshot())
    this.registerHandler(CHANNELS.signIn, (_event, input: SignInInput) => this.signIn(input))
    this.registerHandler(CHANNELS.submitAccessRequest, (_event, input: SubmitAccessRequestInput) =>
      this.submitAccessRequest(input)
    )
    this.registerHandler(CHANNELS.signOut, () => this.signOut())
    this.registerHandler(CHANNELS.resetLocalData, () => this.resetLocalData())
    this.registerHandler(CHANNELS.updateProfile, (_event, input: UpdatePsychologistProfileInput) =>
      this.updateProfile(input)
    )
    this.registerHandler(CHANNELS.updateEmail, (_event, input: UpdateAccountEmailInput) =>
      this.updateEmail(input)
    )
    this.registerHandler(CHANNELS.changePassword, (_event, input: ChangePasswordInput) =>
      this.changePassword(input)
    )
    this.registerHandler(CHANNELS.getAdminSnapshot, () => this.getAdminSnapshot())
    this.registerHandler(CHANNELS.reviewAccessRequest, (_event, input: ReviewAccessRequestInput) =>
      this.reviewAccessRequest(input)
    )
    this.registerHandler(CHANNELS.getDashboard, () => this.getDashboard())
    this.registerHandler(CHANNELS.listSessions, () => this.listSessions())
    this.registerHandler(CHANNELS.createSession, () => this.createSession())
    this.registerHandler(CHANNELS.getSession, (_event, sessionId: string) =>
      this.getSession(sessionId)
    )
    this.registerHandler(CHANNELS.abortSession, (_event, sessionId: string) =>
      this.abortSession(sessionId)
    )
    this.registerHandler(CHANNELS.seedDebugSession, (_event, sessionId: string) =>
      this.seedDebugSession(sessionId)
    )
    this.registerHandler(
      CHANNELS.updateIdentity,
      (_event, sessionId: string, input: SessionIdentityInput) =>
        this.updateSessionIdentity(sessionId, input)
    )
    this.registerHandler(CHANNELS.submitConsent, (_event, input: SubmitConsentInput) =>
      this.submitConsent(input)
    )
    this.registerHandler(CHANNELS.revokeConsent, (_event, sessionId: string) =>
      this.revokeConsent(sessionId)
    )
    this.registerHandler(CHANNELS.updateStep, (_event, sessionId: string, step: SessionStep) =>
      this.updateSessionStep(sessionId, step)
    )
    this.registerHandler(CHANNELS.saveArtifact, (_event, input: SaveArtifactInput) =>
      this.saveStimulusArtifact(input)
    )
    this.registerHandler(CHANNELS.saveQuestionnaire, (_event, input: SaveQuestionnaireInput) =>
      this.saveQuestionnaire(input)
    )
    this.registerHandler(CHANNELS.startInference, (_event, sessionId: string) =>
      this.startInference(sessionId)
    )
    this.registerHandler(CHANNELS.getInferenceStatus, (_event, sessionId: string) =>
      this.getInferenceStatus(sessionId)
    )
    this.registerHandler(
      CHANNELS.submitResultFeedback,
      (_event, input: SubmitResultFeedbackInput) => this.submitResultFeedback(input)
    )
  }

  dispose(): void {
    this.db.close()
  }

  async getAuthSnapshot(): Promise<AuthSnapshot> {
    return this.buildAuthSnapshot()
  }

  async signIn(input: SignInInput): Promise<AuthSnapshot> {
    const username = normalizeUsername(input.username)
    const password = requirePassword(input.password)

    if (username.length === 0) {
      throw new Error('Email dan kata sandi wajib diisi.')
    }

    const existingUser = this.findUserByUsername(username)
    if (existingUser) {
      if (!verifyPassword(password, existingUser.password_salt, existingUser.password_hash)) {
        throw new Error('Email atau kata sandi lokal tidak valid.')
      }

      const refreshedUser = await this.refreshVerificationStatus(existingUser, password)
      const verification = parseVerification(refreshedUser)
      const role = refreshedUser.role === 'admin' ? 'admin' : 'psychologist'

      if (role !== 'admin' && verification.status === 'pending_admin_review') {
        throw new Error(
          'Permintaan akses psikolog masih menunggu persetujuan admin. Coba masuk lagi setelah akun disetujui.'
        )
      }

      if (role !== 'admin' && verification.status === 'rejected') {
        throw new Error(
          'Permintaan akses psikolog ditolak. Perbarui detail verifikasi lalu kirim ulang.'
        )
      }

      this.setAppState('active_user_id', refreshedUser.id)
      this.writeAuditEvent('auth.sign_in', null, { username })
      return this.buildAuthSnapshot(this.mapUser(refreshedUser))
    }

    const remoteUser = await this.importRemoteApprovedUser(username, password)
    if (remoteUser) {
      this.setAppState('active_user_id', remoteUser.id)
      this.writeAuditEvent('auth.sign_in', null, { username, source: 'remote_import' })
      return this.buildAuthSnapshot(this.mapUser(remoteUser))
    }

    throw new Error('Tidak ada akun lokal dengan email tersebut. Ajukan akses sebelum masuk.')
  }

  async submitAccessRequest(input: SubmitAccessRequestInput): Promise<SubmitAccessRequestResult> {
    const username = normalizeUsername(input.username)
    const password = requirePassword(input.password)

    if (!isEmailLike(username)) {
      throw new Error('Email profesional wajib digunakan untuk mengirim permintaan akses psikolog.')
    }

    const existingUser = this.findUserByUsername(username)
    if (existingUser && parseVerification(existingUser).status === 'verified') {
      throw new Error('Akun ini sudah disetujui. Silakan masuk.')
    }

    const submittedAt = nowIso()
    const profile = sanitizeRegistrationInput(input.registration)
    let remoteResult: Awaited<ReturnType<typeof submitRemoteAccessRequest>> | null = null
    let verification: UserVerification

    const remoteAuth = getRemoteAuthCapabilities()

    if (remoteAuth.requestAccessEnabled) {
      remoteResult = await submitRemoteAccessRequest({
        username,
        password,
        profile,
        submittedAt
      })
      verification = createAdminReviewVerification(
        submittedAt,
        remoteResult.status,
        remoteResult.verifiedAt
      )
    } else {
      verification = createAdminReviewVerification(submittedAt, 'pending_admin_review', null)
    }

    const fullName = remoteResult?.fullName ?? profile.legalName

    const storedUser = this.upsertLocalUser({
      existingUser,
      username,
      password,
      createdAt: existingUser?.created_at ?? submittedAt,
      fullName,
      profile: remoteResult?.profile ?? profile,
      verification
    })
    this.deleteAppState('active_user_id')

    return {
      snapshot: this.buildAuthSnapshot(null, this.mapUser(storedUser)),
      status: verification.status,
      message:
        (APP_DEBUG ? null : remoteResult?.message) ??
        (verification.status === 'verified'
          ? 'Akun psikolog sudah disetujui. Silakan masuk.'
          : verification.status === 'rejected'
            ? 'Permintaan akses ditolak. Tinjau detail verifikasi lalu kirim ulang.'
            : 'Permintaan akses terkirim dan menunggu persetujuan admin.')
    }
  }

  async signOut(): Promise<AuthSnapshot> {
    const currentUserRow = this.getCurrentUserRow()
    this.archiveSignedOutUser(currentUserRow)
    this.writeAuditEvent('auth.sign_out')
    this.deleteAppState('active_user_id')
    return this.buildAuthSnapshot(null)
  }

  async resetLocalData(): Promise<AuthSnapshot> {
    for (const [sessionId, child] of this.runningProcesses.entries()) {
      try {
        if (!child.killed) {
          child.kill('SIGTERM')
        }
      } catch {
        // Best-effort shutdown only.
      }
      this.abortRequested.add(sessionId)
    }

    this.runningProcesses.clear()
    this.jobs.clear()
    this.abortRequested.clear()

    this.db.exec(`
      DELETE FROM sessions;
      DELETE FROM users;
      DELETE FROM app_state;
      DELETE FROM audit_events;
    `)
    this.ensureLocalAdminUser()

    await fs.rm(this.sessionsRoot, { recursive: true, force: true })
    await fs.mkdir(this.sessionsRoot, { recursive: true })

    return this.buildAuthSnapshot(null)
  }

  async getAdminSnapshot(): Promise<AdminSnapshot> {
    const adminRow = this.requireAdminUserRow()
    const users = this.listAdminUsers()
    return {
      currentUser: this.mapUser(adminRow),
      users,
      summary: {
        pending: users.filter((user) => user.verification.status === 'pending_admin_review').length,
        verified: users.filter((user) => user.verification.status === 'verified').length,
        rejected: users.filter((user) => user.verification.status === 'rejected').length
      }
    }
  }

  async reviewAccessRequest(input: ReviewAccessRequestInput): Promise<AdminSnapshot> {
    const adminRow = this.requireAdminUserRow()
    const target = this.findUserById(input.userId)

    if (!target || target.role === 'admin') {
      throw new Error('Akun psikolog tidak ditemukan.')
    }

    const currentVerification = parseVerification(target)
    const reviewedAt = nowIso()
    const nextVerification = createAdminReviewVerification(
      currentVerification.submittedAt,
      input.decision === 'approved' ? 'verified' : 'rejected',
      reviewedAt
    )

    this.db
      .prepare(`UPDATE users SET verification_json = ? WHERE id = ?`)
      .run(JSON.stringify(nextVerification), target.id)
    this.writeAuditEvent('admin.review_access_request', null, {
      adminId: adminRow.id,
      targetUserId: target.id,
      decision: input.decision
    })

    return this.getAdminSnapshot()
  }

  async updateProfile(input: UpdatePsychologistProfileInput): Promise<AuthSnapshot> {
    const userRow = this.requireCurrentUserRow()
    const currentProfile = parsePsychologistProfile(userRow)
    const nextProfile = sanitizeEditableProfileInput(input, currentProfile)

    this.db
      .prepare(`UPDATE users SET full_name = ?, profile_json = ? WHERE id = ?`)
      .run(nextProfile.legalName, JSON.stringify(nextProfile), userRow.id)

    return this.getAuthSnapshot()
  }

  async updateEmail(input: UpdateAccountEmailInput): Promise<AuthSnapshot> {
    const userRow = this.requireCurrentUserRow()
    const username = normalizeUsername(input.username)

    if (!isEmailLike(username)) {
      throw new Error('Masukkan email profesional yang valid.')
    }

    const existingUser = this.findUserByUsername(username)
    if (existingUser && existingUser.id !== userRow.id) {
      throw new Error('Email tersebut sudah digunakan akun lokal lain.')
    }

    this.db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(username, userRow.id)
    return this.getAuthSnapshot()
  }

  async changePassword(input: ChangePasswordInput): Promise<AuthSnapshot> {
    const userRow = this.requireCurrentUserRow()
    const currentPassword = input.currentPassword.trim()
    const newPassword = input.newPassword.trim()

    if (currentPassword.length === 0 || newPassword.length === 0) {
      throw new Error('Kata sandi saat ini dan kata sandi baru wajib diisi.')
    }

    if (!verifyPassword(currentPassword, userRow.password_salt, userRow.password_hash)) {
      throw new Error('Kata sandi saat ini salah.')
    }

    if (newPassword.length < 8) {
      throw new Error('Kata sandi baru minimal 8 karakter.')
    }

    const salt = randomBytes(16).toString('hex')
    const passwordHash = hashPassword(newPassword, salt)

    this.db
      .prepare(`UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?`)
      .run(salt, passwordHash, userRow.id)

    return this.getAuthSnapshot()
  }

  async getDashboard(): Promise<DashboardSnapshot> {
    const userRow = this.requirePsychologistUserRow()
    this.normalizeLegacyActiveSessions(userRow.id)
    await this.pruneExpiredSessions(userRow.id)
    const user = this.mapUser(userRow)
    const sessions = this.listSessionsInternal(userRow.id)
    return {
      user,
      modelRuntimeReady: this.modelRuntimeReady(),
      summary: {
        totalSessions: sessions.length,
        completedSessions: sessions.filter((session) => session.state === 'completed').length,
        lowConfidenceSessions: sessions.filter((session) => session.state === 'low_confidence')
          .length,
        failedSessions: sessions.filter((session) => session.state === 'failed').length,
        pendingSessions: sessions.filter((session) => ACTIVE_SESSION_STATES.includes(session.state))
          .length
      },
      sessions
    }
  }

  async listSessions(): Promise<SessionRecord[]> {
    const userRow = this.requirePsychologistUserRow()
    this.normalizeLegacyActiveSessions(userRow.id)
    await this.pruneExpiredSessions(userRow.id)
    return this.listSessionsInternal(userRow.id)
  }

  async createSession(): Promise<SessionRecord> {
    const userRow = this.requirePsychologistUserRow()
    this.normalizeLegacyActiveSessions(userRow.id)

    const activeSession = this.findActiveSessionOnWorkstation()
    if (activeSession) {
      const ownerHint =
        activeSession.user_id === userRow.id ? '' : ' pada akun psikolog lain di workstation ini'
      throw new Error(
        `Sesi asesmen masih aktif${ownerHint} (${activeSession.id}). Lanjutkan atau selesaikan sesi tersebut sebelum memulai sesi baru.`
      )
    }

    const timestamp = nowIso()
    const draft = createEmptyDraft()
    const sessionId = `SES-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`

    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, state, started_at, updated_at, completed_at, failure_message, draft_json, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        sessionId,
        userRow.id,
        'draft',
        timestamp,
        timestamp,
        null,
        null,
        serializeDraft(draft),
        null
      )

    await this.ensureSessionDirectories(sessionId)
    this.writeAuditEvent('session.create', sessionId, { state: 'draft' })
    return this.requireOwnedSession(sessionId)
  }

  async getSession(sessionId: string): Promise<SessionRecord> {
    return this.requireOwnedSession(sessionId)
  }

  async abortSession(sessionId: string): Promise<SessionRecord> {
    const session = this.requireOwnedSession(sessionId)
    if (!ACTIVE_SESSION_STATES.includes(session.state)) {
      throw new Error('Hanya sesi asesmen aktif yang bisa dibatalkan.')
    }

    const abortedAt = nowIso()
    session.draft.updatedAt = abortedAt
    if (!hasAnyCapturedArtifact(session.draft) && session.state === 'draft') {
      await this.deleteSessionRecord(sessionId)
      this.writeAuditEvent('session.discard_empty', sessionId, { reason: 'closed_before_stimulus' })
      return {
        ...session,
        state: 'aborted',
        updatedAt: abortedAt,
        completedAt: abortedAt,
        draft: session.draft,
        failureMessage: null
      }
    }

    this.persistSession(sessionId, 'aborted', session.draft, null, null, abortedAt)
    this.writeAuditEvent('session.abort', sessionId, { state: session.state })

    this.abortRequested.add(sessionId)

    const child = this.runningProcesses.get(sessionId)
    if (child && !child.killed) {
      try {
        child.kill('SIGTERM')
      } catch {
        // Best-effort termination only.
      }

      setTimeout(() => {
        const activeChild = this.runningProcesses.get(sessionId)
        if (activeChild === child && !child.killed) {
          try {
            child.kill('SIGKILL')
          } catch {
            // Ignore a second kill attempt as well.
          }
        }
      }, 1500).unref()
    }

    return this.requireOwnedSession(sessionId)
  }

  async seedDebugSession(sessionId: string): Promise<SessionRecord> {
    if (!APP_DEBUG && !SMOKE_TEST_MODE) {
      throw new Error('Pengisian data uji hanya tersedia dalam mode uji atau smoke test.')
    }

    const session = this.requireOwnedSession(sessionId)
    this.assertSessionNotAborted(session, 'diisi data uji')
    if (session.state === 'running_inference') {
      throw new Error('Tunggu analisis lokal selesai sebelum mengisi data uji.')
    }

    await this.ensureSessionDirectories(sessionId)

    session.draft.participantId = DEBUG_SAMPLE_IDENTITY.participantId
    session.draft.participantName = DEBUG_SAMPLE_IDENTITY.participantName
    session.draft.age = DEBUG_SAMPLE_IDENTITY.age
    session.draft.notes = DEBUG_SAMPLE_IDENTITY.notes
    session.draft.questionnaireAnswers = createDebugQuestionnaireAnswers()
    session.draft.consent = {
      ...createEmptyConsent(),
      status: 'given',
      givenAt: nowIso()
    }
    session.draft.captures = await this.writeDebugArtifacts(sessionId)
    session.draft.step = 'review'

    this.persistSession(sessionId, 'ready_for_inference', session.draft, null, null, null)
    this.writeAuditEvent('session.seed_debug', sessionId, {
      captureCount: STIMULUS_COUNT
    })
    return this.requireOwnedSession(sessionId)
  }

  async updateSessionIdentity(
    sessionId: string,
    input: SessionIdentityInput
  ): Promise<SessionRecord> {
    const session = this.requireOwnedSession(sessionId)
    this.assertSessionNotAborted(session, 'diedit')
    const draft = session.draft
    draft.participantId = input.participantId.trim()
    draft.participantName = input.participantName.trim()
    draft.age = input.age.trim()
    draft.notes = input.notes.trim()
    draft.step = draft.consent.status === 'given' ? 'preflight' : 'consent'
    draft.updatedAt = nowIso()

    this.persistSession(sessionId, session.state, draft, session.result, null, session.completedAt)
    this.writeAuditEvent('session.update_identity', sessionId, {
      participantId: draft.participantId
    })
    return this.requireOwnedSession(sessionId)
  }

  async submitConsent(input: SubmitConsentInput): Promise<SessionRecord> {
    const session = this.requireOwnedSession(input.sessionId)
    this.assertSessionNotAborted(session, 'diperbarui')

    if (!input.accepted) {
      throw new Error('Persetujuan eksplisit diperlukan sebelum perekaman dimulai.')
    }

    const timestamp = nowIso()
    session.draft.consent = {
      status: 'given',
      version: CONSENT_VERSION,
      statement: CONSENT_STATEMENT,
      givenAt: timestamp,
      revokedAt: null
    }
    session.draft.step = 'preflight'
    session.draft.updatedAt = timestamp

    this.persistSession(
      session.id,
      session.state,
      session.draft,
      session.result,
      null,
      session.completedAt
    )
    this.writeAuditEvent('consent.give', session.id, {
      version: CONSENT_VERSION
    })
    return this.requireOwnedSession(session.id)
  }

  async revokeConsent(sessionId: string): Promise<SessionRecord> {
    const session = this.requireOwnedSession(sessionId)
    this.assertSessionNotAborted(session, 'dicabut consent-nya')

    const revokedAt = nowIso()
    session.draft.consent = {
      ...normalizeConsent(session.draft.consent),
      status: 'revoked',
      revokedAt
    }
    session.draft.updatedAt = revokedAt

    this.abortRequested.add(sessionId)
    const child = this.runningProcesses.get(sessionId)
    if (child && !child.killed) {
      try {
        child.kill('SIGTERM')
      } catch {
        // Best-effort termination only.
      }
    }

    await this.deleteSessionRecord(sessionId)
    this.writeAuditEvent('consent.revoke', sessionId, {
      version: session.draft.consent.version,
      method: 'filesystem_delete'
    })

    return {
      ...session,
      state: 'aborted',
      updatedAt: revokedAt,
      completedAt: revokedAt,
      draft: session.draft,
      failureMessage: null
    }
  }

  async updateSessionStep(sessionId: string, step: SessionStep): Promise<SessionRecord> {
    const session = this.requireOwnedSession(sessionId)
    this.assertSessionNotAborted(session, 'dibuka ulang')
    if (this.stepRequiresConsent(step)) {
      this.assertConsentGiven(session)
    }
    session.draft.step = step
    session.draft.updatedAt = nowIso()

    let nextState: SessionState = session.state
    if (session.result && (step === 'review' || step === 'result')) {
      nextState = resolveCompletedSessionState(session)
    } else if (step === 'running') {
      nextState = 'running_inference'
    } else if (step === 'review' && this.isSessionReadyForInference(session)) {
      nextState = 'ready_for_inference'
    } else if (step !== 'result' && session.state === 'failed') {
      nextState = 'draft'
    }

    this.persistSession(
      sessionId,
      nextState,
      session.draft,
      session.result,
      nextState === 'failed' ? session.failureMessage : null,
      session.completedAt
    )

    return this.requireOwnedSession(sessionId)
  }

  async saveStimulusArtifact(input: SaveArtifactInput): Promise<SessionRecord> {
    const session = this.requireOwnedSession(input.sessionId)
    this.assertSessionNotAborted(session, 'diperbarui')
    this.assertConsentGiven(session)
    if (input.slot < 1 || input.slot > STIMULUS_COUNT) {
      throw new Error(`Slot harus antara 1 dan ${STIMULUS_COUNT}.`)
    }
    if (input.data.byteLength === 0) {
      throw new Error(`Rekaman ${input.kind} kosong. Rekam stimulus itu lagi.`)
    }

    const draft = session.draft
    const capture = draft.captures[input.slot - 1]
    const filePath = this.resolveArtifactPath(
      input.sessionId,
      input.slot,
      input.kind,
      input.mimeType
    )
    const payload = Buffer.from(input.data)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, payload)
    const artifactMirrorPath = await this.mirrorRecordingArtifact(input, payload)

    const artifact: CaptureArtifact = {
      path: filePath,
      mimeType: input.mimeType,
      recordedAt: nowIso(),
      sha256: sha256Hex(payload)
    }

    capture[input.kind] = artifact
    draft.step = 'recording'
    draft.updatedAt = nowIso()

    const nextState = this.isSessionReadyForInference({ ...session, draft })
      ? 'ready_for_inference'
      : 'draft'

    this.persistSession(
      input.sessionId,
      nextState,
      draft,
      session.result,
      null,
      session.completedAt
    )
    this.writeAuditEvent('artifact.save', input.sessionId, {
      slot: input.slot,
      kind: input.kind,
      sha256: artifact.sha256,
      artifactMirrorPath
    })
    return this.requireOwnedSession(input.sessionId)
  }

  async saveQuestionnaire(input: SaveQuestionnaireInput): Promise<SessionRecord> {
    if (input.answers.length !== QUESTION_COUNT) {
      throw new Error(`Diperlukan ${QUESTION_COUNT} jawaban kuesioner.`)
    }

    if (
      !input.answers.every((value) =>
        QUESTION_SCALE_VALUES.includes(value as (typeof QUESTION_SCALE_VALUES)[number])
      )
    ) {
      throw new Error('Jawaban kuesioner harus memakai skala lokal 1-6.')
    }

    const session = this.requireOwnedSession(input.sessionId)
    this.assertSessionNotAborted(session, 'diperbarui')
    this.assertConsentGiven(session)
    session.draft.questionnaireAnswers = [...input.answers]
    session.draft.step = 'review'
    session.draft.updatedAt = nowIso()

    const nextState = this.isSessionReadyForInference(session) ? 'ready_for_inference' : 'draft'
    this.persistSession(
      input.sessionId,
      nextState,
      session.draft,
      session.result,
      null,
      session.completedAt
    )
    this.writeAuditEvent('questionnaire.save', input.sessionId, { answers: input.answers.length })
    return this.requireOwnedSession(input.sessionId)
  }

  async startInference(sessionId: string): Promise<InferenceStatus> {
    const session = this.requireOwnedSession(sessionId)
    const existingJob = this.jobs.get(sessionId)
    if (existingJob && existingJob.status === 'running') {
      return { ...existingJob }
    }

    this.assertSessionNotAborted(session, 'dimulai')
    this.assertConsentGiven(session)
    this.assertModelRuntimeReady()
    if (!this.isSessionReadyForInference(session)) {
      throw new Error('Sesi belum lengkap. Rekam semua artefak dan lengkapi kuesioner.')
    }
    this.assertSessionArtifactsReady(session)

    const outputRoot = join(this.getSessionDirectory(sessionId), 'model-output')
    await fs.mkdir(outputRoot, { recursive: true })

    const startedAt = nowIso()
    const job: InferenceJob = {
      sessionId,
      status: 'running',
      stage: 'Menyiapkan input model lokal',
      progress: 0.12,
      attempts: 0,
      maxAttempts: MAX_INFERENCE_ATTEMPTS,
      startedAt,
      completedAt: null,
      error: null,
      logs: [],
      outputRoot
    }
    this.jobs.set(sessionId, job)

    session.draft.step = 'running'
    session.draft.updatedAt = startedAt
    this.persistSession(sessionId, 'running_inference', session.draft, session.result, null, null)
    this.writeAuditEvent('inference.start', sessionId, {
      maxAttempts: MAX_INFERENCE_ATTEMPTS
    })

    void this.runInference(sessionId)

    return { ...job }
  }

  async getInferenceStatus(sessionId: string): Promise<InferenceStatus> {
    const session = this.requireOwnedSession(sessionId)
    const job = this.jobs.get(sessionId)
    if (job) {
      return { ...job }
    }

    return {
      sessionId,
      status: inferStatusFromSession(session),
      stage:
        session.state === 'failed'
          ? 'Inferensi gagal'
          : session.state === 'aborted'
            ? 'Sesi dibatalkan'
            : session.result
              ? 'Inferensi selesai'
              : 'Menunggu dimulai',
      progress: session.result ? 1 : 0,
      attempts: session.result?.attemptCount ?? 0,
      maxAttempts: MAX_INFERENCE_ATTEMPTS,
      startedAt: session.state === 'running_inference' ? session.updatedAt : null,
      completedAt: session.completedAt,
      error: session.failureMessage,
      logs: []
    }
  }

  async submitResultFeedback(input: SubmitResultFeedbackInput): Promise<SessionRecord> {
    const session = this.requireOwnedSession(input.sessionId)
    if (!session.result) {
      throw new Error('Feedback hanya dapat disimpan setelah hasil inferensi tersedia.')
    }

    if (input.verdict !== 'correct' && input.verdict !== 'incorrect') {
      throw new Error('Feedback hasil tidak valid.')
    }

    const correctedLabel =
      input.verdict === 'incorrect'
        ? input.correctedLabel === 'secure' || input.correctedLabel === 'insecure'
          ? input.correctedLabel
          : null
        : null

    if (input.verdict === 'incorrect' && !correctedLabel) {
      throw new Error('Pilih label koreksi untuk feedback hasil yang tidak sesuai.')
    }

    const result: InferenceResult = {
      ...session.result,
      feedback: {
        verdict: input.verdict,
        correctedLabel,
        submittedAt: nowIso()
      }
    }

    this.persistSession(
      session.id,
      resolveCompletedSessionState({ ...session, result }),
      session.draft,
      result,
      session.failureMessage,
      session.completedAt ?? result.completedAt
    )
    this.writeAuditEvent('feedback.submit', session.id, {
      verdict: input.verdict,
      correctedLabel
    })
    return this.requireOwnedSession(session.id)
  }

  private registerHandler(
    channel: (typeof CHANNELS)[keyof typeof CHANNELS],
    handler: Parameters<typeof ipcMain.handle>[1]
  ): void {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler)
  }

  private resolveProjectRoot(): string {
    const candidates = [
      resolve(app.getAppPath(), '..'),
      resolve(app.getAppPath(), '../..'),
      process.cwd(),
      resolve(process.cwd(), '..')
    ]

    for (const candidate of candidates) {
      if (existsSync(join(candidate, 'data_model_KP', 'run_model', 'run_inference.sh'))) {
        return candidate
      }
    }

    throw new Error('Root proyek untuk eksekusi model lokal tidak ditemukan.')
  }

  private resolveDebugSamplePath(label: 'exposure' | 'response' | 'audio'): string | null {
    const macCaseRoot = join(this.modelRoot, 'run_model', 'tmp_mac_case')
    const macCaseFallbackRoot = join(this.modelRoot, 'run_model', 'tmp_mac_case_run_20260423')
    if (label === 'exposure') {
      return firstExistingPath([
        join(macCaseRoot, 'exposure', 'afani_exposure8.mp4'),
        join(macCaseFallbackRoot, 'exposure', 'afani_exposure8.mp4')
      ])
    }

    if (label === 'response') {
      return firstExistingPath([
        join(macCaseRoot, 'response_video', 'afani_response2.mp4'),
        join(macCaseFallbackRoot, 'response_video', 'afani_response2.mp4')
      ])
    }

    return firstExistingPath([
      join(this.modelRoot, 'run_model', 'tmp_audio_test', 'in', 'alice_stimuli1.wav')
    ])
  }

  private modelRuntimeReady(): boolean {
    return this.getModelRuntimeReadinessError() === null
  }

  private listSessionsInternal(userId: string): SessionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, state, started_at, updated_at, completed_at, failure_message, draft_json, result_json
         FROM sessions
         WHERE user_id = ?
         ORDER BY updated_at DESC`
      )
      .all(userId) as SessionRow[]

    return rows.map((row) => this.mapSession(row))
  }

  private buildAuthSnapshot(
    user: LocalUser | null = this.getCurrentUser(),
    knownUser: LocalUser | null = user
  ): AuthSnapshot {
    const remoteAuth = getRemoteAuthCapabilities()

    return {
      user,
      knownUser,
      initialized: this.getUserCount() > 0,
      remoteAuth: {
        ...remoteAuth,
        requestAccessEnabled: true,
        debugAutoApprovalEnabled: APP_DEBUG
      }
    }
  }

  private getCurrentUser(): LocalUser | null {
    const row = this.getCurrentUserRow()
    return row ? this.mapUser(row) : null
  }

  private getCurrentUserRow(): UserRow | null {
    const activeUserId = this.getAppState('active_user_id')
    if (!activeUserId) {
      return null
    }

    return (
      (this.db
        .prepare(
          `SELECT id, username, full_name, password_salt, password_hash, created_at, role, profile_json, verification_json
           FROM users
           WHERE id = ?`
        )
        .get(activeUserId) as UserRow | undefined) ?? null
    )
  }

  private requireCurrentUserRow(): UserRow {
    const userRow = this.getCurrentUserRow()
    if (!userRow) {
      throw new Error('Anda harus masuk sebelum memperbarui profil.')
    }
    return userRow
  }

  private requireAdminUserRow(): UserRow {
    const userRow = this.requireCurrentUserRow()
    if (userRow.role !== 'admin') {
      throw new Error('Halaman admin hanya tersedia untuk administrator lokal.')
    }
    return userRow
  }

  private requirePsychologistUserRow(): UserRow {
    const userRow = this.requireCurrentUserRow()
    if (userRow.role !== 'psychologist') {
      throw new Error('Akun admin tidak dapat menjalankan sesi asesmen.')
    }
    return userRow
  }

  private ensureUserSchema(): void {
    const columns = this.db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))

    if (!columnNames.has('profile_json')) {
      this.db.exec(`ALTER TABLE users ADD COLUMN profile_json TEXT`)
    }

    if (!columnNames.has('verification_json')) {
      this.db.exec(`ALTER TABLE users ADD COLUMN verification_json TEXT`)
    }

    if (!columnNames.has('role')) {
      this.db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'psychologist'`)
    }

    const existingUsers = this.db
      .prepare(
        `SELECT id, username, full_name, password_salt, password_hash, created_at, role, profile_json, verification_json
         FROM users`
      )
      .all() as UserRow[]

    for (const row of existingUsers) {
      if (row.profile_json && row.verification_json) {
        continue
      }

      const profile = row.profile_json ?? JSON.stringify(createLegacyPsychologistProfile(row))
      const verification =
        row.verification_json ?? JSON.stringify(createDevelopmentVerification(row.created_at))

      this.db
        .prepare(`UPDATE users SET profile_json = ?, verification_json = ? WHERE id = ?`)
        .run(profile, verification, row.id)
    }
  }

  private ensureLocalAdminUser(): void {
    const existingAdmin = this.db
      .prepare(
        `SELECT id, username, full_name, password_salt, password_hash, created_at, role, profile_json, verification_json
         FROM users
         WHERE role = 'admin'
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get() as UserRow | undefined

    if (existingAdmin) {
      return
    }

    const timestamp = nowIso()
    const profile = createLocalAdminProfile()
    const verification = createDevelopmentVerification(timestamp)
    const existingUsername = this.findUserByUsername(LOCAL_ADMIN_EMAIL)

    const salt = randomBytes(16).toString('hex')
    const passwordHash = hashPassword(LOCAL_ADMIN_PASSWORD, salt)

    if (existingUsername) {
      this.db
        .prepare(
          `UPDATE users
           SET role = ?, password_salt = ?, password_hash = ?, profile_json = ?, verification_json = ?
           WHERE id = ?`
        )
        .run(
          'admin',
          salt,
          passwordHash,
          JSON.stringify(profile),
          JSON.stringify(verification),
          existingUsername.id
        )
      return
    }

    this.db
      .prepare(
        `INSERT INTO users (id, username, full_name, password_salt, password_hash, created_at, role, profile_json, verification_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        LOCAL_ADMIN_EMAIL,
        profile.legalName,
        salt,
        passwordHash,
        timestamp,
        'admin',
        JSON.stringify(profile),
        JSON.stringify(verification)
      )
  }

  private ensureSessionSchema(): void {
    const columns = this.db.prepare(`PRAGMA table_info(sessions)`).all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))

    if (!columnNames.has('user_id')) {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN user_id TEXT`)
    }

    const fallbackUser = this.db
      .prepare(`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`)
      .get() as { id: string } | undefined

    if (fallbackUser) {
      this.db.prepare(`UPDATE sessions SET user_id = ? WHERE user_id IS NULL`).run(fallbackUser.id)
    }
  }

  private getUserCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
    return row.count
  }

  private findUserByUsername(username: string): UserRow | undefined {
    return this.db
      .prepare(
        `SELECT id, username, full_name, password_salt, password_hash, created_at, role, profile_json, verification_json
         FROM users
         WHERE username = ?`
      )
      .get(username) as UserRow | undefined
  }

  private findUserById(userId: string): UserRow | undefined {
    return this.db
      .prepare(
        `SELECT id, username, full_name, password_salt, password_hash, created_at, role, profile_json, verification_json
         FROM users
         WHERE id = ?`
      )
      .get(userId) as UserRow | undefined
  }

  private listAdminUsers(): AdminUserSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, username, full_name, password_salt, password_hash, created_at, role, profile_json, verification_json
         FROM users
         WHERE role != 'admin'
         ORDER BY created_at DESC`
      )
      .all() as UserRow[]

    return rows.map((row) => this.mapUser(row))
  }

  private upsertLocalUser(input: {
    existingUser?: UserRow | null
    username: string
    password: string
    createdAt: string
    fullName: string
    role?: LocalUser['role']
    profile: PsychologistProfile
    verification: UserVerification
  }): UserRow {
    const salt = randomBytes(16).toString('hex')
    const passwordHash = hashPassword(input.password, salt)

    if (input.existingUser) {
      this.db
        .prepare(
          `UPDATE users
           SET username = ?, full_name = ?, password_salt = ?, password_hash = ?, created_at = ?, role = ?, profile_json = ?, verification_json = ?
           WHERE id = ?`
        )
        .run(
          input.username,
          input.fullName,
          salt,
          passwordHash,
          input.createdAt,
          input.role ?? input.existingUser.role,
          JSON.stringify(input.profile),
          JSON.stringify(input.verification),
          input.existingUser.id
        )
    } else {
      this.db
        .prepare(
          `INSERT INTO users (id, username, full_name, password_salt, password_hash, created_at, role, profile_json, verification_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          input.username,
          input.fullName,
          salt,
          passwordHash,
          input.createdAt,
          input.role ?? 'psychologist',
          JSON.stringify(input.profile),
          JSON.stringify(input.verification)
        )
    }

    const stored = this.findUserByUsername(input.username)
    if (!stored) {
      throw new Error('Akun psikolog lokal gagal disimpan.')
    }
    return stored
  }

  private async refreshVerificationStatus(userRow: UserRow, password: string): Promise<UserRow> {
    const verification = parseVerification(userRow)
    if (verification.status !== 'pending_admin_review') {
      return userRow
    }

    const capabilities = getRemoteAuthCapabilities()
    if (!capabilities.approvalSyncEnabled) {
      return userRow
    }

    const profile = parsePsychologistProfile(userRow)
    const remoteResult = await syncRemoteApprovalStatus({
      username: userRow.username,
      password,
      profile
    })
    const refreshed = this.upsertLocalUser({
      existingUser: userRow,
      username: userRow.username,
      password,
      createdAt: userRow.created_at,
      fullName: remoteResult.fullName ?? profile.legalName,
      profile: remoteResult.profile ?? profile,
      verification: createAdminReviewVerification(
        verification.submittedAt,
        remoteResult.status,
        remoteResult.verifiedAt
      )
    })

    return refreshed
  }

  private async importRemoteApprovedUser(
    username: string,
    password: string
  ): Promise<UserRow | null> {
    const capabilities = getRemoteAuthCapabilities()
    if (!capabilities.approvalSyncEnabled) {
      return null
    }

    const submittedAt = nowIso()
    const fallbackProfile = createRemoteSignInProfile(username)
    const remoteResult = await syncRemoteApprovalStatus({
      username,
      password,
      profile: fallbackProfile
    })
    const verification = createAdminReviewVerification(
      submittedAt,
      remoteResult.status,
      remoteResult.verifiedAt
    )

    if (verification.status === 'pending_admin_review') {
      throw new Error('Akun ini masih menunggu persetujuan admin.')
    }

    if (verification.status === 'rejected') {
      throw new Error('Akun ini ditolak. Kirim permintaan akses yang sudah diperbarui.')
    }

    const profile = remoteResult.profile ?? fallbackProfile
    return this.upsertLocalUser({
      existingUser: null,
      username,
      password,
      createdAt: submittedAt,
      fullName: remoteResult.fullName ?? profile.legalName,
      profile,
      verification
    })
  }

  private archiveSignedOutUser(userRow: UserRow | null): void {
    if (!userRow) {
      return
    }

    this.setAppState('last_archived_user_id', userRow.id)
    this.setAppState('last_archived_at', nowIso())
  }

  private findActiveSessionOnWorkstation(): SessionRow | null {
    const placeholders = ACTIVE_SESSION_STATES.map(() => '?').join(', ')
    const row = this.db
      .prepare(
        `SELECT id, user_id, state, started_at, updated_at, completed_at, failure_message, draft_json, result_json
         FROM sessions
         WHERE state IN (${placeholders})
         ORDER BY updated_at DESC
         LIMIT 1
        `
      )
      .get(...ACTIVE_SESSION_STATES) as SessionRow | undefined

    return row ?? null
  }

  private listActiveSessions(userId: string): SessionRecord[] {
    const placeholders = ACTIVE_SESSION_STATES.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT id, user_id, state, started_at, updated_at, completed_at, failure_message, draft_json, result_json
         FROM sessions
         WHERE user_id = ? AND state IN (${placeholders})
         ORDER BY updated_at DESC
        `
      )
      .all(userId, ...ACTIVE_SESSION_STATES) as SessionRow[]

    return rows.map((row) => this.mapSession(row))
  }

  private normalizeLegacyActiveSessions(userId: string): void {
    const activeSessions = this.listActiveSessions(userId)
    for (const session of activeSessions) {
      if (!session.result) {
        continue
      }

      session.draft.step = 'result'
      this.persistSession(
        session.id,
        resolveCompletedSessionState(session),
        session.draft,
        session.result,
        null,
        session.completedAt ?? session.result.completedAt
      )
    }

    const normalizedActiveSessions = this.listActiveSessions(userId)
    if (normalizedActiveSessions.length <= 1) {
      return
    }

    for (const staleSession of normalizedActiveSessions.slice(1)) {
      if (!hasAnyCapturedArtifact(staleSession.draft) && staleSession.state === 'draft') {
        void this.deleteSessionRecord(staleSession.id).catch(() => undefined)
        continue
      }

      staleSession.draft.step = 'result'
      this.persistSession(
        staleSession.id,
        'aborted',
        staleSession.draft,
        staleSession.result,
        'Sesi aktif lama ditutup otomatis agar hanya satu sesi berjalan per akun.',
        nowIso()
      )
    }
  }

  private assertSessionNotAborted(session: SessionRecord, action: string): void {
    if (session.state === 'aborted') {
      throw new Error(`Sesi ini sudah dibatalkan dan tidak bisa ${action}.`)
    }
  }

  private stepRequiresConsent(step: SessionStep): boolean {
    return step !== 'identity' && step !== 'consent' && step !== 'result'
  }

  private assertConsentGiven(session: SessionRecord): void {
    if (session.draft.consent.status !== 'given') {
      throw new Error('Persetujuan peserta wajib diberikan sebelum data asesmen direkam.')
    }
  }

  private getModelRuntimeReadinessError(): string | null {
    let missingComponent = false

    if (!existsSync(join(this.modelRoot, 'run_model', '.venv', 'bin', 'python'))) {
      missingComponent = true
    }
    if (!existsSync(join(this.modelRoot, 'run_model', '.venv-mmaction-modern', 'bin', 'python'))) {
      missingComponent = true
    }
    if (!existsSync(join(this.modelRoot, 'run_model', 'run_raw_pipeline_mac.sh'))) {
      missingComponent = true
    }

    if (!missingComponent) {
      return null
    }

    return 'Komponen analisis lokal belum lengkap di perangkat ini. Minta pengelola aplikasi menyiapkan paket model sebelum memulai analisis.'
  }

  private assertModelRuntimeReady(): void {
    const readinessError = this.getModelRuntimeReadinessError()
    if (readinessError) {
      throw new Error(readinessError)
    }
  }

  private mapUser(row: UserRow): LocalUser {
    const profile = parsePsychologistProfile(row)
    const verification = parseVerification(row)

    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      role: row.role === 'admin' ? 'admin' : 'psychologist',
      createdAt: row.created_at,
      profile,
      verification
    }
  }

  private getAppState(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_state WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  private setAppState(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_state (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value)
  }

  private deleteAppState(key: string): void {
    this.db.prepare('DELETE FROM app_state WHERE key = ?').run(key)
  }

  private requireSession(sessionId: string): SessionRecord {
    const row = this.db
      .prepare(
        `SELECT id, user_id, state, started_at, updated_at, completed_at, failure_message, draft_json, result_json
         FROM sessions
         WHERE id = ?`
      )
      .get(sessionId) as SessionRow | undefined

    if (!row) {
      throw new Error(`Sesi tidak dikenal: ${sessionId}`)
    }
    return this.mapSession(row)
  }

  private requireOwnedSession(sessionId: string): SessionRecord {
    const userRow = this.requirePsychologistUserRow()
    const row = this.db
      .prepare(
        `SELECT id, user_id, state, started_at, updated_at, completed_at, failure_message, draft_json, result_json
         FROM sessions
         WHERE id = ? AND user_id = ?`
      )
      .get(sessionId, userRow.id) as SessionRow | undefined

    if (!row) {
      throw new Error(`Sesi tidak dikenal: ${sessionId}`)
    }
    return this.mapSession(row)
  }

  private mapSession(row: SessionRow): SessionRecord {
    return {
      id: row.id,
      state: row.state as SessionState,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      failureMessage: row.failure_message,
      draft: parseDraft(row.draft_json),
      result: parseResult(row.result_json)
    }
  }

  private persistSession(
    sessionId: string,
    state: SessionState,
    draft: SessionDraft,
    result: InferenceResult | null,
    failureMessage: string | null,
    completedAt: string | null
  ): void {
    const updatedAt = nowIso()
    draft.updatedAt = updatedAt

    this.db
      .prepare(
        `UPDATE sessions
         SET state = ?, updated_at = ?, completed_at = ?, failure_message = ?, draft_json = ?, result_json = ?
         WHERE id = ?`
      )
      .run(
        state,
        updatedAt,
        completedAt,
        failureMessage,
        serializeDraft(draft),
        result ? JSON.stringify(result) : null,
        sessionId
      )
  }

  private writeAuditEvent(
    action: string,
    sessionId: string | null = null,
    details: Record<string, unknown> = {}
  ): void {
    const userId = this.getCurrentUserRow()?.id ?? null
    this.db
      .prepare(
        `INSERT INTO audit_events (id, user_id, session_id, action, created_at, details_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(randomUUID(), userId, sessionId, action, nowIso(), JSON.stringify(details))
  }

  private async pruneExpiredSessions(userId: string): Promise<void> {
    const cutoff = Date.now() - SESSION_RETENTION_MS
    const sessions = this.listSessionsInternal(userId)

    for (const session of sessions) {
      if (ACTIVE_SESSION_STATES.includes(session.state)) {
        continue
      }

      const referenceDate = session.completedAt ?? session.updatedAt
      if (new Date(referenceDate).getTime() >= cutoff) {
        continue
      }

      await this.deleteSessionRecord(session.id)
      this.writeAuditEvent('retention.delete_expired_session', session.id, {
        completedAt: session.completedAt,
        updatedAt: session.updatedAt,
        method: 'filesystem_delete'
      })
    }
  }

  private async ensureSessionDirectories(sessionId: string): Promise<void> {
    const root = this.getSessionDirectory(sessionId)
    const paths = [
      root,
      join(root, 'raw', 'exposure'),
      join(root, 'raw', 'response-video'),
      join(root, 'raw', 'audio'),
      join(root, 'input'),
      join(root, 'model-output')
    ]

    await Promise.all(paths.map((directory) => fs.mkdir(directory, { recursive: true })))
  }

  private async deleteSessionRecord(sessionId: string): Promise<void> {
    this.jobs.delete(sessionId)
    this.abortRequested.delete(sessionId)
    this.runningProcesses.delete(sessionId)
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
    await fs.rm(this.getSessionDirectory(sessionId), { recursive: true, force: true })
  }

  private getSessionDirectory(sessionId: string): string {
    return join(this.sessionsRoot, sessionId)
  }

  private resolveArtifactPath(
    sessionId: string,
    slot: number,
    kind: CaptureKind,
    mimeType: string
  ): string {
    const slotLabel = String(slot).padStart(2, '0')
    const subject = sanitizeSubjectName(sessionId)
    const baseDir = this.getSessionDirectory(sessionId)

    if (kind === 'exposure') {
      return join(baseDir, 'raw', 'exposure', `${subject}_exposure${slotLabel}.mp4`)
    }

    if (kind === 'response') {
      return join(baseDir, 'raw', 'response-video', `${subject}_response${slotLabel}.mp4`)
    }

    const extension =
      mimeType.includes('mp4') || mimeType.includes('m4a')
        ? '.m4a'
        : mimeType.includes('wav')
          ? '.wav'
          : mimeType.includes('aac')
            ? '.aac'
            : '.webm'
    return join(baseDir, 'raw', 'audio', `${subject}_stimuli${slotLabel}${extension}`)
  }

  private async mirrorRecordingArtifact(
    input: SaveArtifactInput,
    payload: Buffer
  ): Promise<string | null> {
    const mirrorPath = this.resolveRecordingArtifactPath(
      input.sessionId,
      input.slot,
      input.kind,
      input.mimeType
    )

    try {
      await fs.mkdir(dirname(mirrorPath), { recursive: true })
      await fs.writeFile(mirrorPath, payload)
      return mirrorPath
    } catch {
      return null
    }
  }

  private resolveRecordingArtifactPath(
    sessionId: string,
    slot: number,
    kind: CaptureKind,
    mimeType: string
  ): string {
    const sessionLabel = sanitizeSubjectName(sessionId)
    const slotLabel = String(slot).padStart(2, '0')
    const extension =
      kind === 'audio'
        ? mimeType.includes('mp4') || mimeType.includes('m4a')
          ? '.m4a'
          : mimeType.includes('wav')
            ? '.wav'
            : mimeType.includes('aac')
              ? '.aac'
              : '.webm'
        : mimeType.includes('webm')
          ? '.webm'
          : '.mp4'
    const fileName =
      kind === 'exposure'
        ? `exposure${extension}`
        : kind === 'response'
          ? `response-video${extension}`
          : `response-audio${extension}`

    return join(this.recordingArtifactsRoot, sessionLabel, `stimulus-${slotLabel}`, fileName)
  }

  private async writeDebugArtifacts(sessionId: string): Promise<StimulusCaptureStatus[]> {
    const recordedAt = nowIso()
    const captures = createEmptyCaptures()
    const exposureSource = this.resolveDebugSamplePath('exposure')
    const responseSource = this.resolveDebugSamplePath('response')
    const audioSource = this.resolveDebugSamplePath('audio')

    if (!exposureSource || !responseSource) {
      throw new Error('Contoh data uji tidak tersedia untuk sesi debug.')
    }

    for (const capture of captures) {
      const exposurePath = this.resolveArtifactPath(
        sessionId,
        capture.slot,
        'exposure',
        'video/mp4'
      )
      await fs.copyFile(exposureSource, exposurePath)
      capture.exposure = {
        path: exposurePath,
        mimeType: 'video/mp4',
        recordedAt,
        sha256: sha256Hex(readFileSync(exposurePath))
      }

      const responsePath = this.resolveArtifactPath(
        sessionId,
        capture.slot,
        'response',
        'video/mp4'
      )
      const audioPath = this.resolveArtifactPath(sessionId, capture.slot, 'audio', 'audio/wav')

      await fs.copyFile(responseSource, responsePath)
      if (audioSource) {
        await fs.copyFile(audioSource, audioPath)
      } else {
        await fs.writeFile(audioPath, createDebugAudioBuffer())
      }

      capture.response = {
        path: responsePath,
        mimeType: 'video/mp4',
        recordedAt,
        sha256: sha256Hex(readFileSync(responsePath))
      }
      capture.audio = {
        path: audioPath,
        mimeType: 'audio/wav',
        recordedAt,
        sha256: sha256Hex(readFileSync(audioPath))
      }
    }

    return captures
  }

  private isSessionReadyForInference(session: SessionRecord): boolean {
    const identityReady =
      session.draft.participantId.trim().length > 0 &&
      session.draft.participantName.trim().length > 0
    const consentReady = session.draft.consent.status === 'given'
    const capturesReady = session.draft.captures.every(
      (capture) => capture.exposure && capture.response && capture.audio
    )
    const questionnaireReady = session.draft.questionnaireAnswers.every(
      (value): value is number => typeof value === 'number'
    )

    return identityReady && consentReady && capturesReady && questionnaireReady
  }

  private async runInference(sessionId: string): Promise<void> {
    const job = this.jobs.get(sessionId)
    if (!job) {
      return
    }

    try {
      await this.ensureSessionDirectories(sessionId)
      const session = this.requireSession(sessionId)
      if (this.abortRequested.has(sessionId) || session.state === 'aborted') {
        return
      }
      const quizCsvPath = await this.writeQuizCsv(session)
      const outputRoot = job.outputRoot
      const startedAtMs = Date.now()
      let attempt = 0
      let lastError: Error | null = null

      while (attempt < MAX_INFERENCE_ATTEMPTS) {
        attempt += 1
        this.updateJob(sessionId, {
          attempts: attempt,
          maxAttempts: MAX_INFERENCE_ATTEMPTS,
          stage:
            attempt === 1
              ? 'Menjalankan inferensi lokal'
              : `Mengulang inferensi (${attempt}/${MAX_INFERENCE_ATTEMPTS})`,
          progress: attempt === 1 ? 0.18 : Math.min(0.18 + attempt * 0.08, 0.6),
          error: null
        })

        try {
          await this.executeInferenceAttempt(sessionId, quizCsvPath, outputRoot)
          lastError = null
          break
        } catch (attemptError) {
          if (
            this.abortRequested.has(sessionId) ||
            this.requireSession(sessionId).state === 'aborted'
          ) {
            return
          }

          lastError =
            attemptError instanceof Error
              ? attemptError
              : new Error('Kegagalan inferensi lokal tidak dikenal.')

          if (attempt < MAX_INFERENCE_ATTEMPTS) {
            this.updateJob(sessionId, {
              attempts: attempt,
              maxAttempts: MAX_INFERENCE_ATTEMPTS,
              stage: `Percobaan ${attempt} gagal, menyiapkan ulang`,
              progress: Math.min(0.24 + attempt * 0.1, 0.72),
              error: lastError.message
            })
          }
        }
      }

      if (lastError) {
        throw lastError
      }

      const latestSession = this.requireSession(sessionId)
      const result = this.readInferenceResult(
        latestSession,
        outputRoot,
        Date.now() - startedAtMs,
        attempt
      )
      const completedStatus: InferenceStatusKind = result.lowConfidence
        ? 'low_confidence'
        : 'completed'
      const completedAt = nowIso()

      this.updateJob(sessionId, {
        status: completedStatus,
        stage: 'Inferensi selesai',
        progress: 1,
        attempts: attempt,
        maxAttempts: MAX_INFERENCE_ATTEMPTS,
        completedAt,
        error: null
      })

      latestSession.draft.step = 'result'
      this.persistSession(
        sessionId,
        result.lowConfidence ? 'low_confidence' : 'completed',
        latestSession.draft,
        result,
        null,
        completedAt
      )
      this.writeAuditEvent('inference.complete', sessionId, {
        label: result.label,
        confidence: result.confidence,
        attempts: attempt
      })
    } catch (error) {
      if (
        this.abortRequested.has(sessionId) ||
        this.requireSession(sessionId).state === 'aborted'
      ) {
        return
      }

      const message =
        error instanceof Error ? error.message : 'Kegagalan inferensi lokal tidak dikenal.'
      const latestSession = this.requireSession(sessionId)
      latestSession.draft.step = 'result'
      this.persistSession(sessionId, 'failed', latestSession.draft, null, message, null)
      this.writeAuditEvent('inference.fail', sessionId, {
        message,
        attempts: this.jobs.get(sessionId)?.attempts ?? 0
      })
      this.updateJob(sessionId, {
        status: 'failed',
        stage: 'Inferensi gagal',
        progress: 1,
        attempts: this.jobs.get(sessionId)?.attempts ?? 0,
        maxAttempts: MAX_INFERENCE_ATTEMPTS,
        completedAt: nowIso(),
        error: message
      })
    } finally {
      this.runningProcesses.delete(sessionId)
      if (this.abortRequested.has(sessionId)) {
        this.jobs.delete(sessionId)
      }
      this.abortRequested.delete(sessionId)
    }
  }

  private assertSessionArtifactsReady(session: SessionRecord): void {
    for (const capture of session.draft.captures) {
      for (const kind of ['exposure', 'response', 'audio'] as const) {
        const artifact = capture[kind]
        if (!artifact) {
          throw new Error(`Stimulus ${capture.slot} belum memiliki rekaman ${kind}.`)
        }
        if (!existsSync(artifact.path)) {
          throw new Error(`Rekaman ${kind} untuk stimulus ${capture.slot} tidak ditemukan.`)
        }
        if (statSync(artifact.path).size === 0) {
          throw new Error(`Rekaman ${kind} untuk stimulus ${capture.slot} kosong. Rekam ulang.`)
        }
        if (artifact.sha256 && sha256Hex(readFileSync(artifact.path)) !== artifact.sha256) {
          throw new Error(
            `Rekaman ${kind} untuk stimulus ${capture.slot} berubah atau rusak. Rekam ulang.`
          )
        }
      }
    }
  }

  private async executeInferenceAttempt(
    sessionId: string,
    quizCsvPath: string,
    outputRoot: string
  ): Promise<void> {
    await fs.rm(outputRoot, { recursive: true, force: true })
    await fs.mkdir(outputRoot, { recursive: true })

    const child = spawn(
      '/bin/zsh',
      [join(this.modelRoot, 'run_model', 'run_raw_pipeline_mac.sh')],
      {
        cwd: this.modelRoot,
        env: {
          ...process.env,
          EXPOSURE_INPUT_DIR: join(this.getSessionDirectory(sessionId), 'raw', 'exposure'),
          VIDEO_INPUT_DIR: join(this.getSessionDirectory(sessionId), 'raw', 'response-video'),
          AUDIO_SOURCE_DIR: join(this.getSessionDirectory(sessionId), 'raw', 'audio'),
          QUIZ_CSV: quizCsvPath,
          OUTPUT_ROOT: outputRoot,
          ATTACHMENT_EXPERIMENT
        }
      }
    )
    this.runningProcesses.set(sessionId, child)

    child.stdout.on('data', (chunk) => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean)
      lines.forEach((line: string) => this.handleJobOutput(sessionId, line, false))
    })
    child.stderr.on('data', (chunk) => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean)
      lines.forEach((line: string) => this.handleJobOutput(sessionId, line, true))
    })

    try {
      const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
        child.on('error', rejectExit)
        child.on('close', resolveExit)
      })

      if (exitCode !== 0) {
        throw new Error(this.buildPipelineExitMessage(sessionId, exitCode))
      }
    } finally {
      const activeChild = this.runningProcesses.get(sessionId)
      if (activeChild === child) {
        this.runningProcesses.delete(sessionId)
      }
    }
  }

  private buildPipelineExitMessage(sessionId: string, exitCode: number | null): string {
    const logs = this.jobs.get(sessionId)?.logs ?? []
    const lastDiagnostic = [...logs]
      .reverse()
      .map((line) => line.replace(/^(ERR|OUT)\s+/, '').trim())
      .find(Boolean)

    if (exitCode === null) {
      return lastDiagnostic
        ? `Pipeline model lokal berhenti tidak terduga. ${lastDiagnostic}`
        : 'Pipeline model lokal berhenti tidak terduga.'
    }

    return lastDiagnostic
      ? `Pipeline model lokal keluar dengan kode ${exitCode}. ${lastDiagnostic}`
      : `Pipeline model lokal keluar dengan kode ${exitCode}.`
  }

  private handleJobOutput(sessionId: string, line: string, isError: boolean): void {
    const nextLogs = [
      ...(this.jobs.get(sessionId)?.logs ?? []),
      `${isError ? 'ERR' : 'OUT'} ${line}`
    ].slice(-120)
    const patch: Partial<InferenceJob> = { logs: nextLogs }

    if (line.includes('Loaded model weights')) {
      patch.stage = 'Memuat checkpoint klasifier'
      patch.progress = 0.42
    } else if (line.includes('Predicting DataLoader')) {
      patch.stage = 'Menjalankan klasifier attachment'
      patch.progress = 0.84
    } else if (line.includes('Wrote') && line.includes('predictions')) {
      patch.stage = 'Menulis prediksi'
      patch.progress = 0.96
    } else if (line.includes('"subjects"') || line.includes('"output_dir"')) {
      patch.stage = 'Membangun dataset fitur gabungan'
      patch.progress = 0.62
    }

    this.updateJob(sessionId, patch)
  }

  private updateJob(sessionId: string, patch: Partial<InferenceJob>): void {
    const current = this.jobs.get(sessionId)
    if (!current) {
      return
    }

    this.jobs.set(sessionId, { ...current, ...patch })
  }

  private async writeQuizCsv(session: SessionRecord): Promise<string> {
    const subject = sanitizeSubjectName(session.id)
    const filePath = join(this.getSessionDirectory(session.id), 'input', 'quiz.csv')
    const quizScores = session.draft.questionnaireAnswers.map((value) => String(value ?? ''))
    const content = `name,quest_score\n${subject},${quizScores.join(':')}\n`
    await fs.writeFile(filePath, content, 'utf8')
    return filePath
  }

  private readInferenceResult(
    session: SessionRecord,
    outputRoot: string,
    inferenceDurationMs: number,
    attemptCount: number
  ): InferenceResult {
    const predictionsCsv = join(outputRoot, 'fused_dataset', 'test_predictions.csv')
    const summaryJson = join(outputRoot, 'fused_dataset', 'test_summary.json')

    if (!existsSync(predictionsCsv)) {
      throw new Error('Pipeline model lokal tidak menghasilkan CSV prediksi.')
    }

    const rows = readFileSync(predictionsCsv, 'utf8').trim().split(/\r?\n/).filter(Boolean)

    if (rows.length < 2) {
      throw new Error('CSV prediksi tidak berisi baris data.')
    }

    const headers = rows[0].split(',')
    const values = rows[1].split(',')
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))

    const labelId = Number(record.pred_label) === 1 ? 1 : 0
    const label = labelId === 1 ? 'insecure' : 'secure'
    const secureProbability = Number(record.prob_secure)
    const insecureProbability = Number(record.prob_insecure)
    const confidence = label === 'secure' ? secureProbability : insecureProbability
    const completedAt = nowIso()

    return {
      label,
      labelId,
      confidence,
      lowConfidence: confidence < LOW_CONFIDENCE_THRESHOLD,
      lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
      modelVersion: MODEL_VERSION,
      inferenceDurationMs,
      attemptCount,
      completedAt,
      ecrRsScores: calculateEcrRsScores(session.draft.questionnaireAnswers),
      feedback: null,
      probabilities: {
        secure: secureProbability,
        insecure: insecureProbability
      },
      output: {
        predictionsCsv,
        summaryJson,
        outputRoot
      }
    }
  }
}

export function createLocalBackend(): LocalBackend {
  return new LocalBackend()
}
