import { useMemo, useState } from 'react'
import { FileTextIcon, MailIcon, MessageSquareIcon, UserIcon } from 'lucide-react'

import { AppTextField, PageHeading } from '@/components/app-ui'
import { Button } from '@/components/ui/button'

export function ContactDeveloperView(): React.JSX.Element {
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })

  const formReady = useMemo(
    () => Object.values(form).every((value) => value.trim().length > 0),
    [form]
  )

  const updateField = (field: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    if (!formReady) return

    const body = [`Nama: ${form.name}`, `Email: ${form.email}`, '', form.message].join('\n')

    window.location.href = `mailto:hello@attached.app?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <div className="relative mx-auto w-full max-w-7xl">
      <div
        aria-hidden
        className="workspace-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-72"
      />

      <div className="flex flex-col gap-8">
        <PageHeading
          eyebrow="Bantuan"
          title="Hubungi pengembang"
          description="Kirim masukan atau laporkan kendala alur klinis lokal."
        />

        <section className="w-full">
          <form
            onSubmit={handleSubmit}
            className="rounded-[28px] border border-border/70 bg-card/95 p-8 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-col gap-6">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                Kirim pesan
              </h2>

              <AppTextField
                label="Nama"
                icon={UserIcon}
                value={form.name}
                onChange={updateField('name')}
                placeholder="Masukkan nama"
              />
              <AppTextField
                label="Alamat email"
                icon={MailIcon}
                value={form.email}
                onChange={updateField('email')}
                placeholder="Masukkan email"
                type="email"
              />
              <AppTextField
                label="Subjek"
                icon={FileTextIcon}
                value={form.subject}
                onChange={updateField('subject')}
                placeholder="Masukkan subjek"
              />
              <AppTextField
                label="Pesan"
                icon={MessageSquareIcon}
                value={form.message}
                onChange={updateField('message')}
                placeholder="Tulis pesan..."
                multiline
              />
            </div>

            <div className="mt-8">
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-[18px] text-base shadow-[var(--shadow-primary)]"
                disabled={!formReady}
              >
                <MailIcon data-icon="inline-start" />
                Kirim pesan
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
