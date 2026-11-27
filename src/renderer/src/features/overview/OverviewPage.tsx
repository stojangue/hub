import { useT } from '@renderer/i18n'

export function OverviewPage() {
  const t = useT()
  return (
    <section>
      <p className="text-muted">{t('overview.welcome')}</p>
    </section>
  )
}
