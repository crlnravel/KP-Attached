import { createEmptyVerificationDocuments } from '@/lib/local-api'
import type { AuthSnapshot, PsychologistRegistrationInput } from '@/lib/local-api'

export const ACCESS_REQUEST_EXIT_WARNING = 'Permintaan akses belum dikirim. Tinggalkan halaman ini?'

export type AssessmentPatientMode = 'new' | 'existing' | null

export const createEmptyRegistration = (): PsychologistRegistrationInput => {
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

export const createRegistrationFromSnapshotUser = (
  user: NonNullable<AuthSnapshot['knownUser']>
): PsychologistRegistrationInput => {
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

const registrationHasDocuments = (
  documents: PsychologistRegistrationInput['documents']
): boolean => {
  return Object.values(documents).some(Boolean)
}

export const hasAccessRequestProgress = (
  email: string,
  password: string,
  registration: PsychologistRegistrationInput
): boolean => {
  if (email.trim().length > 0 || password.trim().length > 0) {
    return true
  }

  return Object.entries(registration).some(([field, value]) => {
    if (field === 'documents') {
      return registrationHasDocuments(registration.documents)
    }

    if (field === 'licenseType') {
      return value !== 'licensed_psychologist'
    }

    return typeof value === 'string' && value.trim().length > 0
  })
}

export const formatAppError = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error)) {
    return fallback
  }

  const message = error.message
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '')
    .trim()

  return message.length > 0 ? message : fallback
}
