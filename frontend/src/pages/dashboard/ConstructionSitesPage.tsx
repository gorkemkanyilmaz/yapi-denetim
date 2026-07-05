import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { samplesApi } from '@/services/samples-api'
import { toast } from 'sonner'
import { Plus, MapPin, Edit, Phone, Search, LocateFixed } from 'lucide-react'

interface GeocodingResult {
  display_name: string
  lat: string
  lon: string
}

export function ConstructionSitesPage() {
  const qc = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [editSiteId, setEditSiteId] = useState<string | null>(null)

  // Form State
  const [name, setName] = useState('')
  const [yifNo, setYifNo] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('39.9208')
  const [lng, setLng] = useState('32.8540')
  const [contractorName, setContractorName] = useState('')
  const [inspectionFirm, setInspectionFirm] = useState('')
  const [readyMixSupplier, setReadyMixSupplier] = useState('')
  const [concreteClass, setConcreteClass] = useState('C30/37')
  const [santiyeSorumlusuCep, setSantiyeSorumlusuCep] = useState('')

  // Geocoding state
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<GeocodingResult[]>([])
  const [geoLoading, setGeoLoading] = useState(false)
  const [showGeoResults, setShowGeoResults] = useState(false)
  const geoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchGeocoding = useCallback((q: string) => {
    if (geoTimeoutRef.current) clearTimeout(geoTimeoutRef.current)
    if (q.length < 3) { setGeoResults([]); setShowGeoResults(false); return }
    setGeoLoading(true)
    geoTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=tr&limit=5&accept-language=tr`, {
          headers: { 'User-Agent': 'YapiDenetim/1.0' },
        })
        const data = await res.json()
        setGeoResults(data)
        setShowGeoResults(data.length > 0)
      } catch { setGeoResults([]) }
      finally { setGeoLoading(false) }
    }, 400)
  }, [])

  const selectGeoResult = (r: GeocodingResult) => {
    setLat(r.lat)
    setLng(r.lon)
    setAddress(r.display_name)
    setGeoQuery('')
    setGeoResults([])
    setShowGeoResults(false)
  }

  // Query
  const { data: sitesData, isLoading } = useQuery({
    queryKey: ['construction-sites'],
    queryFn: () => samplesApi.listConstructionSites(),
  })
  const sites = sitesData?.data ?? []

  // Mutation for Create
  const createMutation = useMutation({
    mutationFn: (body: any) => samplesApi.createConstructionSite(body),
    onSuccess: () => {
      toast.success('Şantiye başarıyla kaydedildi')
      qc.invalidateQueries({ queryKey: ['construction-sites'] })
      setIsOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Şantiye eklenemedi')
    },
  })

  // Mutation for Update
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => samplesApi.updateConstructionSite(id, body),
    onSuccess: () => {
      toast.success('Şantiye başarıyla güncellendi')
      qc.invalidateQueries({ queryKey: ['construction-sites'] })
      setIsOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Şantiye güncellenemedi')
    },
  })

  const resetForm = () => {
    setEditSiteId(null)
    setName('')
    setYifNo('')
    setAddress('')
    setLat('39.9208')
    setLng('32.8540')
    setContractorName('')
    setInspectionFirm('')
    setReadyMixSupplier('')
    setConcreteClass('C30/37')
    setSantiyeSorumlusuCep('')
  }

  const handleEditClick = (site: any) => {
    setEditSiteId(site.id)
    setName(site.name)
    setYifNo(site.yif_no)
    setAddress(site.address)
    setLat(String(site.latitude))
    setLng(String(site.longitude))
    setContractorName(site.contractor_name || '')
    setInspectionFirm(site.inspection_firm || '')
    setReadyMixSupplier(site.ready_mix_supplier || '')
    setConcreteClass(site.concrete_class || '')
    setSantiyeSorumlusuCep(site.santiye_sorumlusu_cep || '')
    setIsOpen(true)
  }

  const handleCreateClick = () => {
    resetForm()
    setIsOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !yifNo || !address) {
      toast.error('Lütfen zorunlu alanları doldurun')
      return
    }

    const payload = {
      name,
      yifNo,
      address,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      contractorName,
      inspectionFirm,
      readyMixSupplier,
      concreteClass,
      santiyeSorumlusuCep,
    }

    if (editSiteId) {
      updateMutation.mutate({ id: editSiteId, body: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white p-3 md:p-4 rounded-xl border border-slate-200 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Şantiyeler</h1>
          <p className="text-slate-500 text-xs md:text-sm truncate">Denetim altındaki inşaat şantiyelerinin yönetimi</p>
        </div>
        <button
          onClick={handleCreateClick}
          className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs md:text-sm font-semibold transition-all shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Yeni Şantiye Ekle</span><span className="sm:hidden">Yeni Şantiye</span>
        </button>
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-slate-500">Yükleniyor...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto scroll-touch">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase border-b">
                <tr>
                  <th className="p-4">Şantiye Adı / YİF No</th>
                  <th className="p-4">Adres</th>
                  <th className="p-4">Koordinatlar</th>
                  <th className="p-4">Yüklenici</th>
                  <th className="p-4">Beton Sınıfı</th>
                  <th className="p-4">Şantiye Sorumlusu</th>
                  <th className="p-4 text-center">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sites.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Kayıtlı şantiye bulunamadı.
                    </td>
                  </tr>
                ) : (
                  sites.map((site: any) => (
                    <tr key={site.id} className="hover:bg-slate-50/50">
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">{site.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{site.yif_no}</div>
                      </td>
                      <td className="p-4 text-slate-600 max-w-xs truncate">{site.address}</td>
                      <td className="p-4 text-slate-500 font-mono text-xs">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {Number(site.latitude).toFixed(4)}, {Number(site.longitude).toFixed(4)}
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">
                        <div>{site.contractor_name || '-'}</div>
                        <div className="text-xs text-slate-400">{site.inspection_firm}</div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 font-mono">
                          {site.concrete_class || 'Belirtilmedi'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600">
                        {site.santiye_sorumlusu_cep ? (
                          <a
                            href={`tel:${site.santiye_sorumlusu_cep}`}
                            className="inline-flex items-center gap-1.5 text-sm font-mono text-blue-700 hover:text-blue-900 hover:underline"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {site.santiye_sorumlusu_cep}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleEditClick(site)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 rounded"
                        >
                          <Edit className="w-3 h-3" /> Düzenle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Site Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 transition-all">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {editSiteId ? 'Şantiyeyi Düzenle' : 'Yeni Şantiye Ekle'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">İnşaat ve yapı denetim parametrelerini girin</p>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-600">Şantiye Adı</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Çankaya Residence Projesi"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">YİF No</span>
                <input
                  type="text"
                  value={yifNo}
                  onChange={(e) => setYifNo(e.target.value)}
                  placeholder="YIF-2026-999"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Varsayılan Beton Sınıfı</span>
                <input
                  type="text"
                  value={concreteClass}
                  onChange={(e) => setConcreteClass(e.target.value)}
                  placeholder="C30/37"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                />
              </label>

              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-600">Açık Adres</span>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Huzur Mah. Cinnah Cad. No:12, Çankaya/Ankara"
                  rows={2}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                  required
                />
              </label>

              {/* Address Search with Geocoding */}
              <div className="col-span-2 relative">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <LocateFixed className="w-3 h-3" /> Adres Ara (Otomatik Koordinat)
                </span>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={geoQuery}
                    onChange={(e) => { setGeoQuery(e.target.value); searchGeocoding(e.target.value) }}
                    onFocus={() => geoResults.length > 0 && setShowGeoResults(true)}
                    onBlur={() => setTimeout(() => setShowGeoResults(false), 200)}
                    placeholder="Adres veya konum adı yazın (ör: Kızılay, Ankara)"
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 pl-9 bg-blue-50 focus:bg-white focus:border-blue-400 font-mono"
                  />
                  {geoLoading && <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-blue-500">Aranıyor...</div>}
                </div>
                {showGeoResults && geoResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {geoResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => selectGeoResult(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0 text-xs"
                      >
                        <div className="font-medium text-slate-800 line-clamp-1">{r.display_name}</div>
                        <div className="text-slate-500 font-mono text-[10px] mt-0.5">{Number(r.lat).toFixed(5)}, {Number(r.lon).toFixed(5)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Enlem (Latitude)</span>
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Boylam (Longitude)</span>
                <input
                  type="text"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                />
              </label>

              {/* Mini Map Preview */}
              {lat && lng && !isNaN(Number(lat)) && !isNaN(Number(lng)) && (
                <div className="col-span-2 rounded-lg overflow-hidden border border-slate-200 h-32">
                  <img
                    src={`https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=600x300&markers=${lat},${lng},red-pushpin`}
                    alt="Konum Önizleme"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Yüklenici Müteahhit</span>
                <input
                  type="text"
                  value={contractorName}
                  onChange={(e) => setContractorName(e.target.value)}
                  placeholder="Mesa Mesken A.Ş."
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Yapı Denetim Firması</span>
                <input
                  type="text"
                  value={inspectionFirm}
                  onChange={(e) => setInspectionFirm(e.target.value)}
                  placeholder="Başkent Yapı Denetim"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                />
              </label>

              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-600">Hazır Beton Santrali</span>
                <input
                  type="text"
                  value={readyMixSupplier}
                  onChange={(e) => setReadyMixSupplier(e.target.value)}
                  placeholder="Nuh Çimento Santrali"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                />
              </label>

              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Şantiye Sorumlusu Cep Numarası
                </span>
                <input
                  type="tel"
                  value={santiyeSorumlusuCep}
                  onChange={(e) => setSantiyeSorumlusuCep(e.target.value)}
                  placeholder="0532 123 45 67"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                />
              </label>
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
                {isPending ? 'Kaydediliyor...' : editSiteId ? 'Değişiklikleri Kaydet' : 'Şantiyeyi Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
