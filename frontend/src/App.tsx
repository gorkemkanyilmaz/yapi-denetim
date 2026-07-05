import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/store/auth'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardHome } from '@/pages/dashboard/DashboardHome'
import { KanbanPage } from '@/pages/dashboard/KanbanPage'
import { CalendarPage } from '@/pages/lab/CalendarPage'
import { TestEntryPage } from '@/pages/lab/TestEntryPage'
import { CuringPoolsPage } from '@/pages/pools/CuringPoolsPage'
import { EquipmentPage } from '@/pages/equipment/EquipmentPage'
import { HakedisPage } from '@/pages/hakedis/HakedisPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { FieldCollectPage } from '@/pages/field/FieldCollectPage'
import { FieldQueuePage } from '@/pages/field/FieldQueuePage'
import { ConstructionSitesPage } from '@/pages/dashboard/ConstructionSitesPage'
import { EmployeesPage } from '@/pages/employees/EmployeesPage'
import { VerifyPage } from '@/pages/reports/VerifyPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

function Hydrating() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Yükleniyor…</span>
      </div>
    </div>
  )
}

function Protected({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const hydrated = useAuthStore((s) => s.hydrated)
  if (!hydrated) return <Hydrating />
  if (!token || !user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) {
    const isField = user.role === 'field_tech' || user.role === 'courier'
    return <Navigate to={isField ? '/field' : '/dashboard'} replace />
  }
  return <>{children}</>
}

export function App() {
  const hydrate = useAuthStore((s) => s.hydrate)
  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify/:reportNo" element={<VerifyPage />} />
          <Route element={<Protected><DashboardLayout /></Protected>}>
            <Route path="/dashboard" element={<Protected roles={['owner', 'manager', 'admin']}><DashboardHome /></Protected>} />
            <Route path="/kanban" element={<Protected roles={['owner', 'manager', 'lab_technician', 'qc_engineer', 'admin', 'field_tech', 'courier']}><KanbanPage /></Protected>} />
            <Route path="/construction-sites" element={<Protected roles={['owner', 'manager', 'admin']}><ConstructionSitesPage /></Protected>} />
            <Route path="/employees" element={<Protected roles={['owner', 'admin']}><EmployeesPage /></Protected>} />
            <Route path="/calendar" element={<Protected roles={['lab_technician', 'qc_engineer', 'owner', 'manager', 'admin']}><CalendarPage /></Protected>} />
            <Route path="/curing-pools" element={<Protected roles={['lab_technician', 'owner', 'manager', 'admin']}><CuringPoolsPage /></Protected>} />
            <Route path="/equipment" element={<Protected roles={['lab_technician', 'owner', 'manager', 'admin']}><EquipmentPage /></Protected>} />
            <Route path="/hakedis" element={<Protected roles={['owner', 'manager', 'admin']}><HakedisPage /></Protected>} />
            <Route path="/reports" element={<Protected roles={['qc_engineer', 'owner', 'manager', 'admin']}><ReportsPage /></Protected>} />
            <Route path="/test/:id" element={<Protected roles={['lab_technician', 'qc_engineer', 'owner', 'manager', 'admin']}><TestEntryPage /></Protected>} />
            <Route path="/field" element={<Protected roles={['field_tech', 'courier', 'owner', 'manager', 'admin']}><FieldCollectPage /></Protected>} />
            <Route path="/field/queue" element={<Protected roles={['field_tech', 'courier', 'owner', 'manager', 'admin']}><FieldQueuePage /></Protected>} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster position="top-right" richColors aria-live="assertive" />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
