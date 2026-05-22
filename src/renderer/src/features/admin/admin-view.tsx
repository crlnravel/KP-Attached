import { useEffect, useState, type ReactNode } from 'react'
import {
  CheckIcon,
  EyeIcon,
  FileTextIcon,
  HistoryIcon,
  InboxIcon,
  RotateCcwIcon,
  XIcon
} from 'lucide-react'

import { AppPanel, MetricCard, PageHeading, StatusBadge, StatusNotice } from '@/components/app-ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { AdminSnapshot, VerificationDocument, VerificationDocumentKind } from '@/lib/local-api'

type AdminUser = AdminSnapshot['users'][number]
type AdminSection = 'active' | 'history'

type AdminViewProps = {
  snapshot: AdminSnapshot | null
  isLoading: boolean
  error: string | null
  onReviewAccessRequest: (userId: string, decision: 'approved' | 'rejected') => void
}

const documentLabels: Record<VerificationDocumentKind, string> = {
  license: 'STR / SSP',
  npi: 'SIPP / SIPPK',
  education: 'Pendidikan profesi',
  affiliation: 'Afiliasi praktik',
  liability: 'Keanggotaan asosiasi'
}

const documentOrder: VerificationDocumentKind[] = [
  'license',
  'npi',
  'education',
  'affiliation',
  'liability'
]

export function AdminView({
  snapshot,
  isLoading,
  error,
  onReviewAccessRequest
}: AdminViewProps): React.JSX.Element {
  const users = snapshot?.users ?? []
  const pendingUsers = users.filter((user) => user.verification.status === 'pending_admin_review')
  const historyUsers = users.filter((user) => user.verification.status !== 'pending_admin_review')
  const [section, setSection] = useState<AdminSection>('active')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [previewDocument, setPreviewDocument] = useState<VerificationDocument | null>(null)

  useEffect(() => {
    if (!selectedUser) return

    const refreshedUser = users.find((user) => user.id === selectedUser.id)
    if (!refreshedUser) {
      setSelectedUser(null)
      return
    }

    setSelectedUser(refreshedUser)
  }, [selectedUser, users])

  const visibleUsers = section === 'active' ? pendingUsers : historyUsers

  const handleDecision = (user: AdminUser, decision: 'approved' | 'rejected'): void => {
    onReviewAccessRequest(user.id, decision)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <PageHeading
        eyebrow="Admin"
        title="Persetujuan akses lokal"
        description="Tinjau identitas, kredensial, dan berkas psikolog sebelum akun dapat menjalankan asesmen ATTACHED."
      />

      {error ? (
        <StatusNotice tone="error" title="Admin tidak tersedia">
          {error}
        </StatusNotice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Menunggu" value={snapshot?.summary.pending ?? 0} />
        <MetricCard title="Disetujui" value={snapshot?.summary.verified ?? 0} />
        <MetricCard title="Ditolak" value={snapshot?.summary.rejected ?? 0} />
      </div>

      <div className="flex flex-wrap gap-2">
        <AdminSectionButton
          active={section === 'active'}
          icon={<InboxIcon className="size-4" />}
          label="Request aktif"
          count={pendingUsers.length}
          onClick={() => setSection('active')}
        />
        <AdminSectionButton
          active={section === 'history'}
          icon={<HistoryIcon className="size-4" />}
          label="Riwayat keputusan"
          count={historyUsers.length}
          onClick={() => setSection('history')}
        />
      </div>

      <AppPanel
        title={section === 'active' ? 'Request aktif' : 'Riwayat penerimaan dan penolakan'}
        description={
          section === 'active'
            ? 'Daftar ini hanya berisi akun yang masih menunggu keputusan admin.'
            : 'Keputusan sebelumnya dapat ditinjau ulang dan diubah bila admin menemukan koreksi.'
        }
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Psikolog</TableHead>
              <TableHead>Kredensial</TableHead>
              <TableHead>Dokumen</TableHead>
              <TableHead>{section === 'active' ? 'Dikirim' : 'Status'}</TableHead>
              <TableHead className="pr-6 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="pl-6">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">{user.fullName}</span>
                    <span className="text-xs text-muted-foreground">{user.username}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span>{user.profile.licenseNumber || 'Kredensial belum tersedia'}</span>
                    <span>{user.profile.practiceOrganization || 'Organisasi belum diisi'}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {countUploadedDocuments(user)} / {documentOrder.length} berkas
                </TableCell>
                <TableCell>
                  {section === 'active' ? (
                    <span className="text-sm text-muted-foreground">
                      {formatDate(user.verification.submittedAt)}
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <StatusBadge tone={statusTone(user.verification.status)}>
                        {statusLabel(user.verification.status)}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(user.verification.verifiedAt ?? user.verification.submittedAt)}
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="pr-6">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl bg-card"
                      onClick={() => setSelectedUser(user)}
                    >
                      <EyeIcon className="size-4" />
                      {section === 'active' ? 'Tinjau' : 'Detail'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {visibleUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                  {section === 'active'
                    ? 'Tidak ada request aktif saat ini.'
                    : 'Belum ada riwayat penerimaan atau penolakan.'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </AppPanel>

      <AdminReviewDialog
        user={selectedUser}
        isLoading={isLoading}
        onOpenChange={(open) => {
          if (!open) setSelectedUser(null)
        }}
        onPreviewDocument={setPreviewDocument}
        onDecision={handleDecision}
      />
      <DocumentPreviewDialog
        document={previewDocument}
        onOpenChange={(open) => {
          if (!open) setPreviewDocument(null)
        }}
      />
    </div>
  )
}

function AdminSectionButton({
  active,
  icon,
  label,
  count,
  onClick
}: {
  active: boolean
  icon: ReactNode
  label: string
  count: number
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border/70 bg-card/70 text-muted-foreground hover:border-primary/25 hover:text-foreground'
      )}
      onClick={onClick}
    >
      {icon}
      {label}
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-xs',
          active ? 'bg-primary-foreground/16 text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {count}
      </span>
    </button>
  )
}

function AdminReviewDialog({
  user,
  isLoading,
  onOpenChange,
  onPreviewDocument,
  onDecision
}: {
  user: AdminUser | null
  isLoading: boolean
  onOpenChange: (open: boolean) => void
  onPreviewDocument: (document: VerificationDocument) => void
  onDecision: (user: AdminUser, decision: 'approved' | 'rejected') => void
}): React.JSX.Element {
  const status = user?.verification.status
  const canApprove = Boolean(user && status !== 'verified')
  const canReject = Boolean(user && status !== 'rejected')

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">
            {user?.fullName ?? 'Detail psikolog'}
          </DialogTitle>
          <DialogDescription>
            Tinjau data pendaftaran dan berkas pendukung sebelum menentukan akses psikolog.
          </DialogDescription>
        </DialogHeader>

        {user ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminDetailCard
              title="Akun"
              rows={[
                ['Email', user.username],
                ['Nama legal', user.profile.legalName || user.fullName],
                ['Telepon profesional', user.profile.professionalPhone],
                ['Dikirim', formatDateTime(user.verification.submittedAt)]
              ]}
            />
            <AdminDetailCard
              title="Kredensial"
              rows={[
                ['Jenis kredensial', humanizeLicenseType(user.profile.licenseType)],
                ['Nomor STR / SSP', user.profile.licenseNumber],
                ['Wilayah HIMPSI', user.profile.licenseJurisdiction],
                ['Lembaga penerbit', user.profile.issuingBoard],
                ['Terbit', user.profile.licenseIssuedAt],
                ['Kedaluwarsa', user.profile.licenseExpiresAt],
                ['Nomor SIPP / SIPPK', user.profile.npiNumber]
              ]}
            />
            <AdminDetailCard
              title="Praktik"
              rows={[
                ['Gelar dasar', user.profile.doctoralDegree],
                ['Institusi', user.profile.degreeInstitution],
                ['Tahun dasar', user.profile.degreeGraduationYear],
                ['Organisasi praktik', user.profile.practiceOrganization],
                ['Area kekhususan', user.profile.specialtyArea],
                ['Alamat praktik', user.profile.practiceAddress]
              ]}
            />
            <AdminDocumentCard user={user} onPreviewDocument={onPreviewDocument} />
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            {user ? (
              <StatusBadge tone={statusTone(user.verification.status)}>
                {statusLabel(user.verification.status)}
              </StatusBadge>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {user?.verification.status === 'verified' ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl bg-card"
                disabled={isLoading || !canReject}
                onClick={() => onDecision(user, 'rejected')}
              >
                <RotateCcwIcon className="size-4" />
                Ubah ke ditolak
              </Button>
            ) : null}
            {user?.verification.status === 'rejected' ? (
              <Button
                type="button"
                className="rounded-xl"
                disabled={isLoading || !canApprove}
                onClick={() => onDecision(user, 'approved')}
              >
                <RotateCcwIcon className="size-4" />
                Ubah ke diterima
              </Button>
            ) : null}
            {user?.verification.status === 'pending_admin_review' ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl bg-card"
                  disabled={isLoading || !canReject}
                  onClick={() => onDecision(user, 'rejected')}
                >
                  <XIcon className="size-4" />
                  Tolak
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={isLoading || !canApprove}
                  onClick={() => onDecision(user, 'approved')}
                >
                  <CheckIcon className="size-4" />
                  Setujui
                </Button>
              </>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AdminDetailCard({
  title,
  rows
}: {
  title: string
  rows: Array<[string, string]>
}): React.JSX.Element {
  return (
    <section className="rounded-[20px] border border-border/70 bg-background/60 p-4">
      <h3 className="text-base font-semibold tracking-[-0.03em] text-foreground">{title}</h3>
      <dl className="mt-4 grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-[0.6rem] font-medium uppercase tracking-[0.13em] text-muted-foreground">
              {label}
            </dt>
            <dd className="whitespace-pre-line text-sm leading-5 text-foreground/95">
              {value.trim().length > 0 ? value : 'Belum diisi'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function AdminDocumentCard({
  user,
  onPreviewDocument
}: {
  user: AdminUser
  onPreviewDocument: (document: VerificationDocument) => void
}): React.JSX.Element {
  return (
    <section className="rounded-[20px] border border-border/70 bg-background/60 p-4">
      <h3 className="text-base font-semibold tracking-[-0.03em] text-foreground">Berkas</h3>
      <div className="mt-4 grid gap-2">
        {documentOrder.map((kind) => {
          const document = user.profile.documents[kind]
          return (
            <div
              key={kind}
              className="flex items-center justify-between gap-3 rounded-[14px] bg-card/60 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.13em] text-muted-foreground">
                  {documentLabels[kind]}
                </p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">
                  {document?.fileName ?? 'Belum diunggah'}
                </p>
                {document ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {document.mimeType} · {formatFileSize(document.sizeBytes)}
                  </p>
                ) : null}
              </div>
              {document ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-xl bg-card"
                  onClick={() => onPreviewDocument(document)}
                >
                  <FileTextIcon className="size-4" />
                  Buka
                </Button>
              ) : null}
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

function countUploadedDocuments(user: AdminUser): number {
  return documentOrder.filter((kind) => user.profile.documents[kind]).length
}

function statusLabel(status: AdminUser['verification']['status']): string {
  if (status === 'verified') return 'Disetujui'
  if (status === 'rejected') return 'Ditolak'
  return 'Menunggu'
}

function statusTone(status: AdminUser['verification']['status']): 'info' | 'success' | 'warning' {
  if (status === 'verified') return 'success'
  if (status === 'rejected') return 'warning'
  return 'info'
}

function humanizeLicenseType(value: AdminUser['profile']['licenseType']): string {
  if (value === 'licensed_psychologist') return 'Psikolog'
  if (value === 'licensed_psychological_associate') return 'Psikolog Klinis'
  if (value === 'licensed_specialist_in_school_psychology') return 'Psikolog Sekolah'
  return 'Kredensial psikolog lainnya'
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
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
