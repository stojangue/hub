import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { Language } from '@shared/settings'
import { navigation, type NavItem } from '@renderer/app/navigation'
import { useT, type TranslationKey } from '@renderer/i18n'
import { useSettings } from '@renderer/settings/context'

/** Every feature from the sidebar, in the same order, except the Overview itself. */
const features = navigation.filter((item) => item.to !== '/overview')

/** The hub's starting point: a greeting and a card for every feature. */
export function OverviewPage() {
  const t = useT()
  const { settings } = useSettings()
  const now = new Date()
  return (
    <div className="mx-auto max-w-4xl pt-2 pb-6 sm:pt-6">
      <header className="mb-8">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {formatToday(now, settings.language)}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{t(greetingKey(now))}</h1>
        <p className="mt-1 text-muted">{t('overview.subtitle')}</p>
      </header>
      <nav aria-label={t('overview.features')}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-3">
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

function FeatureCard({ item: { to, icon: Icon, labelKey, descriptionKey } }: { item: NavItem }) {
  const t = useT()
  const id = useId()
  return (
    <Link
      to={to}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface/50 p-5 outline-none transition-[translate,background-color,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface hover:shadow-md hover:shadow-black/5 focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="flex items-start justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon aria-hidden className="size-5" strokeWidth={1.75} />
        </span>
        <ArrowRight
          aria-hidden
          className="size-4 -translate-x-1 text-muted opacity-0 transition-[translate,opacity,color] duration-200 ease-out group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:text-accent group-focus-visible:opacity-100 motion-reduce:translate-x-0 motion-reduce:transition-none"
        />
      </span>
      <span>
        <span id={`${id}-label`} className="block font-semibold">
          {t(labelKey)}
        </span>
        <span
          id={`${id}-description`}
          className="mt-1 block text-[0.8125rem] leading-snug text-muted"
        >
          {t(descriptionKey)}
        </span>
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
