import { app } from 'electron'
import { arch, hostname, platform, release } from 'node:os'

import type {
  PsychologistLicenseType,
  PsychologistProfile,
  VerificationStatus
} from '../shared/contracts'
import {
  REMOTE_AUTH_APPROVAL_SYNC_ENABLED,
  REMOTE_AUTH_REQUEST_ENABLED,
  REMOTE_AUTH_REQUEST_URL,
  REMOTE_AUTH_SIGN_IN_URL,
  REMOTE_AUTH_TIMEOUT_MS
} from '../shared/auth-config'

type JsonRecord = Record<string, unknown>

type RemoteVerificationResult = {
  status: VerificationStatus
  verifiedAt: string | null
  message: string | null
  remoteId: string | null
  fullName: string | null
  profile: PsychologistProfile | null
}

const VALID_LICENSE_TYPES = new Set<PsychologistLicenseType>([
  'licensed_psychologist',
  'licensed_psychological_associate',
  'licensed_specialist_in_school_psychology',
  'other'
])

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asVerificationStatus(value: unknown): VerificationStatus | null {
  if (value === 'verified' || value === 'pending_admin_review' || value === 'rejected') {
    return value
  }
  if (value === 'approved' || value === 'active') {
    return 'verified'
  }
  if (value === 'pending' || value === 'pending_review' || value === 'under_review') {
    return 'pending_admin_review'
  }
  if (value === 'denied') {
    return 'rejected'
  }
  return null
}

function extractMessage(payload: unknown): string | null {
  const record = asRecord(payload)
  if (!record) {
    return null
  }

  return (
    asString(record.message) ??
    asString(record.detail) ??
    asString(record.error) ??
    asString(record.title)
  )
}

function pickRecord(payload: JsonRecord, keys: string[]): JsonRecord | null {
  for (const key of keys) {
    const value = asRecord(payload[key])
    if (value) {
      return value
    }
  }
  return null
}

function pickString(payload: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(payload[key])
    if (value) {
      return value
    }
  }
  return null
}

function createWorkstationPayload(): JsonRecord {
  return {
    application: 'Attached',
    appVersion: app.getVersion(),
    hostname: hostname(),
    platform: platform(),
    arch: arch(),
    osRelease: release()
  }
}

async function postJson(url: string, payload: JsonRecord, failurePrefix: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REMOTE_AUTH_TIMEOUT_MS)
  timeout.unref?.()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    const text = await response.text()
    let parsed: unknown = {}

    if (text.trim().length > 0) {
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        parsed = { message: text }
      }
    }

    if (!response.ok) {
      const detail = extractMessage(parsed) ?? `${response.status} ${response.statusText}`.trim()
      throw new Error(`${failurePrefix} ${detail}`.trim())
    }

    return parsed
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${failurePrefix} Layanan persetujuan belum merespons.`)
    }

    if (error instanceof Error) {
      throw new Error(`${failurePrefix} ${error.message}`.trim())
    }

    throw new Error(failurePrefix)
  } finally {
    clearTimeout(timeout)
  }
}

function resolveStatus(
  payload: JsonRecord,
  verification: JsonRecord | null
): VerificationStatus | null {
  const directStatus =
    asVerificationStatus(verification?.status) ??
    asVerificationStatus(payload.status) ??
    asVerificationStatus(payload.approvalStatus) ??
    asVerificationStatus(payload.state)

  if (directStatus) {
    return directStatus
  }

  if (payload.approved === true) {
    return 'verified'
  }

  if (payload.rejected === true) {
    return 'rejected'
  }

  return null
}

function resolveVerifiedAt(payload: JsonRecord, verification: JsonRecord | null): string | null {
  return (
    asString(verification?.verifiedAt) ??
    asString(verification?.approvedAt) ??
    asString(payload.verifiedAt) ??
    asString(payload.approvedAt)
  )
}

function resolveRemoteId(payload: JsonRecord): string | null {
  return (
    asString(payload.requestId) ??
    asString(payload.submissionId) ??
    asString(payload.accessRequestId) ??
    asString(payload.id)
  )
}

function resolveProfile(
  payload: JsonRecord,
  fallbackProfile: PsychologistProfile
): PsychologistProfile | null {
  const source =
    pickRecord(payload, ['user', 'account', 'profile']) ??
    pickRecord(payload, ['psychologist']) ??
    payload

  const licenseTypeCandidate = source.licenseType
  const licenseType =
    typeof licenseTypeCandidate === 'string' &&
    VALID_LICENSE_TYPES.has(licenseTypeCandidate as PsychologistLicenseType)
      ? (licenseTypeCandidate as PsychologistLicenseType)
      : fallbackProfile.licenseType

  return {
    ...fallbackProfile,
    legalName: pickString(source, ['legalName', 'fullName', 'name']) ?? fallbackProfile.legalName,
    professionalPhone:
      pickString(source, ['professionalPhone', 'phone']) ?? fallbackProfile.professionalPhone,
    licenseType,
    licenseNumber:
      pickString(source, ['licenseNumber', 'licenseNo', 'strNumber', 'sspNumber']) ??
      fallbackProfile.licenseNumber,
    licenseJurisdiction:
      pickString(source, ['licenseJurisdiction', 'jurisdiction', 'himpsiRegion']) ??
      fallbackProfile.licenseJurisdiction,
    issuingBoard:
      pickString(source, ['issuingBoard', 'licenseBoard', 'issuingBody']) ??
      fallbackProfile.issuingBoard,
    licenseIssuedAt:
      pickString(source, ['licenseIssuedAt', 'issuedAt']) ?? fallbackProfile.licenseIssuedAt,
    licenseExpiresAt:
      pickString(source, ['licenseExpiresAt', 'expiresAt']) ?? fallbackProfile.licenseExpiresAt,
    npiNumber:
      pickString(source, [
        'npiNumber',
        'npi',
        'sippNumber',
        'sippkNumber',
        'practicePermitNumber'
      ]) ?? fallbackProfile.npiNumber,
    doctoralDegree:
      pickString(source, ['doctoralDegree', 'degree']) ?? fallbackProfile.doctoralDegree,
    degreeInstitution:
      pickString(source, ['degreeInstitution', 'institution']) ?? fallbackProfile.degreeInstitution,
    degreeGraduationYear:
      pickString(source, ['degreeGraduationYear', 'graduationYear']) ??
      fallbackProfile.degreeGraduationYear,
    practiceOrganization:
      pickString(source, ['practiceOrganization', 'organization']) ??
      fallbackProfile.practiceOrganization,
    practiceAddress:
      pickString(source, ['practiceAddress', 'address']) ?? fallbackProfile.practiceAddress,
    specialtyArea:
      pickString(source, ['specialtyArea', 'specialty']) ?? fallbackProfile.specialtyArea
  }
}

function parseRemoteVerificationResult(
  payload: unknown,
  fallbackProfile: PsychologistProfile,
  fallbackStatus: VerificationStatus
): RemoteVerificationResult {
  const root = asRecord(payload) ?? {}
  const verification = pickRecord(root, ['verification', 'approval'])
  const profile = resolveProfile(root, fallbackProfile)
  const hasRemoteProfile = pickRecord(root, ['user', 'account', 'profile', 'psychologist']) !== null
  const status =
    resolveStatus(root, verification) ?? (hasRemoteProfile ? 'verified' : fallbackStatus)

  return {
    status,
    verifiedAt: resolveVerifiedAt(root, verification),
    message: extractMessage(payload),
    remoteId: resolveRemoteId(root),
    fullName: profile?.legalName ?? pickString(root, ['fullName', 'name']),
    profile
  }
}

export function getRemoteAuthCapabilities(): {
  requestAccessEnabled: boolean
  approvalSyncEnabled: boolean
} {
  return {
    requestAccessEnabled: REMOTE_AUTH_REQUEST_ENABLED,
    approvalSyncEnabled: REMOTE_AUTH_APPROVAL_SYNC_ENABLED
  }
}

export async function submitRemoteAccessRequest(input: {
  username: string
  password: string
  profile: PsychologistProfile
  submittedAt: string
}): Promise<RemoteVerificationResult> {
  if (!REMOTE_AUTH_REQUEST_ENABLED) {
    throw new Error(
      'Permintaan akses belum dapat dikirim dari perangkat ini. Minta admin menyetujui akun melalui halaman admin lokal.'
    )
  }

  const payload = await postJson(
    REMOTE_AUTH_REQUEST_URL,
    {
      username: input.username,
      password: input.password,
      submittedAt: input.submittedAt,
      profile: input.profile,
      workstation: createWorkstationPayload()
    },
    'Permintaan akses psikolog gagal dikirim ke layanan persetujuan.'
  )

  return parseRemoteVerificationResult(payload, input.profile, 'pending_admin_review')
}

export async function syncRemoteApprovalStatus(input: {
  username: string
  password: string
  profile: PsychologistProfile
}): Promise<RemoteVerificationResult> {
  if (!REMOTE_AUTH_APPROVAL_SYNC_ENABLED) {
    throw new Error(
      'Status persetujuan belum dapat diperbarui dari perangkat ini. Coba masuk kembali setelah admin menyetujui akun.'
    )
  }

  const payload = await postJson(
    REMOTE_AUTH_SIGN_IN_URL,
    {
      username: input.username,
      password: input.password,
      workstation: createWorkstationPayload()
    },
    'Akun psikolog gagal diverifikasi ke layanan persetujuan.'
  )

  return parseRemoteVerificationResult(payload, input.profile, 'pending_admin_review')
}
