import { Link } from 'react-router'
import { navigation } from '@renderer/app/navigation'
import { useT } from '@renderer/i18n'

/** Every feature from the sidebar, in the same order, except the Overview itself. */
const features = navigation.filter((item) => item.to !== '/overview')

/** A catalog of features, laid out like app icons on a home screen. */
export function OverviewPage() {
  const t = useT()
  return (
    <nav
      aria-label={t('overview.features')}
      className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-2 gap-y-4"
    >
      {features.map(({ to, icon: Icon, labelKey }) => (
        <Link
          key={to}
          to={to}
          className="group flex flex-col items-center gap-2 rounded-xl p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="flex size-16 items-center justify-center rounded-2xl text-muted transition-[translate,background-color,color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:bg-border/50 group-hover:text-foreground motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
            <Icon aria-hidden className="size-8" strokeWidth={1.5} />
          </span>
          <span className="w-full truncate text-xs font-medium">{t(labelKey)}</span>
        </Link>
      ))}
    </nav>
  )
}
