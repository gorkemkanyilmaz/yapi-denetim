import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { curingPoolsApi } from '@/services/domain-api'
import { toast } from 'sonner'
import { Droplets, Thermometer, Plus, Edit, Power, PowerOff } from 'lucide-react'

type Pool = {
  id: string
  name: string
  capacity: number
  temperature_c: number | string
  notes: string | null
  is_active: boolean
  zone_count: string
  occupied_count: string
  zonesPerShelf?: number
}

export function CuringPoolsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['pools'], queryFn: () => curingPoolsApi.list() })
  const pools = ((data?.data ?? []) as Pool[])

  const [isOpen, setIsOpen] = useState(false)
  const [editPoolId, setEditPoolId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [temperatureC, setTemperatureC] = useState('20.0')
  const [notes, setNotes] = useState('')
  const [numShelves, setNumShelves] = useState('3')
  const [zonesPerShelf, setZonesPerShelf] = useState('5')
  const [isActive, setIsActive] = useState(true)

  const resetForm = () => {
    setEditPoolId(null)
    setName('')
    setCapacity('')
    setTemperatureC('20.0')
    setNotes('')
    setNumShelves('3')
    setZonesPerShelf('5')
    setIsActive(true)
  }

  const handleEditClick = (p: Pool) => {
    setEditPoolId(p.id)
    setName(p.name)
    setCapacity(String(p.capacity))
    setTemperatureC(String(p.temperature_c))
    setNotes(p.notes ?? '')
    setIsActive(p.is_active !== false)
    // Mevcut bölge sayısından raf/bölge tahmin et (en yakın dikdörtgen)
    const existingZones = Number(p.zone_count) || 0
    if (existingZones > 0) {
      const perShelf = Math.max(1, Number(p.zonesPerShelf) || 5)
      const shelves = Math.max(1, Math.ceil(existingZones / perShelf))
      setNumShelves(String(shelves))
      setZonesPerShelf(String(perShelf))
    }
    setIsOpen(true)
  }

  const handleCreateClick = () => {
    resetForm()
    setIsOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (body: { name: string; capacity: number; temperatureC: number; notes: string; numShelves: number; zonesPerShelf: number }) =>
      curingPoolsApi.create(body),
    onSuccess: () => {
      toast.success('Kür havuzu oluşturuldu')
      qc.invalidateQueries({ queryKey: ['pools'] })
      setIsOpen(false)
      resetForm()
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'Havuz oluşturulamadı')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; capacity: number; temperatureC: number; notes: string; isActive: boolean; numShelves?: number; zonesPerShelf?: number } }) =>
      curingPoolsApi.update(id, body),
    onSuccess: () => {
      toast.success('Kür havuzu güncellendi')
      qc.invalidateQueries({ queryKey: ['pools'] })
      setIsOpen(false)
      resetForm()
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'Havuz güncellenemedi')
    },
  })

  const updateMutationPassive = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; capacity: number; temperatureC: number; notes: string; isActive: boolean } }) =>
      curingPoolsApi.update(id, body),
    onSuccess: (_data, vars) => {
      toast.success(vars.body.isActive ? 'Havuz aktifleştirildi' : 'Havuz pasifleştirildi')
      qc.invalidateQueries({ queryKey: ['pools'] })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'İşlem başarısız')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !capacity) {
      toast.error('Ad ve Kapasite alanları zorunludur')
      return
    }
    const capNum = Number(capacity)
    const tempNum = Number(temperatureC)
    if (isNaN(capNum) || capNum <= 0) {
      toast.error('Kapasite geçerli bir sayı olmalıdır')
      return
    }
    if (isNaN(tempNum)) {
      toast.error('Sıcaklık geçerli bir sayı olmalıdır')
      return
    }

    if (editPoolId) {
      updateMutation.mutate({
        id: editPoolId,
        body: {
          name: name.trim(),
          capacity: capNum,
          temperatureC: tempNum,
          notes: notes.trim(),
          isActive,
          numShelves: Math.max(1, Number(numShelves) || 1),
          zonesPerShelf: Math.max(1, Number(zonesPerShelf) || 1),
        },
      })
    } else {
      createMutation.mutate({
        name: name.trim(),
        capacity: capNum,
        temperatureC: tempNum,
        notes: notes.trim(),
        numShelves: Math.max(1, Number(numShelves) || 1),
        zonesPerShelf: Math.max(1, Number(zonesPerShelf) || 1),
      })
    }
  }

  const toggleActive = (p: Pool) => {
    updateMutationPassive.mutate({
      id: p.id,
      body: {
        name: p.name,
        capacity: Number(p.capacity),
        temperatureC: Number(p.temperature_c),
        notes: p.notes ?? '',
        isActive: !p.is_active,
      },
    })
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white p-3 md:p-4 rounded-xl border border-slate-200 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Droplets className="w-5 h-5 md:w-6 md:h-6 text-cyan-600 shrink-0" />
            <span className="truncate">Kür Havuzları</span>
          </h1>
          <p className="text-slate-500 text-xs md:text-sm truncate">Numune kürleme havuzlarının yönetimi</p>
        </div>
        <button
          onClick={handleCreateClick}
          className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs md:text-sm font-semibold transition-all shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Yeni Havuz Ekle</span><span className="sm:hidden">Yeni Havuz</span>
        </button>
      </div>

      {pools.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">
          Henüz kür havuzu tanımlı değil. "Yeni Havuz Ekle" ile başlayın.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pools.map((p) => {
            const zones = Number(p.zone_count)
            const occupied = Number(p.occupied_count)
            const pct = zones ? Math.round((occupied / zones) * 100) : 0
            return (
              <div key={p.id} className={`bg-white rounded-xl p-5 border ${p.is_active === false ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-lg text-slate-900 truncate">{p.name}</h3>
                    <div className="text-sm text-slate-500">Kapasite: {p.capacity} numune</div>
                  </div>
                  <div className="flex items-center gap-1 text-cyan-700 bg-cyan-50 px-2 py-1 rounded">
                    <Thermometer className="w-4 h-4" />
                    <span className="text-sm font-medium">{p.temperature_c}°C</span>
                  </div>
                </div>

                {p.notes && (
                  <div className="mt-2 text-xs text-slate-500 italic line-clamp-2">{p.notes}</div>
                )}

                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Doluluk: {occupied} / {zones}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    {p.is_active === false && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Pasif
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleEditClick(p)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1.5 rounded-md transition-colors"
                    >
                      <Edit className="w-3 h-3" /> Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(p)}
                      disabled={updateMutationPassive.isPending}
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
                        p.is_active === false
                          ? 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                          : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                      }`}
                    >
                      {p.is_active === false ? (
                        <>
                          <Power className="w-3 h-3" /> Aktifleştir
                        </>
                      ) : (
                        <>
                          <PowerOff className="w-3 h-3" /> Pasifleştir
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {editPoolId ? 'Kür Havuzunu Düzenle' : 'Yeni Kür Havuzu Ekle'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {editPoolId
                  ? 'Havuzun temel özelliklerini güncelleyin'
                  : 'Yeni havuz için isim, kapasite, sıcaklık ve raf düzeni girin'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-600">Havuz Adı *</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Havuz A / Kür 1"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Kapasite (numune) *</span>
                <input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="60"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Thermometer className="w-3 h-3" /> Sıcaklık (°C)
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={temperatureC}
                  onChange={(e) => setTemperatureC(e.target.value)}
                  placeholder="20.0"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                />
              </label>

              <>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Raf Sayısı</span>
                  <input
                    type="number"
                    min={1}
                    value={numShelves}
                    onChange={(e) => setNumShelves(e.target.value)}
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Raf Başına Bölge</span>
                  <input
                    type="number"
                    min={1}
                    value={zonesPerShelf}
                    onChange={(e) => setZonesPerShelf(e.target.value)}
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                  />
                </label>
              </>

              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-600">Notlar</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Havuz konumu, özellikleri vb."
                  rows={2}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                />
              </label>

              {editPoolId && (
                <label className="block col-span-2 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">Havuz Aktif</span>
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
                {isPending ? 'Kaydediliyor...' : editPoolId ? 'Değişiklikleri Kaydet' : 'Havuzu Oluştur'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
