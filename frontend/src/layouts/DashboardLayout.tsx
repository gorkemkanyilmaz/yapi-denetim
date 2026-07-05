import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Building2, LogOut, User, Menu, X } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { authService } from '@/services/auth-service'
import { cn } from '@/utils/utils'

export function DashboardLayout() {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()

  const links = [
    { to: '/dashboard', label: 'Kontrol Merkezi', roles: ['owner', 'manager', 'admin'] },
    { to: '/kanban', label: 'Numune İş Akışı', roles: ['owner', 'manager', 'lab_technician', 'qc_engineer', 'admin', 'field_tech', 'courier'] },
    { to: '/construction-sites', label: 'Şantiyeler', roles: ['owner', 'manager', 'admin'] },
    { to: '/employees', label: 'Çalışanlar', roles: ['owner', 'admin'] },
    { to: '/calendar', label: 'Takvim', roles: ['lab_technician', 'qc_engineer', 'owner', 'manager', 'admin'] },
    { to: '/curing-pools', label: 'Kür Havuzları', roles: ['lab_technician', 'owner', 'manager', 'admin'] },
    { to: '/equipment', label: 'Cihazlar', roles: ['lab_technician', 'owner', 'manager', 'admin'] },
    { to: '/hakedis', label: 'Hakediş', roles: ['owner', 'manager', 'admin'] },
    { to: '/field', label: 'Saha', roles: ['field_tech', 'courier', 'owner', 'manager', 'admin'] },
    { to: '/reports', label: 'Raporlar', roles: ['qc_engineer', 'owner', 'manager', 'admin'] },
    { to: '/reports/field', label: 'Saha Raporları', roles: ['qc_engineer', 'owner', 'manager', 'admin'] },
  ]

  const visible = links.filter((l) => l.roles.includes(user?.role ?? ''))

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  const SidebarContent = (
    <>
      <div className="p-5 border-b border-slate-800 flex items-center gap-3">
        <Building2 className="w-8 h-8 text-blue-400 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{tenant?.name ?? 'Yapı Denetim'}</div>
          <div className="text-xs text-slate-400 truncate">Ankara YDL</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visible.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => cn(
              'block px-3 py-2.5 rounded-md text-sm transition-colors',
              isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
            )}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-800">
        {user?.role === 'owner' && tenant?.expires_at && (() => {
          const daysLeft = Math.ceil(
            (new Date(tenant.expires_at).getTime() - Date.now()) / 86_400_000,
          )
          const isUrgent = daysLeft <= 30
          const isExpired = daysLeft <= 0
          return (
            <div className={`mb-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold flex items-center justify-between gap-2 ${
              isExpired
                ? 'bg-red-900/40 text-red-300 border border-red-800/50'
                : isUrgent
                ? 'bg-amber-900/40 text-amber-300 border border-amber-800/50'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
            }`}>
              <span>Uygulama Bitiş</span>
              <span className="font-mono">
                {isExpired ? 'Süre Doldu' : `${daysLeft} gün`}
              </span>
            </div>
          )
        })()}
        <div className="flex items-center gap-2 px-2 py-1 text-sm text-slate-300">
          <User className="w-4 h-4 shrink-0" />
          <span className="truncate flex-1 min-w-0">{user?.full_name}</span>
          <span className="text-xs text-slate-500 shrink-0">{user?.role}</span>
        </div>
        <button
          onClick={() => authService.logout()}
          className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-md"
        >
          <LogOut className="w-4 h-4" /> Çıkış
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col shrink-0">
        {SidebarContent}
      </aside>

      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col z-50 transition-transform duration-300 ease-out shadow-2xl',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          className="absolute top-3 right-3 p-1.5 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white"
          aria-label="Menüyü kapat"
        >
          <X className="w-5 h-5" />
        </button>
        {SidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden bg-slate-900 text-white border-b border-slate-800 px-3 py-2.5 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-1 rounded-md hover:bg-slate-800 active:bg-slate-700"
            aria-label="Menüyü aç"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-5 h-5 text-blue-400 shrink-0" />
            <span className="font-semibold text-sm truncate">{tenant?.name ?? 'Yapı Denetim'}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
