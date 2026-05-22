import { useId, useState, type ElementType, type ReactNode } from 'react'
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  InfoIcon,
  ShieldAlertIcon,
  type LucideIcon
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'info' | 'success' | 'warning' | 'error'

const noticeConfig: Record<
  Exclude<Tone, 'default'>,
  {
    icon: LucideIcon
    className: string
    descriptionClassName: string
    title: string
  }
> = {
  info: {
    icon: InfoIcon,
    className: 'border-info/20 bg-info-container text-info-container-foreground',
    descriptionClassName: 'text-info-container-foreground/80',
    title: 'Catatan'
  },
  success: {
    icon: CheckCircle2Icon,
    className: 'border-success/20 bg-success-container text-success-container-foreground',
    descriptionClassName: 'text-success-container-foreground/80',
    title: 'Siap'
  },
  warning: {
    icon: ShieldAlertIcon,
    className: 'border-warning/25 bg-warning-container text-warning-container-foreground',
    descriptionClassName: 'text-warning-container-foreground/82',
    title: 'Perhatian'
  },
  error: {
    icon: AlertCircleIcon,
    className: 'border-destructive/25 bg-error-container text-error-container-foreground',
    descriptionClassName: 'text-error-container-foreground/85',
    title: 'Masalah'
  }
}

const badgeToneClassName: Record<Tone, string> = {
  default: 'border-border bg-card text-foreground',
  info: 'border-info/20 bg-info-container text-info-container-foreground',
  success: 'border-success/20 bg-success-container text-success-container-foreground',
  warning: 'border-warning/25 bg-warning-container text-warning-container-foreground',
  error: 'border-destructive/25 bg-error-container text-error-container-foreground'
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground',
        className
      )}
    >
      {children}
    </p>
  )
}

export function PageHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3',
        align === 'center' && 'items-center text-center',
        className
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1 className="max-w-3xl font-headline text-4xl font-semibold tracking-[-0.055em] text-foreground sm:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          {description}
        </p>
      ) : null}
    </section>
  )
}

export function AppPanel({
  title,
  description,
  action,
  children,
  tone = 'default',
  className,
  contentClassName
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  tone?: 'default' | 'accent' | 'warm'
  className?: string
  contentClassName?: string
}) {
  return (
    <Card
      className={cn(
        'gap-3 overflow-hidden rounded-[24px] border-border/70 bg-card/95 py-0 shadow-[var(--shadow-card)]',
        tone === 'accent' && 'panel-accent-gradient border-primary/10',
        tone === 'warm' && 'bg-surface-warm/80',
        className
      )}
    >
      {title || description || action ? (
        <CardHeader className="gap-2 px-6 pt-6 pb-0">
          <div>
            {title ? (
              <CardTitle className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                {title}
              </CardTitle>
            ) : null}
            {description ? (
              <CardDescription className="mt-2 max-w-2xl leading-6">{description}</CardDescription>
            ) : null}
          </div>
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn('px-6 pt-3 pb-6', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

export function MetricCard({
  title,
  value,
  detail,
  tone = 'default',
  className
}: {
  title: ReactNode
  value: ReactNode
  detail?: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <Card
      className={cn(
        'rounded-[20px] border-border/70 bg-card/95 py-0 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]',
        tone !== 'default' && 'border-primary/10',
        className
      )}
    >
      <CardContent className="p-5">
        <Eyebrow className="tracking-[0.12em]">{title}</Eyebrow>
        <p className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-foreground">{value}</p>
        {detail ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  )
}

export function StatusBadge({
  tone = 'default',
  children,
  className
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn('border px-3 py-1', badgeToneClassName[tone], className)}
    >
      {children}
    </Badge>
  )
}

export function StatusNotice({
  tone = 'info',
  title,
  children,
  className
}: {
  tone?: Exclude<Tone, 'default'>
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  const config = noticeConfig[tone]
  const Icon = config.icon

  return (
    <Alert className={cn('rounded-[18px]', config.className, className)}>
      <Icon />
      <AlertTitle>{title ?? config.title}</AlertTitle>
      <AlertDescription className={config.descriptionClassName}>{children}</AlertDescription>
    </Alert>
  )
}

export function AppTextField({
  label,
  hideLabel = false,
  description,
  error,
  helper,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  multiline = false,
  readOnly = false,
  icon: Icon,
  id,
  className,
  inputClassName
}: {
  label: string
  hideLabel?: boolean
  description?: string
  error?: string | null
  helper?: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  placeholder?: string
  multiline?: boolean
  readOnly?: boolean
  icon?: ElementType
  id?: string
  className?: string
  inputClassName?: string
}) {
  const generatedId = useId()
  const [hasFocused, setHasFocused] = useState(false)
  const fieldId = id ?? generatedId
  const visibleError = hasFocused ? error : null
  const controlClassName = cn(
    'rounded-[18px] border-border/80 bg-background/80 text-foreground shadow-none transition focus-visible:ring-primary/25',
    visibleError && 'border-destructive/50 focus-visible:ring-destructive/25',
    Icon && 'pl-11',
    inputClassName
  )

  return (
    <Field className={cn('gap-2', className)} data-invalid={Boolean(visibleError)}>
      <FieldLabel
        htmlFor={fieldId}
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium text-foreground',
          hideLabel && 'sr-only'
        )}
      >
        <span>{label}</span>
        {helper ? (
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
        ) : null}
      </FieldLabel>
      <div className="relative p-1">
        {Icon ? (
          <Icon
            className={cn(
              'pointer-events-none absolute left-5 size-4 text-muted-foreground',
              multiline ? 'top-6' : 'top-1/2 -translate-y-1/2'
            )}
          />
        ) : null}
        {multiline ? (
          <Textarea
            id={fieldId}
            className={cn('min-h-32 resize-none py-4 leading-7', controlClassName)}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setHasFocused(true)}
            placeholder={placeholder}
            aria-invalid={Boolean(visibleError)}
            readOnly={readOnly}
          />
        ) : (
          <Input
            id={fieldId}
            className={cn('h-12', controlClassName)}
            type={type}
            inputMode={inputMode}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setHasFocused(true)}
            placeholder={placeholder}
            aria-invalid={Boolean(visibleError)}
            readOnly={readOnly}
          />
        )}
      </div>
      {visibleError ? <FieldError>{visibleError}</FieldError> : null}
      {!visibleError && description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}

export function ProgressBar({
  value,
  tone = 'primary',
  className
}: {
  value: number
  tone?: 'primary' | 'ink' | 'success' | 'warning'
  className?: string
}) {
  const normalizedValue = Math.max(0, Math.min(100, value > 1 ? value : value * 100))
  const toneClassName =
    tone === 'ink'
      ? 'bg-ink'
      : tone === 'success'
        ? 'bg-success'
        : tone === 'warning'
          ? 'bg-warning'
          : 'bg-primary'

  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-foreground/10', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', toneClassName)}
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onValueChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-[16px] border border-border/70 bg-card/80 p-1 shadow-sm',
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            'rounded-[12px] px-3 py-2 text-sm font-medium text-muted-foreground transition',
            value === option.value && 'bg-secondary text-foreground shadow-sm'
          )}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ChoiceChip({
  active,
  value,
  label,
  onClick
}: {
  active: boolean
  value: ReactNode
  label: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-[20px] border border-primary/10 bg-card/70 px-3 py-4 text-center transition hover:border-primary/30',
        active && 'border-success/40 bg-success-container shadow-sm'
      )}
      onClick={onClick}
    >
      <span className="block text-sm font-semibold text-foreground">{value}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
    </button>
  )
}

export function SignalMeter({
  level,
  compact = false,
  tone = 'dark',
  orientation = 'horizontal',
  className
}: {
  level: number
  compact?: boolean
  tone?: 'dark' | 'light'
  orientation?: 'horizontal' | 'vertical'
  className?: string
}) {
  const isVertical = orientation === 'vertical'
  const barCount = compact ? 10 : 16
  const activeClassName = cn(
    'rounded-full',
    tone === 'light' ? 'bg-primary/78' : 'bg-capture-foreground/92',
    compact
      ? isVertical
        ? 'h-1.5 w-full'
        : 'h-1.5 flex-1'
      : isVertical
        ? 'h-2.5 w-full'
        : 'h-2.5 flex-1'
  )
  const idleClassName = cn(
    'rounded-full',
    tone === 'light' ? 'bg-ink/8' : 'bg-capture-foreground/18',
    compact
      ? isVertical
        ? 'h-1.5 w-full'
        : 'h-1.5 flex-1'
      : isVertical
        ? 'h-2.5 w-full'
        : 'h-2.5 flex-1'
  )
  const containerClassName = isVertical
    ? compact
      ? 'flex h-28 w-7 flex-col-reverse justify-center gap-1 rounded-[20px] bg-foreground/[0.04] px-1.5 py-2'
      : 'flex h-52 w-8 flex-col-reverse justify-center gap-1.5 rounded-[22px] bg-foreground/[0.04] px-2 py-3'
    : compact
      ? 'flex w-32 items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2 py-2'
      : 'flex w-64 items-center gap-1.5 rounded-full bg-foreground/[0.04] px-3 py-3'

  return (
    <div className={cn(containerClassName, className)} aria-label="Level sinyal mikrofon">
      {Array.from({ length: barCount }, (_, index) => {
        const threshold = (index + 1) / barCount
        return (
          <span key={threshold} className={level >= threshold ? activeClassName : idleClassName} />
        )
      })}
    </div>
  )
}

export function ConfidenceGauge({
  value,
  tone,
  label = 'Keyakinan'
}: {
  value: number
  tone: 'success' | 'warning'
  label?: string
}) {
  const percent = Math.round(value * 100)
  const degrees = Math.max(8, Math.round(value * 360))
  const color = tone === 'success' ? 'var(--success)' : 'var(--warning)'
  const shadow = tone === 'success' ? 'var(--shadow-success)' : 'var(--shadow-warning)'

  return (
    <div className="relative flex size-44 items-center justify-center sm:size-48">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} 0deg ${degrees}deg, color-mix(in srgb, var(--muted-foreground) 18%, transparent) ${degrees}deg 360deg)`,
          boxShadow: shadow
        }}
      />
      <div className="absolute inset-[10px] rounded-full bg-background/92 backdrop-blur-sm" />
      <div className="relative flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
          {percent}%
        </span>
        <span className="mt-2 text-[0.72rem] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  )
}

export function InfoRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-[18px] bg-background/60 px-4 py-3">
      <h3 className="mb-1 text-sm text-muted-foreground">{label}</h3>
      <p className="text-foreground">{value}</p>
    </div>
  )
}
