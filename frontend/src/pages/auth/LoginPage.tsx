import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Loader2 } from 'lucide-react'
import { authService } from '@/services/auth-service'
import { toast } from 'sonner'

export function LoginPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('owner@ankaraydl.com')
  const [password, setPassword] = useState('password123')
  const [tenantSlug, setTenantSlug] = useState('ankara-ydl')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await authService.login(email, password, tenantSlug)
      const role = r.data.user.role
      if (role === 'field_tech' || role === 'courier') nav('/field')
      else nav('/dashboard')
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Giriş başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-blue-900 p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md space-y-4">
        <div className="text-center">
          <Building2 className="w-12 h-12 text-blue-700 mx-auto" />
          <h1 className="text-2xl font-bold mt-2">Yapı Denetim Lab.</h1>
          <p className="text-sm text-slate-500">Ankara Operasyon Paneli</p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Tenant</label>
          <input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} className="w-full rounded-md border-slate-300 p-2 mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">E-posta</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border-slate-300 p-2 mt-1" required />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Şifre</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border-slate-300 p-2 mt-1" required />
        </div>
        <button disabled={busy} className="w-full h-12 rounded-lg bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy ? 'GİRİŞ YAPILIYOR' : 'GİRİŞ YAP'}
        </button>
      </form>
    </div>
  )
}
