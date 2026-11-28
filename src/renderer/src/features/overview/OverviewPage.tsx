import { ArrowUpRight } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { Language } from '@shared/settings'
import { navigation, type NavItem } from '@renderer/app/navigation'
import { PageHeader } from '@renderer/components/PageHeader'
import { useT, type TranslationKey } from '@renderer/i18n'
import { useSettings } from '@renderer/settings/context'

/** Every feature from the sidebar, in the same order, except the Overview itself. */
const features = navigation.filter((item) => item.to !== '/overview')

/** The hub's starting point: a greeting and every feature, laid out like the other list pages. */
export function OverviewPage() {
  const t = useT()
  const { settings } = useSettings()
  const now = new Date()
  return (
    <div>
      <PageHeader title={t(greetingKey(now))} description={formatToday(now, settings.language)} />
      <nav aria-label={t('overview.features')}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(16rem,100%),1fr))] gap-3">
          {features.map((item) => (
            <li key={item.to}>
              <FeatureCard item={item} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** A flat card in the border and radius of the other pages' lists. */
function FeatureCard({ item: { to, icon: Icon, labelKey, descriptionKey } }: { item: NavItem }) {
  const t = useT()
  const id = useId()
  return (
    <Link
      to={to}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      className="group flex h-full flex-col rounded-xl border border-border p-4 outline-none transition-colors hover:border-muted/40 hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
    >
      <span className="flex items-center justify-between">
        <span className="flex size-8 items-center justify-center rounded-lg border border-border text-muted transition-colors group-hover:text-foreground group-focus-visible:text-foreground motion-reduce:transition-none">
          <Icon aria-hidden className="size-4" />
        </span>
        <ArrowUpRight
          aria-hidden
          className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        />
      </span>
      <span id={`${id}-label`} className="mt-6 font-medium">
        {t(labelKey)}
      </span>
      <span id={`${id}-description`} className="mt-1 text-xs leading-relaxed text-muted">
        {t(descriptionKey)}
      </span>
    </Link>
  )
}

/** Greets by the time of day: morning from 5 am, afternoon from noon, evening from 6 pm. */
function greetingKey(now: Date): TranslationKey {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'overview.greeting.morning'
  if (hour >= 12 && hour < 18) return 'overview.greeting.afternoon'
  return 'overview.greeting.evening'
}

/** Today's date with the weekday, e.g. "Saturday, November 28" or "Samstag, 28. November". */
function formatToday(now: Date, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now)
}
