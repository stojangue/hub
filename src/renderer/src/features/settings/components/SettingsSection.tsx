import { useId, type ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  /** One or more `SettingRow`s, shown together in a grouped card. */
  children: ReactNode
}

/** A titled group of related settings. Add rows to an existing section as settings grow. */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {children}
      </div>
    </section>
  )
}

interface SettingRowProps {
  label: string
  /** One short sentence on what the setting does. */
  description?: string
  /** The control for this setting, aligned to the right. */
  children: ReactNode
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {description && <p className="mt-0.5 text-[0.8125rem] text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
