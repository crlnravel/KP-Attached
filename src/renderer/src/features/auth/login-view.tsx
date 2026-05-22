import { useEffect, useId, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  Building2Icon,
  CalendarDaysIcon,
  ChevronDownIcon,
  CheckIcon,
  CircleHelpIcon,
  EyeIcon,
  FileTextIcon,
  GraduationCapIcon,
  KeyRoundIcon,
  LogInIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  Trash2Icon,
  UploadCloudIcon,
  UserRoundIcon
} from 'lucide-react'

import { AttachedWordmark } from '@/components/attached-wordmark'
import { AppPanel, AppTextField, Eyebrow, StatusNotice } from '@/components/app-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type {
  AuthFormMode,
  AuthSnapshot,
  LocalUser,
  PsychologistRegistrationInput,
  VerificationDocument,
  VerificationDocumentKind
} from '@/lib/local-api'

type LoginNotice = {
  tone: 'info' | 'success' | 'warning'
  title: string
  message: string
} | null

type AccessRequestStep = 'account' | 'licensure' | 'practice' | 'documents' | 'review'
type RegistrationTextField = Exclude<keyof PsychologistRegistrationInput, 'documents'>
type ValidationIssueMap = Partial<Record<RegistrationTextField | 'email' | 'password', string>>

type LoginViewProps = {
  email: string
  password: string
  registration: PsychologistRegistrationInput
  authMode: AuthFormMode
  knownUser: LocalUser | null
  remoteAuth: AuthSnapshot['remoteAuth']
  onAuthModeChange: (value: AuthFormMode) => boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onRegistrationChange: (field: RegistrationTextField, value: string) => void
  onRegistrationDocumentChange: (
    kind: VerificationDocumentKind,
    document: VerificationDocument | null
  ) => void
  onSignIn: () => void
  onSubmitAccessRequest: () => void
  coverImageUrl: string
  notice: LoginNotice
  error: string | null
  isSubmitting: boolean
}

const licenseTypeOptions: Array<{
  value: PsychologistRegistrationInput['licenseType']
  label: string
}> = [
  { value: 'licensed_psychologist', label: 'Psikolog' },
  { value: 'licensed_psychological_associate', label: 'Psikolog Klinis' },
  { value: 'licensed_specialist_in_school_psychology', label: 'Psikolog Sekolah' },
  { value: 'other', label: 'Lainnya' }
]

const psychologyDegreeOptions = [
  'M.Psi., Psikolog',
  'Psikolog',
  'Dr. Psikologi',
  'Ph.D. Psychology',
  'Others'
]

const accessRequestSteps: Array<{
  value: AccessRequestStep
  label: string
  description: string
}> = [
  { value: 'account', label: 'Akun', description: 'Identitas' },
  { value: 'licensure', label: 'Kredensial', description: 'STR dan SIPP' },
  { value: 'practice', label: 'Praktik', description: 'Praktik di Indonesia' },
  { value: 'documents', label: 'Dokumen', description: 'Berkas verifikasi' },
  { value: 'review', label: 'Tinjau', description: 'Cek akhir' }
]

const documentRequirements: Array<{
  kind: VerificationDocumentKind
  label: string
  helper: string
}> = [
  {
    kind: 'license',
    label: 'STR / SSP',
    helper: 'Surat Tanda Registrasi atau Sertifikat Sebutan Psikolog sesuai data di atas.'
  },
  {
    kind: 'npi',
    label: 'SIPP / SIPPK',
    helper: 'Surat izin praktik atau rekomendasi HIMPSI untuk tempat praktik yang diajukan.'
  },
  {
    kind: 'education',
    label: 'Pendidikan profesi',
    helper:
      'Unggah ijazah atau sertifikat pendidikan profesi psikologi. Gabungkan dokumen pendukung dalam satu PDF bila perlu.'
  },
  {
    kind: 'affiliation',
    label: 'Afiliasi praktik',
    helper:
      'Surat dari klinik, rumah sakit, sekolah, atau layanan yang mengaitkan Anda dengan tempat praktik.'
  },
  {
    kind: 'liability',
    label: 'Keanggotaan HIMPSI',
    helper: 'Bukti keanggotaan atau asosiasi yang sesuai dengan identitas dan kekhususan psikolog.'
  }
]

const acceptedDocumentTypes = 'application/pdf,image/png,image/jpeg,image/webp'
const currentYear = new Date().getFullYear()

export function LoginView({
  email,
  password,
  registration,
  authMode,
  knownUser,
  remoteAuth,
  onAuthModeChange,
  onEmailChange,
  onPasswordChange,
  onRegistrationChange,
  onRegistrationDocumentChange,
  onSignIn,
  onSubmitAccessRequest,
  coverImageUrl,
  notice,
  error,
  isSubmitting
}: LoginViewProps): React.JSX.Element {
  const [requestStep, setRequestStep] = useState<AccessRequestStep>('account')
  const [previewDocument, setPreviewDocument] = useState<VerificationDocument | null>(null)
  const requestStepIndex = accessRequestSteps.findIndex((step) => step.value === requestStep)
  const currentStep = accessRequestSteps[requestStepIndex] ?? accessRequestSteps[0]
  const derivedNotice = createVerificationNotice(knownUser, remoteAuth)
  const validationIssues = validateAccessRequestInput(email, password, registration)
  const canSignIn = !validationIssues.email && !validationIssues.password && !isSubmitting
  const documentStepIssues = documentRequirements
    .filter((requirement) => !registration.documents[requirement.kind])
    .map((requirement) => `${requirement.label} wajib diunggah.`)
  const accountStepIssues = collectValidationIssues(validationIssues, [
    'email',
    'password',
    'legalName',
    'professionalPhone'
  ])
  const licensureStepIssues = collectValidationIssues(validationIssues, [
    'licenseNumber',
    'licenseJurisdiction',
    'issuingBoard',
    'licenseIssuedAt',
    'licenseExpiresAt',
    'npiNumber'
  ])
  const practiceStepIssues = collectValidationIssues(validationIssues, [
    'doctoralDegree',
    'degreeInstitution',
    'degreeGraduationYear',
    'practiceOrganization',
    'practiceAddress',
    'specialtyArea'
  ])
  const allAccessRequestIssues = [
    ...accountStepIssues,
    ...licensureStepIssues,
    ...practiceStepIssues,
    ...documentStepIssues
  ]
  const submitLabel =
    authMode === 'sign_in'
      ? isSubmitting
        ? 'Masuk...'
        : 'Masuk'
      : isSubmitting
        ? 'Mengirim...'
        : knownUser?.verification.status === 'rejected'
          ? 'Kirim ulang akses'
          : 'Ajukan akses'

  const accountStepReady = accountStepIssues.length === 0
  const licensureStepReady = licensureStepIssues.length === 0
  const practiceStepReady = practiceStepIssues.length === 0
  const documentStepReady = documentStepIssues.length === 0
  const canSubmitAccessRequest =
    allAccessRequestIssues.length === 0 && remoteAuth.requestAccessEnabled && !isSubmitting
  const canAdvanceStep =
    requestStep === 'account'
      ? accountStepReady
      : requestStep === 'licensure'
        ? licensureStepReady
        : requestStep === 'practice'
          ? practiceStepReady
          : requestStep === 'documents'
            ? documentStepReady
            : canSubmitAccessRequest
  const unlockedStepIndex = accountStepReady
    ? licensureStepReady
      ? practiceStepReady
        ? documentStepReady
          ? 4
          : 3
        : 2
      : 1
    : 0

  const handlePreviousStep = (): void => {
    if (requestStepIndex <= 0) {
      return
    }
    setRequestStep(accessRequestSteps[requestStepIndex - 1].value)
  }

  const handleNextStep = (): void => {
    if (requestStepIndex >= accessRequestSteps.length - 1 || !canAdvanceStep) {
      return
    }
    setRequestStep(accessRequestSteps[requestStepIndex + 1].value)
  }

  const handleStepSelection = (step: AccessRequestStep, index: number): void => {
    if (index > unlockedStepIndex) {
      return
    }
    setRequestStep(step)
  }

  const handleAuthModeSelection = (value: AuthFormMode): void => {
    const accepted = onAuthModeChange(value)
    if (accepted && value !== authMode) {
      setRequestStep('account')
    }
  }

  const handleDocumentFileSelection = (
    kind: VerificationDocumentKind,
    fileList: FileList | null
  ): void => {
    const file = fileList?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      window.alert('Unggah berkas PDF atau gambar.')
      return
    }

    if (file.size > 8_000_000) {
      window.alert('Unggah berkas yang lebih kecil dari 8 MB.')
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        return
      }

      onRegistrationDocumentChange(kind, {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        dataUrl: reader.result,
        uploadedAt: new Date().toISOString()
      })
    })
    reader.readAsDataURL(file)
  }

  return (
    <>
      <main className="min-h-screen bg-background text-foreground lg:h-screen lg:overflow-hidden">
        <section className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col px-4 py-5 sm:px-6 lg:h-screen lg:min-h-0 lg:flex-row lg:items-stretch lg:gap-8 lg:px-8 lg:py-6">
          <div className="relative hidden overflow-hidden rounded-[26px] border border-ink/10 bg-capture shadow-[var(--shadow-floating)] xl:flex xl:w-[24rem] xl:flex-col xl:justify-between">
            <img
              src={coverImageUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover opacity-90"
            />
            <div className="auth-cover-scrim absolute inset-0" />
            <div className="auth-cover-grid absolute inset-0" />
            <div className="relative z-10 p-7 text-capture-foreground">
              <AttachedWordmark className="text-3xl text-capture-foreground" />
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            <div
              aria-hidden
              className="workspace-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-96"
            />

            <div
              className={cn(
                'flex w-full flex-col justify-center gap-5 lg:min-h-0',
                authMode === 'request_access' ? 'max-w-4xl' : 'max-w-xl'
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2">
                  <Eyebrow>
                    {authMode === 'request_access' ? 'Psikolog Indonesia' : 'Masuk psikolog'}
                  </Eyebrow>
                  <AttachedWordmark as="h1" className="text-5xl sm:text-6xl" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {authMode === 'request_access' ? (
                    <button
                      type="button"
                      className="font-medium text-foreground underline decoration-primary/35 underline-offset-4 transition hover:text-primary"
                      onClick={() => handleAuthModeSelection('sign_in')}
                    >
                      Sudah punya akun?
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="font-medium text-foreground underline decoration-primary/35 underline-offset-4 transition hover:text-primary"
                      onClick={() => handleAuthModeSelection('request_access')}
                    >
                      Buat akun baru
                    </button>
                  )}
                </p>
              </div>

              <AppPanel
                className={cn(
                  'rounded-[24px] border-primary/12 bg-panel-strong shadow-[var(--shadow-floating)]',
                  authMode === 'request_access' && 'lg:max-h-[calc(100vh-3rem)] lg:min-h-0'
                )}
                contentClassName={cn(
                  'flex flex-col gap-5',
                  authMode === 'sign_in' ? 'p-7 sm:p-8' : 'p-5 sm:p-6 lg:min-h-0 lg:p-7'
                )}
              >
                <div
                  className={cn(
                    'flex flex-col gap-5',
                    authMode === 'request_access' && 'lg:min-h-0'
                  )}
                >
                  {authMode === 'request_access' ? (
                    <div className="flex flex-col gap-3">
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        {accessRequestSteps.map((step, index) => {
                          const active = step.value === requestStep
                          const complete = index < requestStepIndex
                          const locked = index > unlockedStepIndex

                          return (
                            <button
                              key={step.value}
                              type="button"
                              disabled={locked}
                              aria-disabled={locked}
                              className={cn(
                                'rounded-[18px] border px-3 py-3 text-left transition',
                                active
                                  ? 'border-primary/30 bg-primary/6 shadow-sm'
                                  : complete
                                    ? 'border-success/25 bg-success-container/55'
                                    : locked
                                      ? 'cursor-not-allowed border-border/45 bg-background/30 opacity-55'
                                      : 'border-border/70 bg-background/50 hover:border-primary/20'
                              )}
                              onClick={() => handleStepSelection(step.value, index)}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                    active
                                      ? 'bg-primary text-primary-foreground'
                                      : complete
                                        ? 'bg-success text-success-foreground'
                                        : 'bg-muted text-muted-foreground'
                                  )}
                                >
                                  {complete ? <CheckIcon className="size-4" /> : index + 1}
                                </span>
                                <span className="text-sm font-semibold text-foreground">
                                  {step.label}
                                </span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      'flex flex-col gap-4',
                      authMode === 'request_access' && 'lg:min-h-0'
                    )}
                  >
                    {notice ? (
                      <StatusNotice tone={notice.tone} title={notice.title}>
                        {notice.message}
                      </StatusNotice>
                    ) : null}

                    {derivedNotice ? (
                      <StatusNotice tone={derivedNotice.tone} title={derivedNotice.title}>
                        {derivedNotice.message}
                      </StatusNotice>
                    ) : null}

                    <div
                      className={cn(
                        'flex flex-col gap-4',
                        authMode === 'request_access' && 'lg:min-h-0 lg:overflow-auto lg:pr-1'
                      )}
                    >
                      {authMode === 'sign_in' ? (
                        <section className="flex flex-col gap-5">
                          <div className="space-y-1">
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">
                              Masuk
                            </h2>
                          </div>
                          <div className="grid gap-4">
                            <AppTextField
                              label="Email kerja"
                              type="email"
                              value={email}
                              onChange={onEmailChange}
                              icon={MailIcon}
                              placeholder="nama@klinik.id"
                              helper="Gunakan email profesional yang terhubung dengan tempat praktik Anda."
                              error={validationIssues.email ?? null}
                              inputClassName="h-14 text-base"
                            />
                            <AppTextField
                              label="Kata sandi"
                              type="password"
                              value={password}
                              onChange={onPasswordChange}
                              icon={KeyRoundIcon}
                              placeholder="Minimal 8 karakter"
                              helper="Kata sandi ini melindungi akun workstation ini."
                              error={validationIssues.password ?? null}
                              inputClassName="h-14 text-base"
                            />
                          </div>
                        </section>
                      ) : null}

                      {authMode === 'request_access' && requestStep === 'account' ? (
                        <>
                          <section className="flex flex-col gap-4">
                            <Eyebrow>{currentStep.label}</Eyebrow>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <AppTextField
                                label="Email kerja"
                                type="email"
                                value={email}
                                onChange={onEmailChange}
                                icon={MailIcon}
                                placeholder="nama@klinik.id"
                                helper="Gunakan email profesional yang terhubung dengan tempat praktik Anda."
                                error={validationIssues.email ?? null}
                              />
                              <AppTextField
                                label="Buat kata sandi"
                                type="password"
                                value={password}
                                onChange={onPasswordChange}
                                description="Gunakan minimal 8 karakter."
                                icon={KeyRoundIcon}
                                placeholder="Minimal 8 karakter"
                                helper="Kata sandi ini melindungi akun workstation ini."
                                error={validationIssues.password ?? null}
                              />
                            </div>
                          </section>

                          <section className="flex flex-col gap-4">
                            <Eyebrow>Identitas</Eyebrow>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <AppTextField
                                label="Nama legal"
                                value={registration.legalName}
                                onChange={(value) => onRegistrationChange('legalName', value)}
                                icon={UserRoundIcon}
                                placeholder="Dr. Nama Psikolog, M.Psi., Psikolog"
                                helper="Masukkan nama legal yang tercantum pada STR, SSP, atau SIPP."
                                error={validationIssues.legalName ?? null}
                              />
                              <AppTextField
                                label="Nomor telepon profesional"
                                type="tel"
                                value={registration.professionalPhone}
                                onChange={(value) =>
                                  onRegistrationChange('professionalPhone', value)
                                }
                                icon={PhoneIcon}
                                placeholder="+62 812-3456-7890"
                                helper="Gunakan nomor telepon Indonesia, seperti +62 atau 08."
                                error={validationIssues.professionalPhone ?? null}
                              />
                            </div>
                          </section>
                        </>
                      ) : null}

                      {authMode === 'request_access' && requestStep === 'licensure' ? (
                        <section className="flex flex-col gap-4">
                          <Eyebrow>{currentStep.label}</Eyebrow>
                          <div className="flex flex-wrap gap-2">
                            {licenseTypeOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={cn(
                                  'rounded-full border px-4 py-2 text-sm font-medium transition',
                                  registration.licenseType === option.value
                                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                    : 'border-border/70 bg-background/70 text-muted-foreground hover:border-primary/25 hover:text-foreground'
                                )}
                                onClick={() => onRegistrationChange('licenseType', option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <AppTextField
                              label="Nomor STR / SSP"
                              value={registration.licenseNumber}
                              onChange={(value) => onRegistrationChange('licenseNumber', value)}
                              icon={BadgeCheckIcon}
                              placeholder="STR-123456"
                              helper="Masukkan nomor kredensial psikolog Indonesia sesuai dokumen resmi."
                              error={validationIssues.licenseNumber ?? null}
                            />
                            <AppTextField
                              label="Wilayah HIMPSI"
                              value={registration.licenseJurisdiction}
                              onChange={(value) =>
                                onRegistrationChange('licenseJurisdiction', value)
                              }
                              icon={MapPinIcon}
                              placeholder="HIMPSI Wilayah DKI Jakarta"
                              helper="Wilayah atau yurisdiksi yang tercantum pada kredensial."
                              error={validationIssues.licenseJurisdiction ?? null}
                            />
                            <AppTextField
                              label="Lembaga penerbit"
                              value={registration.issuingBoard}
                              onChange={(value) => onRegistrationChange('issuingBoard', value)}
                              icon={Building2Icon}
                              placeholder="HIMPSI / KTKI"
                              helper="Organisasi yang tercantum pada kredensial."
                              error={validationIssues.issuingBoard ?? null}
                            />
                            <AppTextField
                              label="Tanggal terbit kredensial"
                              type="date"
                              value={registration.licenseIssuedAt}
                              onChange={(value) => onRegistrationChange('licenseIssuedAt', value)}
                              icon={CalendarDaysIcon}
                              helper="Tanggal kredensial diterbitkan."
                              error={validationIssues.licenseIssuedAt ?? null}
                            />
                            <AppTextField
                              label="Tanggal kedaluwarsa kredensial"
                              type="date"
                              value={registration.licenseExpiresAt}
                              onChange={(value) => onRegistrationChange('licenseExpiresAt', value)}
                              icon={CalendarDaysIcon}
                              helper="Kredensial harus masih aktif sampai hari ini."
                              error={validationIssues.licenseExpiresAt ?? null}
                            />
                            <AppTextField
                              label="Nomor SIPP / SIPPK"
                              value={registration.npiNumber}
                              onChange={(value) => onRegistrationChange('npiNumber', value)}
                              icon={BadgeCheckIcon}
                              placeholder="SIPP-3171-2026-001"
                              helper="Nomor izin praktik atau rujukan SIPP/SIPPK setempat."
                              error={validationIssues.npiNumber ?? null}
                            />
                          </div>
                        </section>
                      ) : null}

                      {authMode === 'request_access' && requestStep === 'practice' ? (
                        <section className="flex flex-col gap-4">
                          <Eyebrow>{currentStep.label}</Eyebrow>
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <PsychologyDegreeSelect
                              value={registration.doctoralDegree}
                              error={validationIssues.doctoralDegree ?? null}
                              onChange={(value) => onRegistrationChange('doctoralDegree', value)}
                            />
                            <AppTextField
                              label="Institusi pendidikan"
                              value={registration.degreeInstitution}
                              onChange={(value) => onRegistrationChange('degreeInstitution', value)}
                              icon={Building2Icon}
                              placeholder="Universitas Indonesia"
                              helper="Institusi yang menerbitkan ijazah atau sertifikat pendidikan."
                              error={validationIssues.degreeInstitution ?? null}
                            />
                            <AppTextField
                              label="Tahun kelulusan yang menjadi dasar"
                              value={registration.degreeGraduationYear}
                              onChange={(value) =>
                                onRegistrationChange('degreeGraduationYear', value)
                              }
                              icon={CalendarDaysIcon}
                              placeholder="2020"
                              helper="Gunakan tahun yang tercetak pada ijazah atau sertifikat profesi psikologi yang menjadi dasar."
                              error={validationIssues.degreeGraduationYear ?? null}
                            />
                            <AppTextField
                              label="Organisasi praktik"
                              value={registration.practiceOrganization}
                              onChange={(value) =>
                                onRegistrationChange('practiceOrganization', value)
                              }
                              icon={Building2Icon}
                              placeholder="Klinik Psikologi Attached"
                              helper="Klinik, rumah sakit, sekolah, atau tempat praktik tempat sistem digunakan."
                              error={validationIssues.practiceOrganization ?? null}
                            />
                            <AppTextField
                              label="Area kekhususan"
                              value={registration.specialtyArea}
                              onChange={(value) => onRegistrationChange('specialtyArea', value)}
                              icon={BadgeCheckIcon}
                              placeholder="Psikolog Klinis Anak dan Remaja"
                              helper="Kekhususan klinis utama untuk alur CDSS ini."
                              error={validationIssues.specialtyArea ?? null}
                            />
                            <div className="md:col-span-2 xl:col-span-3">
                              <AppTextField
                                label="Alamat praktik"
                                value={registration.practiceAddress}
                                onChange={(value) => onRegistrationChange('practiceAddress', value)}
                                multiline
                                icon={MapPinIcon}
                                placeholder={'Jl. Cikini Raya No. 10\nMenteng\nJakarta Pusat 10330'}
                                helper="Lokasi praktik yang terhubung dengan organisasi yang diajukan."
                                error={validationIssues.practiceAddress ?? null}
                              />
                            </div>
                          </div>
                        </section>
                      ) : null}

                      {authMode === 'request_access' && requestStep === 'documents' ? (
                        <section className="flex flex-col gap-4">
                          <Eyebrow>{currentStep.label}</Eyebrow>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {documentRequirements.map((requirement) => (
                              <DocumentUploadCard
                                key={requirement.kind}
                                requirement={requirement}
                                document={registration.documents[requirement.kind]}
                                onFileSelected={(fileList) =>
                                  handleDocumentFileSelection(requirement.kind, fileList)
                                }
                                onRemove={() =>
                                  onRegistrationDocumentChange(requirement.kind, null)
                                }
                                onPreview={(document) => setPreviewDocument(document)}
                                error={
                                  registration.documents[requirement.kind]
                                    ? null
                                    : `${requirement.label} wajib diunggah.`
                                }
                              />
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {authMode === 'request_access' && requestStep === 'review' ? (
                        <section className="flex flex-col gap-4">
                          <Eyebrow>{currentStep.label}</Eyebrow>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <ReviewCard
                              title="Akun"
                              rows={[
                                ['Email kerja', email],
                                [
                                  'Kata sandi',
                                  password.trim().length >= 8 ? 'Siap' : 'Perlu 8+ karakter'
                                ],
                                ['Nama legal', registration.legalName],
                                ['Telepon profesional', registration.professionalPhone]
                              ]}
                            />
                            <ReviewCard
                              title="Kredensial"
                              rows={[
                                ['Jenis kredensial', humanizeLicenseType(registration.licenseType)],
                                ['Nomor STR / SSP', registration.licenseNumber],
                                ['Wilayah HIMPSI', registration.licenseJurisdiction],
                                ['Lembaga penerbit', registration.issuingBoard],
                                ['Terbit', registration.licenseIssuedAt],
                                ['Kedaluwarsa', registration.licenseExpiresAt],
                                ['Nomor SIPP / SIPPK', registration.npiNumber]
                              ]}
                            />
                            <ReviewCard
                              title="Praktik"
                              rows={[
                                ['Gelar dasar', registration.doctoralDegree],
                                ['Institusi', registration.degreeInstitution],
                                ['Tahun dasar', registration.degreeGraduationYear],
                                ['Organisasi praktik', registration.practiceOrganization],
                                ['Area kekhususan', registration.specialtyArea],
                                ['Alamat praktik', registration.practiceAddress]
                              ]}
                            />
                            <ReviewDocumentCard
                              documents={registration.documents}
                              onPreview={(document) => setPreviewDocument(document)}
                            />
                          </div>
                        </section>
                      ) : null}
                    </div>
                  </div>

                  {error ? (
                    <StatusNotice
                      tone="error"
                      title={authMode === 'request_access' ? 'Permintaan gagal' : 'Gagal masuk'}
                    >
                      {error}
                    </StatusNotice>
                  ) : null}

                  {authMode === 'sign_in' ? (
                    <Button
                      type="button"
                      size="lg"
                      className="h-14 rounded-[20px] text-base shadow-[var(--shadow-primary)] sm:text-lg"
                      disabled={!canSignIn}
                      onClick={onSignIn}
                    >
                      <LogInIcon data-icon="inline-start" />
                      {submitLabel}
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 rounded-[18px]"
                        disabled={requestStepIndex === 0 || isSubmitting}
                        onClick={handlePreviousStep}
                      >
                        <ArrowLeftIcon data-icon="inline-start" />
                        Kembali
                      </Button>

                      {requestStep === 'review' ? (
                        <Button
                          type="button"
                          size="lg"
                          className="h-[3.25rem] rounded-[18px] shadow-[var(--shadow-primary)]"
                          disabled={!canSubmitAccessRequest}
                          onClick={onSubmitAccessRequest}
                        >
                          <LogInIcon data-icon="inline-start" />
                          {submitLabel}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="lg"
                          className="h-[3.25rem] rounded-[18px] shadow-[var(--shadow-primary)]"
                          disabled={!canAdvanceStep}
                          onClick={handleNextStep}
                        >
                          Lanjut
                          <ArrowRightIcon data-icon="inline-end" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </AppPanel>
            </div>
          </div>
        </section>
      </main>
      <DocumentPreviewDialog
        document={previewDocument}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewDocument(null)
          }
        }}
      />
    </>
  )
}

function validateAccessRequestInput(
  email: string,
  password: string,
  registration: PsychologistRegistrationInput
): ValidationIssueMap {
  const issues: ValidationIssueMap = {}
  const issuedAt = registration.licenseIssuedAt.trim()
  const expiresAt = registration.licenseExpiresAt.trim()

  if (!isEmailLike(email)) {
    issues.email = 'Masukkan email kerja yang valid.'
  }

  if (password.trim().length < 8) {
    issues.password = 'Gunakan minimal 8 karakter.'
  }

  if (registration.legalName.trim().length < 3) {
    issues.legalName = 'Masukkan nama sesuai kredensial.'
  }

  if (!isIndonesianPhoneLike(registration.professionalPhone)) {
    issues.professionalPhone = 'Gunakan nomor telepon Indonesia yang valid.'
  }

  if (!isCredentialReferenceLike(registration.licenseNumber)) {
    issues.licenseNumber = 'Masukkan nomor STR atau SSP.'
  }

  if (registration.licenseJurisdiction.trim().length < 3) {
    issues.licenseJurisdiction = 'Masukkan wilayah HIMPSI.'
  }

  if (registration.issuingBoard.trim().length < 3) {
    issues.issuingBoard = 'Masukkan lembaga penerbit.'
  }

  if (!isIsoDateLike(issuedAt)) {
    issues.licenseIssuedAt = 'Masukkan tanggal terbit yang valid.'
  } else if (isFutureDate(issuedAt)) {
    issues.licenseIssuedAt = 'Tanggal terbit tidak boleh di masa depan.'
  }

  if (!isIsoDateLike(expiresAt)) {
    issues.licenseExpiresAt = 'Masukkan tanggal kedaluwarsa yang valid.'
  } else if (!isFutureOrToday(expiresAt)) {
    issues.licenseExpiresAt = 'Kredensial harus masih aktif.'
  } else if (
    isIsoDateLike(issuedAt) &&
    new Date(expiresAt).getTime() < new Date(issuedAt).getTime()
  ) {
    issues.licenseExpiresAt = 'Kedaluwarsa tidak boleh sebelum tanggal terbit.'
  }

  if (!isCredentialReferenceLike(registration.npiNumber)) {
    issues.npiNumber = 'Masukkan nomor SIPP atau SIPPK.'
  }

  if (registration.doctoralDegree.trim().length < 2) {
    issues.doctoralDegree = 'Masukkan gelar profesi yang menjadi dasar.'
  }

  if (registration.degreeInstitution.trim().length < 3) {
    issues.degreeInstitution = 'Masukkan institusi penerbit.'
  }

  if (!isGraduationYearLike(registration.degreeGraduationYear)) {
    issues.degreeGraduationYear = `Gunakan tahun antara 1950 dan ${currentYear}.`
  }

  if (registration.practiceOrganization.trim().length < 3) {
    issues.practiceOrganization = 'Masukkan organisasi praktik.'
  }

  if (registration.practiceAddress.trim().length < 8) {
    issues.practiceAddress = 'Masukkan alamat praktik.'
  }

  if (registration.specialtyArea.trim().length < 3) {
    issues.specialtyArea = 'Masukkan area kekhususan.'
  }

  return issues
}

function collectValidationIssues(
  issues: ValidationIssueMap,
  keys: Array<keyof ValidationIssueMap>
): string[] {
  return keys.flatMap((key) => (issues[key] ? [issues[key]] : []))
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
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
  if (!/^\d{4}$/.test(value.trim())) {
    return false
  }

  const year = Number(value)
  return year >= 1950 && year <= currentYear
}

function HelperTip({ label, helper }: { label: string; helper: string }): React.JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            aria-label={`Bantuan ${label}`}
          >
            <CircleHelpIcon className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="max-w-64 leading-5">
          {helper}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function PsychologyDegreeSelect({
  value,
  error,
  onChange
}: {
  value: string
  error: string | null
  onChange: (value: string) => void
}): React.JSX.Element {
  const currentValue = value.trim()
  const options = psychologyDegreeOptions.includes(currentValue)
    ? psychologyDegreeOptions
    : currentValue.length > 0
      ? [...psychologyDegreeOptions, currentValue]
      : psychologyDegreeOptions

  return (
    <div className="grid gap-2">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <GraduationCapIcon className="size-4 text-muted-foreground" />
        Gelar psikologi yang menjadi dasar
      </label>
      <div className="relative">
        <select
          value={currentValue}
          className={cn(
            'h-12 w-full appearance-none rounded-md border bg-card px-3 text-sm text-foreground shadow-xs outline-none transition focus-visible:ring-2 focus-visible:ring-primary/25',
            error ? 'border-destructive/55' : 'border-input'
          )}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="" disabled>
            Pilih gelar
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
          <ChevronDownIcon className="size-4" />
        </span>
      </div>
      <p className="text-sm leading-5 text-muted-foreground">
        Pilih gelar atau sertifikat profesi yang menjadi dasar STR/SSP.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

function DocumentUploadCard({
  requirement,
  document,
  onFileSelected,
  onRemove,
  onPreview,
  error
}: {
  requirement: (typeof documentRequirements)[number]
  document: VerificationDocument | null
  onFileSelected: (fileList: FileList | null) => void
  onRemove: () => void
  onPreview: (document: VerificationDocument) => void
  error?: string | null
}): React.JSX.Element {
  const inputId = useId()
  const [hasInteracted, setHasInteracted] = useState(false)
  const visibleError = hasInteracted ? error : null

  return (
    <section
      className={cn(
        'rounded-[18px] border bg-background/60 p-4',
        visibleError ? 'border-destructive/50' : 'border-border/70'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">{requirement.label}</h3>
            <HelperTip label={requirement.label} helper={requirement.helper} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">PDF, PNG, JPG, atau WEBP</p>
        </div>
        <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>

      {document ? (
        <div className="mt-4 rounded-[14px] border border-border/70 bg-card/70 p-3">
          <p className="truncate text-sm font-medium text-foreground">{document.fileName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(document.sizeBytes)}</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-[12px]"
              onClick={() => onPreview(document)}
            >
              <EyeIcon data-icon="inline-start" />
              Pratinjau
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-[12px]"
              onClick={onRemove}
            >
              <Trash2Icon data-icon="inline-start" />
              Hapus
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed border-border/90 bg-card/45 p-4 text-center transition hover:border-primary/35 hover:bg-primary/5"
          onClick={() => setHasInteracted(true)}
        >
          <UploadCloudIcon className="size-5 text-muted-foreground" />
          <span className="mt-2 text-sm font-medium text-foreground">Unggah berkas</span>
        </label>
      )}

      {visibleError ? <p className="mt-2 text-sm text-destructive">{visibleError}</p> : null}

      <input
        id={inputId}
        type="file"
        accept={acceptedDocumentTypes}
        className="sr-only"
        onFocus={() => setHasInteracted(true)}
        onChange={(event) => {
          setHasInteracted(true)
          onFileSelected(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
      />
    </section>
  )
}

function ReviewDocumentCard({
  documents,
  onPreview
}: {
  documents: PsychologistRegistrationInput['documents']
  onPreview: (document: VerificationDocument) => void
}): React.JSX.Element {
  return (
    <section className="rounded-[20px] border border-border/70 bg-background/60 p-4">
      <h2 className="text-base font-semibold tracking-[-0.03em] text-foreground">Dokumen</h2>
      <div className="mt-4 grid gap-2">
        {documentRequirements.map((requirement) => {
          const document = documents[requirement.kind]
          return (
            <div key={requirement.kind} className="rounded-[12px] bg-card/55 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[0.58rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {requirement.label}
                </p>
                <div className="mt-1 flex min-w-0 items-start gap-2">
                  <p className="review-two-line min-w-0 flex-1 text-sm leading-5 text-foreground">
                    {document ? document.fileName : 'Belum diunggah'}
                  </p>
                  {document ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-[-0.125rem] size-7 shrink-0 rounded-[9px] p-0"
                      onClick={() => onPreview(document)}
                    >
                      <EyeIcon className="size-4" />
                      <span className="sr-only">Pratinjau {document.fileName}</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DocumentPreviewDialog({
  document,
  onOpenChange
}: {
  document: VerificationDocument | null
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const previewUrl = useDocumentPreviewUrl(document)
  const pdfPreviewSource =
    document?.mimeType === 'application/pdf' ? (previewUrl ?? document.dataUrl) : null

  return (
    <Dialog open={Boolean(document)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[24px] border-border/70 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{document?.fileName ?? 'Pratinjau dokumen'}</DialogTitle>
          <DialogDescription>
            {document ? `${document.mimeType} · ${formatFileSize(document.sizeBytes)}` : null}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-hidden rounded-[18px] border border-border/70 bg-background">
          {document?.mimeType.startsWith('image/') ? (
            <img
              src={previewUrl ?? document.dataUrl}
              alt={document.fileName}
              className="max-h-[70vh] w-full object-contain"
            />
          ) : pdfPreviewSource ? (
            <iframe
              src={pdfPreviewSource}
              title={document?.fileName ?? 'Pratinjau PDF'}
              className="h-[70vh] w-full border-0 bg-background"
            />
          ) : (
            <div className="flex min-h-48 items-center justify-center p-8 text-sm text-muted-foreground">
              Pratinjau belum tersedia untuk tipe berkas ini.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function useDocumentPreviewUrl(document: VerificationDocument | null): string | null {
  const [preview, setPreview] = useState<{ dataUrl: string; url: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    if (!document) {
      return undefined
    }

    void fetch(document.dataUrl)
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) {
          return
        }

        objectUrl = URL.createObjectURL(blob)
        setPreview({ dataUrl: document.dataUrl, url: objectUrl })
      })
      .catch(() => {
        if (!cancelled) {
          setPreview({ dataUrl: document.dataUrl, url: document.dataUrl })
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [document])

  if (!preview || preview.dataUrl !== document?.dataUrl) {
    return null
  }

  return preview.url
}

function createVerificationNotice(
  knownUser: LocalUser | null,
  remoteAuth: AuthSnapshot['remoteAuth']
): LoginNotice {
  if (!knownUser) {
    return null
  }

  if (knownUser.verification.status === 'verified') {
    return null
  }

  if (knownUser.verification.status === 'rejected') {
    return {
      tone: 'warning',
      title: 'Verifikasi ditolak',
      message: 'Perbarui detail kredensial lalu kirim ulang.'
    }
  }

  return {
    tone: 'info',
    title: 'Menunggu persetujuan',
    message: remoteAuth.debugAutoApprovalEnabled
      ? `${knownUser.username} masih menunggu persetujuan admin lokal.`
      : remoteAuth.approvalSyncEnabled
        ? `${knownUser.username} masih menunggu. Coba masuk setelah disetujui.`
        : `${knownUser.username} masih menunggu persetujuan admin. Coba masuk kembali setelah akun disetujui.`
  }
}

function ReviewCard({
  title,
  rows,
  className
}: {
  title: string
  rows: Array<[string, string]>
  className?: string
}): React.JSX.Element {
  return (
    <section
      className={cn('rounded-[20px] border border-border/70 bg-background/60 p-4', className)}
    >
      <h2 className="text-base font-semibold tracking-[-0.03em] text-foreground">{title}</h2>
      <dl className="mt-4 grid gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-[0.58rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </dt>
            <dd className="review-two-line text-sm leading-5 text-foreground/95">
              {value.trim().length > 0 ? value : 'Belum diisi'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function humanizeLicenseType(value: PsychologistRegistrationInput['licenseType']): string {
  if (value === 'licensed_psychologist') return 'Psikolog'
  if (value === 'licensed_psychological_associate') return 'Psikolog Klinis'
  if (value === 'licensed_specialist_in_school_psychology') {
    return 'Psikolog Sekolah'
  }
  return 'Kredensial psikolog lainnya'
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
