import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { flushQueue, listQueue } from '@/services/offline-queue'
import { useAuthStore } from '@/store/auth'

export function FieldLayout() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const token = useAuthStore((s) => s.token)
  const tenant = useAuthStore((s) => s.tenant)

  useEffect(() => {
    const onUp = () => { setOnline(true); void doFlush() }
    const onDown = () => setOnline(false)
    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)
    void refreshCount()
    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
    }
  }, [])

  async function refreshCount() {
    const q = await listQueue()
    setPending(q.length)
  }

  async function doFlush() {
    if (!token || !tenant) return
    const r = await flushQueue(token, tenant.id)
    await refreshCount()
    if (r.flushed > 0) console.info(`[sync] flushed ${r.flushed}`)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="font-semibold text-slate-900">Saha Toplama</div>
        <div className="flex items-center gap-3">
          {pending > 0 && (
            <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
              {pending} bekliyor
            </span>
          )}
          <div className={`flex items-center gap-1 text-xs ${online ? 'text-green-600' : 'text-red-600'}`}>
            {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {online ? 'Çevrimiçi' : 'Çevrimdışı'}
          </div>
        </div>
      </header>
      <main className="p-4 pb-24">
        <Outlet />
      </main>
    </div>
  )
}
