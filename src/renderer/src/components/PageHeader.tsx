import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  /** The page's primary action, aligned right. */
  action?: ReactNode
}

/** Title row at the top of a padded page. */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && <p className="mt-0.5 text-[0.8125rem] text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}
