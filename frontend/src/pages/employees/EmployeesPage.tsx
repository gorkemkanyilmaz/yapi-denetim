import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authService } from '@/services/auth-service'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { Plus, Edit, Trash2, Phone, Mail, User as UserIcon, ShieldCheck, Activity, CheckCircle2, XCircle } from 'lucide-react'

type Role = 'owner' | 'manager' | 'field_tech' | 'courier' | 'lab_technician' | 'qc_engineer' | 'admin'

type Employee = {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  is_active: boolean
  completed_count: number
  active_count: number
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Patron (Owner)',
  manager: 'Yönetici (Manager)',
  field_tech: 'Saha Elemanı',
  courier: 'Kurye',
  lab_technician: 'Lab Teknisyeni',
  qc_engineer: 'QC Mühendisi',
  admin: 'Sistem Yöneticisi',
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-800',
  manager: 'bg-blue-100 text-blue-800',
  admin: 'bg-purple-100 text-purple-800',
  field_tech: 'bg-emerald-100 text-emerald-800',
  courier: 'bg-cyan-100 text-cyan-800',
  lab_technician: 'bg-indigo-100 text-indigo-800',
  qc_engineer: 'bg-rose-100 text-rose-800',
}

export function EmployeesPage() {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => authService.listUsers() as Promise<Employee[]>,
  })

  const [isOpen, setIsOpen] = useState(false)
  const [editUserId, setEditUserId] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('field_tech')
  const [password, setPassword] = useState('')
  const [isActive, setIsActive] = useState(true)

  const resetForm = () => {
    setEditUserId(null)
    setFullName('')
    setEmail('')
    setPhone('')
    setRole('field_tech')
    setPassword('')
    setIsActive(true)
  }

  const handleCreateClick = () => {
    resetForm()
    setIsOpen(true)
  }

  const handleEditClick = (u: Employee) => {
    setEditUserId(u.id)
    setFullName(u.full_name)
    setEmail(u.email)
    setPhone(u.phone ?? '')
    setRole(u.role as Role)
    setIsActive(u.is_active)
    setPassword('')
    setIsOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (body: { email: string; fullName: string; role: string; phone?: string; password: string }) =>
      authService.createUser(body),
    onSuccess: () => {
      toast.success('Çalışan eklendi')
      qc.invalidateQueries({ queryKey: ['users'] })
      setIsOpen(false)
      resetForm()
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'Çalışan eklenemedi')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { fullName: string; role: string; phone?: string; isActive: boolean; password?: string } }) =>
      authService.updateUser(id, body),
    onSuccess: () => {
      toast.success('Çalışan güncellendi')
      qc.invalidateQueries({ queryKey: ['users'] })
      setIsOpen(false)
      resetForm()
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'Çalışan güncellenemedi')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authService.deleteUser(id),
    onSuccess: () => {
      toast.success('Çalışan silindi')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'Silme işlemi başarısız')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !role) {
      toast.error('Ad Soyad ve Rol zorunludur')
      return
    }
    if (!editUserId) {
      if (!email.trim() || !password) {
        toast.error('E-posta ve Şifre zorunludur')
        return
      }
      createMutation.mutate({
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        role,
        phone: phone.trim() || undefined,
        password,
      })
    } else {
      updateMutation.mutate({
        id: editUserId,
        body: {
          fullName: fullName.trim(),
          role,
          phone: phone.trim() || undefined,
          isActive,
          ...(password ? { password } : {}),
        },
      })
    }
  }

  const handleDelete = (u: Employee) => {
    if (u.id === currentUser?.id) {
      toast.error('Kendinizi silemezsiniz')
      return
    }
    if (window.confirm(`${u.full_name} isimli çalışanı silmek istediğinizden emin misiniz?`)) {
      deleteMutation.mutate(u.id)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    fieldTechs: users.filter((u) => u.role === 'field_tech' || u.role === 'courier').length,
    labStaff: users.filter((u) => u.role === 'lab_technician' || u.role === 'qc_engineer').length,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white p-3 md:p-4 rounded-xl border border-slate-200 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserIcon className="w-5 h-5 md:w-6 md:h-6 text-blue-600 shrink-0" />
            <span className="truncate">Çalışanlar</span>
          </h1>
          <p className="text-slate-500 text-xs md:text-sm truncate">Tüm çalışanların yönetimi, rol ve performans takibi</p>
        </div>
        <button
          onClick={handleCreateClick}
          className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs md:text-sm font-semibold transition-all shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Yeni Çalışan Ekle</span><span className="sm:hidden">Yeni Çalışan</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        <StatPill icon={<UserIcon className="w-4 h-4" />} label="Toplam" value={stats.total} color="blue" />
        <StatPill icon={<CheckCircle2 className="w-4 h-4" />} label="Aktif" value={stats.active} color="emerald" />
        <StatPill icon={<Activity className="w-4 h-4" />} label="Saha Personeli" value={stats.fieldTechs} color="amber" />
        <StatPill icon={<ShieldCheck className="w-4 h-4" />} label="Lab / QC" value={stats.labStaff} color="indigo" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto scroll-touch">
          <table className="w-full text-xs sm:text-sm text-left min-w-[640px]">
            <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase border-b">
              <tr>
                <th className="p-4">Çalışan</th>
                <th className="p-4">İletişim</th>
                <th className="p-4">Rol</th>
                <th className="p-4 text-center">Aktif Numune</th>
                <th className="p-4 text-center">Tamamlanan</th>
                <th className="p-4 text-center">Durum</th>
                <th className="p-4 text-center">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">Yükleniyor...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Henüz çalışan eklenmemiş. "Yeni Çalışan Ekle" ile başlayın.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <tr key={u.id} className={`hover:bg-slate-50/50 ${!u.is_active ? 'opacity-60' : ''}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${ROLE_COLORS[u.role] ?? 'bg-slate-100 text-slate-700'}`}>
                            {u.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                              {u.full_name}
                              {isSelf && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">SİZ</span>}
                            </div>
                            <div className="text-xs text-slate-500 font-mono truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">
                        {u.phone ? (
                          <a
                            href={`tel:${u.phone}`}
                            className="inline-flex items-center gap-1.5 text-sm font-mono text-blue-700 hover:text-blue-900 hover:underline"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {u.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role] ?? 'bg-slate-100 text-slate-700'}`}>
                          {ROLE_LABELS[u.role as Role] ?? u.role}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-full text-sm font-bold font-mono ${
                          u.active_count > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {u.active_count}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-full text-sm font-bold font-mono bg-emerald-100 text-emerald-800">
                          {u.completed_count}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                            <XCircle className="w-3.5 h-3.5" /> Pasif
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditClick(u)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                          >
                            <Edit className="w-3 h-3" /> Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(u)}
                            disabled={isSelf || deleteMutation.isPending}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={isSelf ? 'Kendinizi silemezsiniz' : 'Çalışanı sil'}
                          >
                            <Trash2 className="w-3 h-3" /> Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {editUserId ? 'Çalışanı Düzenle' : 'Yeni Çalışan Ekle'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {editUserId
                  ? 'Bilgileri güncelleyin. Şifre boş bırakılırsa değişmez.'
                  : 'Yeni çalışan için tüm bilgileri girin'}
              </p>
            </div>

            <div className="space-y-3.5">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Ad Soyad *</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ahmet Yılmaz"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> E-posta {!editUserId && '*'}
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@firma.com"
                  disabled={!!editUserId}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                  required={!editUserId}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Cep Telefonu
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0532 123 45 67"
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Rol *</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                    required
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Şifre {!editUserId && '*'}
                  {editUserId && <span className="text-[10px] text-slate-400 font-normal ml-1">(boş bırakırsanız değişmez)</span>}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editUserId ? '••••••' : 'En az 6 karakter'}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                  required={!editUserId}
                  minLength={editUserId ? 0 : 6}
                />
              </label>

              {editUserId && (
                <label className="block flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">Çalışan Aktif (pasif ise giriş yapamaz)</span>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  resetForm()
                }}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all disabled:opacity-50"
              >
                {isPending ? 'Kaydediliyor...' : editUserId ? 'Değişiklikleri Kaydet' : 'Çalışanı Ekle'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: 'blue' | 'emerald' | 'amber' | 'indigo' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  }
  return (
    <div className={`rounded-xl p-3 border ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</span>
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
    </div>
  )
}
