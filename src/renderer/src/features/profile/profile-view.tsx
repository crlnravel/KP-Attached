import { useEffect, useRef, useState } from 'react'

import { AppTextField, PageHeading, StatusNotice } from '@/components/app-ui'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type {
  ChangePasswordInput,
  LocalUser,
  UpdateAccountEmailInput,
  UpdatePsychologistProfileInput
} from '@/lib/local-api'

type ProfileViewProps = {
  user: LocalUser
  onUpdateProfile: (input: UpdatePsychologistProfileInput) => Promise<void>
  onUpdateEmail: (input: UpdateAccountEmailInput) => Promise<void>
  onChangePassword: (input: ChangePasswordInput) => Promise<void>
  onResetLocalData: () => Promise<void>
}

type FlashMessage = {
  tone: 'success' | 'error'
  title: string
  message: string
} | null

const profileTabs = ['profile', 'settings'] as const
const profileTabLabels: Record<(typeof profileTabs)[number], string> = {
  profile: 'Profil',
  settings: 'Pengaturan'
}

export function ProfileView({
  user,
  onUpdateProfile,
  onUpdateEmail,
  onChangePassword,
  onResetLocalData
}: ProfileViewProps): React.JSX.Element {
  const [tab, setTab] = useState<(typeof profileTabs)[number]>('profile')
  const [profileForm, setProfileForm] = useState<UpdatePsychologistProfileInput>(() =>
    createProfileForm(user)
  )
  const [settingsEmail, setSettingsEmail] = useState(user.username)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resettingData, setResettingData] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setProfileForm(createProfileForm(user))
    setSettingsEmail(user.username)
  }, [user])

  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  const handleProfileFieldChange = (field: keyof UpdatePsychologistProfileInput, value: string) => {
    setProfileForm((current) => ({ ...current, [field]: value }))
  }

  const handleAvatarSelected = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setFlashMessage({
        tone: 'error',
        title: 'Gambar tidak didukung',
        message: 'Pilih berkas gambar yang valid untuk foto profil.'
      })
      return
    }

    if (file.size > 1_500_000) {
      setFlashMessage({
        tone: 'error',
        title: 'Gambar terlalu besar',
        message: 'Gunakan gambar yang lebih kecil dari 1,5 MB.'
      })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setProfileForm((current) => ({
        ...current,
        avatarDataUrl: typeof reader.result === 'string' ? reader.result : ''
      }))
      setFlashMessage(null)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveProfile = async (): Promise<void> => {
    setSavingProfile(true)
    setFlashMessage(null)

    try {
      await onUpdateProfile(profileForm)
      setFlashMessage({
        tone: 'success',
        title: 'Profil diperbarui',
        message: 'Informasi dasar dan foto profil tersimpan secara lokal.'
      })
    } catch (error) {
      setFlashMessage({
        tone: 'error',
        title: 'Profil gagal disimpan',
        message: error instanceof Error ? error.message : 'Gagal memperbarui profil.'
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSaveEmail = async (): Promise<void> => {
    setSavingEmail(true)
    setFlashMessage(null)

    try {
      await onUpdateEmail({ username: settingsEmail })
      setFlashMessage({
        tone: 'success',
        title: 'Email diperbarui',
        message: 'Email kerja untuk akun lokal ini sudah diperbarui.'
      })
    } catch (error) {
      setFlashMessage({
        tone: 'error',
        title: 'Email gagal diperbarui',
        message: error instanceof Error ? error.message : 'Gagal memperbarui alamat email.'
      })
    } finally {
      setSavingEmail(false)
    }
  }

  const handleSavePassword = async (): Promise<void> => {
    if (newPassword !== confirmPassword) {
      setFlashMessage({
        tone: 'error',
        title: 'Kata sandi tidak cocok',
        message: 'Kata sandi baru dan konfirmasi harus sama.'
      })
      return
    }

    setSavingPassword(true)
    setFlashMessage(null)

    try {
      await onChangePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setFlashMessage({
        tone: 'success',
        title: 'Kata sandi diperbarui',
        message: 'Kata sandi workstation lokal sudah diubah.'
      })
    } catch (error) {
      setFlashMessage({
        tone: 'error',
        title: 'Kata sandi gagal diubah',
        message: error instanceof Error ? error.message : 'Gagal mengubah kata sandi.'
      })
    } finally {
      setSavingPassword(false)
    }
  }

  const handleResetLocalData = async (): Promise<void> => {
    setResettingData(true)
    setFlashMessage(null)

    try {
      await onResetLocalData()
      setResetDialogOpen(false)
    } catch (error) {
      setFlashMessage({
        tone: 'error',
        title: 'Data lokal gagal dihapus',
        message: error instanceof Error ? error.message : 'Gagal menghapus data lokal.'
      })
    } finally {
      setResettingData(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-1 py-4">
      <section className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <Avatar className="size-28 border border-border bg-surface-warm text-2xl text-foreground sm:size-36">
          {user.profile.avatarDataUrl ? (
            <AvatarImage src={user.profile.avatarDataUrl} alt={user.fullName} />
          ) : null}
          <AvatarFallback>{initials || 'A'}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-3">
          <PageHeading eyebrow="Profil psikolog" title={user.profile.legalName} />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.username}</span>
          </div>
        </div>
      </section>

      {flashMessage ? (
        <StatusNotice tone={flashMessage.tone} title={flashMessage.title}>
          {flashMessage.message}
        </StatusNotice>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as (typeof profileTabs)[number])}>
        <TabsList variant="line" className="w-full justify-start border-b border-border/70">
          {profileTabs.map((item) => (
            <TabsTrigger key={item} value={item} className="px-4">
              {profileTabLabels[item]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile" className="pt-6">
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/55">
            <ProfileSection title="Informasi dasar">
              <ProfileRow label="Nama lengkap" value={user.profile.legalName} />
              <ProfileRow label="Tanggal lahir" value={displayDate(user.profile.birthDate)} />
              <ProfileRow label="Email kerja" value={user.username} />
              <ProfileRow
                label="Telepon profesional"
                value={displayValue(user.profile.professionalPhone)}
              />
            </ProfileSection>

            <ProfileSection title="Praktik">
              <ProfileRow
                label="Organisasi praktik"
                value={displayValue(user.profile.practiceOrganization)}
              />
              <ProfileRow
                label="Area kekhususan"
                value={displayValue(user.profile.specialtyArea)}
              />
              <ProfileRow
                label="Alamat praktik"
                value={displayValue(user.profile.practiceAddress)}
                multiline
              />
            </ProfileSection>

            <ProfileSection title="Kredensial">
              <ProfileRow
                label="Jenis kredensial"
                value={humanizeLicenseType(user.profile.licenseType)}
              />
              <ProfileRow
                label="Nomor STR / SSP"
                value={displayValue(user.profile.licenseNumber)}
              />
              <ProfileRow
                label="Wilayah HIMPSI"
                value={displayValue(user.profile.licenseJurisdiction)}
              />
              <ProfileRow
                label="Lembaga penerbit"
                value={displayValue(user.profile.issuingBoard)}
              />
              <ProfileRow label="Terbit" value={displayDate(user.profile.licenseIssuedAt)} />
              <ProfileRow label="Kedaluwarsa" value={displayDate(user.profile.licenseExpiresAt)} />
              <ProfileRow label="Nomor SIPP / SIPPK" value={displayValue(user.profile.npiNumber)} />
            </ProfileSection>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="pt-6">
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/55">
            <SettingsSection title="Foto profil">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="size-20 border border-border bg-surface-warm text-lg text-foreground">
                    {profileForm.avatarDataUrl ? (
                      <AvatarImage src={profileForm.avatarDataUrl} alt={profileForm.legalName} />
                    ) : null}
                    <AvatarFallback>{initials || 'A'}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl bg-card"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Unggah gambar
                    </Button>
                    {profileForm.avatarDataUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="justify-start px-0"
                        onClick={() => handleProfileFieldChange('avatarDataUrl', '')}
                      >
                        Hapus gambar
                      </Button>
                    ) : null}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelected}
                />
              </div>
            </SettingsSection>

            <SettingsSection title="Informasi dasar">
              <div className="grid gap-4 md:grid-cols-2">
                <AppTextField
                  label="Nama lengkap"
                  value={profileForm.legalName}
                  onChange={(value) => handleProfileFieldChange('legalName', value)}
                />
                <AppTextField
                  label="Tanggal lahir"
                  type="date"
                  value={profileForm.birthDate}
                  onChange={(value) => handleProfileFieldChange('birthDate', value)}
                />
                <AppTextField
                  label="Telepon profesional"
                  value={profileForm.professionalPhone}
                  onChange={(value) => handleProfileFieldChange('professionalPhone', value)}
                />
                <AppTextField
                  label="Organisasi praktik"
                  value={profileForm.practiceOrganization}
                  onChange={(value) => handleProfileFieldChange('practiceOrganization', value)}
                />
                <AppTextField
                  label="Area kekhususan"
                  value={profileForm.specialtyArea}
                  onChange={(value) => handleProfileFieldChange('specialtyArea', value)}
                />
                <div className="md:col-span-2">
                  <AppTextField
                    label="Alamat praktik"
                    value={profileForm.practiceAddress}
                    onChange={(value) => handleProfileFieldChange('practiceAddress', value)}
                    multiline
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={savingProfile}
                  onClick={handleSaveProfile}
                >
                  {savingProfile ? 'Menyimpan...' : 'Simpan profil'}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection title="Email">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <AppTextField
                  label="Email kerja"
                  type="email"
                  value={settingsEmail}
                  onChange={setSettingsEmail}
                />
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={savingEmail}
                  onClick={handleSaveEmail}
                >
                  {savingEmail ? 'Menyimpan...' : 'Simpan email'}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection title="Kata sandi">
              <div className="grid gap-4 md:grid-cols-3">
                <AppTextField
                  label="Kata sandi saat ini"
                  type="password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                />
                <AppTextField
                  label="Kata sandi baru"
                  type="password"
                  value={newPassword}
                  onChange={setNewPassword}
                />
                <AppTextField
                  label="Konfirmasi kata sandi"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                />
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={savingPassword}
                  onClick={handleSavePassword}
                >
                  {savingPassword ? 'Menyimpan...' : 'Ubah kata sandi'}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection title="Data lokal">
              <div className="flex flex-col gap-4">
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Hapus seluruh akun lokal, sesi asesmen, hasil analisis, dan artefak rekaman dari
                  workstation ini.
                </p>
                <div>
                  <Button
                    type="button"
                    variant="destructive"
                    className="rounded-xl"
                    disabled={resettingData}
                    onClick={() => setResetDialogOpen(true)}
                  >
                    Hapus data lokal
                  </Button>
                </div>
              </div>
            </SettingsSection>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl tracking-[-0.04em]">
              Hapus semua data lokal?
            </DialogTitle>
            <DialogDescription className="text-base leading-7">
              Semua akun, sesi, hasil, dan file rekaman di workstation ini akan dihapus permanen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl bg-card"
              onClick={() => setResetDialogOpen(false)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={resettingData}
              onClick={() => void handleResetLocalData()}
            >
              {resettingData ? 'Menghapus...' : 'Hapus data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProfileSection({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="grid gap-4 border-b border-border/70 px-6 py-6 last:border-b-0 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.025em] text-foreground">{title}</h2>
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  )
}

function SettingsSection({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="grid gap-4 border-b border-border/70 px-6 py-6 last:border-b-0 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.025em] text-foreground">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  )
}

function ProfileRow({
  label,
  value,
  multiline = false
}: {
  label: string
  value: string
  multiline?: boolean
}): React.JSX.Element {
  return (
    <div className="grid gap-2 py-4 md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-4 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('text-foreground', multiline && 'whitespace-pre-wrap leading-7')}>
        {value}
      </dd>
    </div>
  )
}

function createProfileForm(user: LocalUser): UpdatePsychologistProfileInput {
  return {
    legalName: user.profile.legalName,
    birthDate: user.profile.birthDate,
    professionalPhone: user.profile.professionalPhone,
    practiceOrganization: user.profile.practiceOrganization,
    practiceAddress: user.profile.practiceAddress,
    specialtyArea: user.profile.specialtyArea,
    avatarDataUrl: user.profile.avatarDataUrl
  }
}

function displayValue(value: string): string {
  return value.trim().length > 0 ? value : 'Belum diisi'
}

function displayDate(value: string): string {
  if (!value) return 'Belum diisi'
  return formatDate(value)
}

function humanizeLicenseType(value: LocalUser['profile']['licenseType']): string {
  if (value === 'licensed_psychologist') return 'Psikolog'
  if (value === 'licensed_psychological_associate') return 'Psikolog Klinis'
  if (value === 'licensed_specialist_in_school_psychology') {
    return 'Psikolog Sekolah'
  }
  return 'Kredensial psikolog lainnya'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  }).format(new Date(value))
}
