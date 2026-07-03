import { useState } from 'react'

import { StatusNotice } from '@/components/app-ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

type AssessmentEntryMode = 'new' | 'existing'

type StartAssessmentDialogProps = {
  open: boolean
  hasExistingPatients: boolean
  isSubmitting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onCreateNew: () => void
  onSelectExisting: () => void
}

const assessmentModeOptions: Array<{
  value: AssessmentEntryMode
  label: string
  description: string
}> = [
  {
    value: 'new',
    label: 'Pasien baru',
    description: 'Langkah pertama menampilkan form identitas peserta seperti biasa.'
  },
  {
    value: 'existing',
    label: 'Pasien terdaftar',
    description: 'Langkah pertama diganti menjadi pencarian dan pemilihan pasien.'
  }
]

export const StartAssessmentDialog = ({
  open,
  hasExistingPatients,
  isSubmitting,
  error,
  onOpenChange,
  onCreateNew,
  onSelectExisting
}: StartAssessmentDialogProps): React.JSX.Element => {
  const [selectedMode, setSelectedMode] = useState<AssessmentEntryMode | null>(null)

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setSelectedMode(null)
    }

    onOpenChange(nextOpen)
  }

  const submitSelection = (): void => {
    if (!selectedMode) {
      return
    }

    setSelectedMode(null)

    if (selectedMode === 'new') {
      onCreateNew()
      return
    }

    onSelectExisting()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto rounded-[28px] border-border/60 bg-card/98 shadow-[var(--shadow-floating)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-[-0.04em]">Mulai asesmen</DialogTitle>
          <DialogDescription className="text-base leading-7">
            Pilih jenis pasien untuk menentukan tampilan langkah pertama asesmen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {error ? (
            <StatusNotice tone="error" title="Asesmen gagal dibuat">
              {error}
            </StatusNotice>
          ) : null}

          {assessmentModeOptions.map((option) => {
            const isExistingOption = option.value === 'existing'
            const isDisabled = isSubmitting || (isExistingOption && !hasExistingPatients)

            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-4 rounded-[22px] border border-border/70 bg-background/70 p-5 transition hover:border-primary/30 hover:bg-muted/35"
              >
                <input
                  type="radio"
                  name="assessment-patient-mode"
                  className="mt-1 size-5 accent-primary"
                  checked={selectedMode === option.value}
                  disabled={isDisabled}
                  onChange={() => setSelectedMode(option.value)}
                />
                <div>
                  <p className="font-medium text-foreground">{option.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {option.description}
                  </p>
                  {isExistingOption && !hasExistingPatients ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Belum ada pasien lama yang bisa dipilih.
                    </p>
                  ) : null}
                </div>
              </label>
            )
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl bg-card"
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={isSubmitting || selectedMode === null}
            onClick={submitSelection}
          >
            {isSubmitting ? 'Membuat...' : 'Pilih'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
