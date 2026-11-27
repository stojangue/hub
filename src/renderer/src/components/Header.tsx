import { Breadcrumbs } from './Breadcrumbs'

export function Header() {
  return (
    <header className="flex h-titlebar shrink-0 items-center border-b border-border px-8 app-drag">
      <Breadcrumbs />
    </header>
  )
}
