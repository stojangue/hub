import { useT } from '@renderer/i18n'

export function OverviewPage() {
  const t = useT()
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{t('overview.title')}</h1>
      <p className="text-muted">{t('overview.welcome')}</p>
    </section>
  )
}
