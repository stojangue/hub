import { Outlet } from 'react-router'
import { Header } from '@renderer/components/Header'
import { Sidebar } from '@renderer/components/Sidebar'

export function AppShell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto px-8 py-6 select-text">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
