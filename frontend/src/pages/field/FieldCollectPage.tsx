import { useState, useRef, useCallback } from 'react'
import { Camera, MapPin, Upload, AlertTriangle, CheckCircle2, Edit, ClipboardList } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fieldApi } from '@/services/domain-api'
import { samplesApi, type SampleSet } from '@/services/samples-api'
import { enqueueOp } from '@/services/offline-queue'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'

interface GpsFix { lat: number; lng: number; accuracyM: number }

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function FieldCollectPage() {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const [selectedSet, setSelectedSet] = useState<SampleSet | null>(null)
  const [gps, setGps] = useState<GpsFix | null>(null)
  const [ocrResult, setOcrResult] = useState<Awaited<ReturnType<typeof fieldApi.ocr>> | null>(null)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [stakeholders, setStakeholders] = useState<Record<string, { name: string; tc: string }>>({
    denetci_muhendis: { name: '', tc: '' },
    santiye_sefi: { name: '', tc: '' },
    beton_tesisi_yetkilisi: { name: '', tc: '' }
  })
  const [oobBlocked, setOobBlocked] = useState<{ distanceM: number; thresholdM: number; token?: string } | null>(null)
  const [managerBypassToken, setManagerBypassToken] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  // Manual inputs states
  const [protocolNo, setProtocolNo] = useState('')
  const [fisNo, setFisNo] = useState('')
  const [yifNo, setYifNo] = useState('')
  const [concreteClass, setConcreteClass] = useState('')
  const [castingTime, setCastingTime] = useState('')
  const [isManualEntry, setIsManualEntry] = useState(false)
  const [isManualGps, setIsManualGps] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  
  // Work Assignment Filtering
  const [onlyMyAssignments, setOnlyMyAssignments] = useState(true)

  const setsQuery = useQuery({
    queryKey: ['field-sample-sets', tenant?.id],
    queryFn: () => samplesApi.list({ status: 'created' }),
    enabled: !!user,
  })

  const ocrMutation = useMutation({
    mutationFn: (file: File) => fieldApi.ocr(file),
    onSuccess: (d) => {
      const res = d.data
      setOcrResult(res)
      setProtocolNo(res.protocol_no ?? '')
      setFisNo(res.fis_no ?? '')
      setYifNo(res.yif_no ?? '')
      setConcreteClass(res.beton_sinifi ?? '')
      setCastingTime(res.dokum_saati ?? '')
      toast.success('Fiş okundu')
    },
    onError: () => toast.error('OCR başarısız'),
  })

  const collectMutation = useMutation({
    mutationFn: async (bypassToken?: string) => {
      if (!selectedSet || !gps) throw new Error('Eksik bilgi')
      await fieldApi.create({
        sampleSetId: selectedSet.id,
        gps: { lat: gps.lat, lng: gps.lng, accuracyM: gps.accuracyM },
        photos: photoDataUrl ? [photoDataUrl] : [],
        ocrText: ocrResult?.raw_text || 'Manuel Giriş',
      })

      // Save stakeholders in DB
      for (const role of ['denetci_muhendis', 'santiye_sefi', 'beton_tesisi_yetkilisi'] as const) {
        const sh = stakeholders[role]
        if (sh && sh.name) {
          await samplesApi.addSignature(selectedSet.id, {
            role,
            fullName: sh.name,
            tcKimlikNo: sh.tc || undefined,
            signatureSvg: '<svg></svg>',
          })
        }
      }

      return samplesApi.transition(selectedSet.id, 'collected', {
        gps: { lat: gps.lat, lng: gps.lng, accuracyM: gps.accuracyM },
        ebisProtocolNo: protocolNo || undefined,
        ebisFisNo: fisNo || undefined,
        concreteClass: concreteClass || undefined,
        managerBypassToken: bypassToken,
      })
    },
    onSuccess: () => {
      toast.success('Toplama kaydı ve durum geçişi tamam')
      setOobBlocked(null)
      setManagerBypassToken('')
      // Clear forms
      setSelectedSet(null)
      setGps(null)
      setOcrResult(null)
      setPhotoDataUrl(null)
      setProtocolNo('')
      setFisNo('')
      setYifNo('')
      setConcreteClass('')
      setCastingTime('')
      setIsManualEntry(false)
      setIsManualGps(false)
      setManualLat('')
      setManualLng('')
      setStakeholders({
        denetci_muhendis: { name: '', tc: '' },
        santiye_sefi: { name: '', tc: '' },
        beton_tesisi_yetkilisi: { name: '', tc: '' }
      })
    },
    onError: (e: { response?: { status?: number; data?: { code?: string; geofence?: { distanceM: number; thresholdM: number; token?: string } } } }) => {
      const code = e?.response?.data?.code
      if (e?.response?.status === 403 && code === 'OUT_OF_BOUNDS') {
        setOobBlocked(e.response.data?.geofence ?? { distanceM: 0, thresholdM: 200, token: '' })
        toast.error('Şantiye dışı giriş — yönetici bypass onayı gerekli')
      } else if (code === 'INVALID_EBIS_FORMAT') {
        toast.error('EBİS fiş formatı geçersiz — kontrol edin veya tekrar OCR yapın')
      } else {
        toast.error('Hata oluştu')
      }
    },
  })

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('GPS desteklenmiyor. Lütfen konumu manuel girin.')
      setIsManualGps(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy })
        setIsManualGps(false)
      },
      (err) => {
        toast.error(`GPS alınamadı: ${err.message}. Manuel girişi kullanabilirsiniz.`)
        setIsManualGps(true)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  const applyManualGps = () => {
    const latNum = parseFloat(manualLat)
    const lngNum = parseFloat(manualLng)
    if (isNaN(latNum) || isNaN(lngNum)) {
      toast.error('Geçersiz enlem veya boylam değeri')
      return
    }
    setGps({ lat: latNum, lng: lngNum, accuracyM: 10 })
    toast.success('Manuel konum uygulandı')
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setPhotoDataUrl(reader.result as string)
    reader.readAsDataURL(f)
  }

  async function onOcrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!navigator.onLine) {
      toast.error('OCR için çevrimiçi olun')
      return
    }
    ocrMutation.mutate(f)
  }

  async function submitCollection() {
    if (!selectedSet || !gps) { toast.error('Önce set ve GPS seçin'); return }
    if (!navigator.onLine) {
      await enqueueOp({
        idempotencyKey: uuid(),
        endpoint: '/field-collections',
        method: 'POST',
        payload: {
          sampleSetId: selectedSet.id,
          gps,
          photos: photoDataUrl ? [photoDataUrl] : [],
          ocrText: ocrResult?.raw_text || 'Manuel Giriş',
          ebisProtocolNo: protocolNo || undefined,
          ebisFisNo: fisNo || undefined,
          concreteClass: concreteClass || undefined,
        },
      })
      for (const role of ['denetci_muhendis', 'santiye_sefi', 'beton_tesisi_yetkilisi'] as const) {
        const sh = stakeholders[role]
        if (sh && sh.name) {
          await enqueueOp({
            idempotencyKey: uuid(),
            endpoint: `/samples/${selectedSet.id}/signatures`,
            method: 'POST',
            payload: {
              role,
              fullName: sh.name,
              tcKimlikNo: sh.tc || undefined,
              signatureSvg: '<svg></svg>',
            }
          })
        }
      }
      toast.success('Çevrimdışı kuyruğa eklendi (geçiş çevrimiçi iken işlenecek)')
      return
    }
    collectMutation.mutate(managerBypassToken || undefined)
  }

  // Filter list of sample sets by assignment
  const filteredSets = (setsQuery.data?.data ?? []).filter((s: any) => {
    if (onlyMyAssignments && (user?.role === 'field_tech' || user?.role === 'courier')) {
      return s.assigned_to === user.id
    }
    return true
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <label className="block flex-1">
            <span className="text-sm font-medium text-slate-700">Numune Seti</span>
            <select
              className="mt-1 w-full rounded-lg border-slate-300 text-base p-3"
              value={selectedSet?.id ?? ''}
              onChange={(e) => {
                const found = setsQuery.data?.data?.find((s: SampleSet) => s.id === e.target.value) ?? null
                setSelectedSet(found)
                if (found) {
                  setYifNo(found.yif_no || '')
                  setConcreteClass(found.concrete_class || '')
                }
              }}
            >
              <option value="">— Seçiniz —</option>
              {filteredSets.map((s: SampleSet) => (
                <option key={s.id} value={s.id}>
                  {s.yif_no} • {s.material_type} • {s.concrete_class ?? '-'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedSet && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <h4 className="font-bold text-blue-900 flex items-center gap-1.5 text-sm">
              <ClipboardList className="w-4 h-4 text-blue-600" /> Numune Toplama Talimatı
            </h4>
            <div className="text-xs text-blue-800 space-y-1">
              <div>• <strong>Malzeme Türü:</strong> {selectedSet.material_type === 'concrete' ? 'Beton' : selectedSet.material_type === 'steel' ? 'Çelik/Demir' : selectedSet.material_type === 'soil' ? 'Zemin' : 'Agrega'}</div>
              {selectedSet.concrete_class && (
                <div>• <strong>Beton Sınıfı:</strong> {selectedSet.concrete_class}</div>
              )}
              <div>• <strong>Alınması Gereken Adet:</strong> <strong className="text-blue-900 text-sm">{selectedSet.material_type === 'concrete' ? '6 Silindir (3 adet 7-Günlük, 3 adet 28-Günlük)' : '3 Adet'}</strong></div>
              <div className="mt-2 text-[11px] text-blue-600 font-medium">Lütfen döküm alanına ulaştığınızda konumunuzu doğrulayın, beton döküm fişinin fotoğrafını/OCR'ını çekin ve döküm imzasını tamamlayın.</div>
            </div>
          </div>
        )}

        {/* Assignment Filter Switch */}
        {(user?.role === 'field_tech' || user?.role === 'courier') && (
          <label className="flex items-center gap-2 text-sm text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={onlyMyAssignments}
              onChange={(e) => setOnlyMyAssignments(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Sadece bana atanan işleri listele</span>
          </label>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={requestGps}
          className="flex-1 h-16 rounded-xl bg-blue-600 text-white text-lg font-semibold flex items-center justify-center gap-2 active:bg-blue-700"
        >
          <MapPin className="w-6 h-6" />
          {gps ? `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${gps.accuracyM.toFixed(0)}m)` : 'GPS KONUMU AL'}
        </button>
        <button
          onClick={() => setIsManualGps(!isManualGps)}
          className="px-4 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 flex items-center justify-center"
          title="Manuel Konum Gir"
        >
          <Edit className="w-5 h-5" />
        </button>
      </div>

      {isManualGps && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Manuel Konum Girişi
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-amber-700">Enlem (Latitude)</span>
              <input
                type="text"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="39.920"
                className="mt-1 w-full rounded-md border-amber-300 text-sm p-2 bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-amber-700">Boylam (Longitude)</span>
              <input
                type="text"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="32.850"
                className="mt-1 w-full rounded-md border-amber-300 text-sm p-2 bg-white"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={applyManualGps}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-3 rounded-md text-sm transition-colors"
          >
            Konumu Kaydet & Uygula
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => photoRef.current?.click()}
          className="h-20 rounded-xl bg-white border-2 border-dashed border-slate-300 text-slate-700 flex flex-col items-center justify-center gap-1"
        >
          <Camera className="w-6 h-6" />
          <span className="text-xs">{photoDataUrl ? 'Fotoğraf ✓' : 'Döküm Fotoğrafı'}</span>
        </button>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />

        <button
          onClick={() => fileRef.current?.click()}
          className="h-20 rounded-xl bg-white border-2 border-dashed border-slate-300 text-slate-700 flex flex-col items-center justify-center gap-1"
        >
          <Upload className="w-6 h-6" />
          <span className="text-xs">{ocrMutation.isPending ? 'Okunuyor...' : 'EBİS Fiş OCR'}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onOcrFile} />
      </div>

      {/* Manual receipt entry & edit form */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Fiş Bilgileri</span>
          <button
            type="button"
            onClick={() => setIsManualEntry(!isManualEntry)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            {isManualEntry ? 'Kapat' : 'Manuel Ekle / Düzenle'}
          </button>
        </div>

        {(ocrResult || isManualEntry) && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Tutanak No</span>
                <input
                  type="text"
                  value={protocolNo}
                  onChange={(e) => setProtocolNo(e.target.value)}
                  placeholder="TR-2026-000123"
                  className="mt-1 w-full rounded-md border-slate-300 text-sm p-2 bg-slate-50 focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Fiş No</span>
                <input
                  type="text"
                  value={fisNo}
                  onChange={(e) => setFisNo(e.target.value)}
                  placeholder="FIS-2026-000123"
                  className="mt-1 w-full rounded-md border-slate-300 text-sm p-2 bg-slate-50 focus:bg-white"
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block col-span-1">
                <span className="text-xs font-medium text-slate-500">YİF No</span>
                <input
                  type="text"
                  value={yifNo}
                  onChange={(e) => setYifNo(e.target.value)}
                  placeholder="YIF-2026-001"
                  className="mt-1 w-full rounded-md border-slate-300 text-sm p-2 bg-slate-50 focus:bg-white"
                />
              </label>
              <label className="block col-span-1">
                <span className="text-xs font-medium text-slate-500">Beton Sınıfı</span>
                <input
                  type="text"
                  value={concreteClass}
                  onChange={(e) => setConcreteClass(e.target.value)}
                  placeholder="C30/37"
                  className="mt-1 w-full rounded-md border-slate-300 text-sm p-2 bg-slate-50 focus:bg-white"
                />
              </label>
              <label className="block col-span-1">
                <span className="text-xs font-medium text-slate-500">Döküm Saati</span>
                <input
                  type="text"
                  value={castingTime}
                  onChange={(e) => setCastingTime(e.target.value)}
                  placeholder="14:30"
                  className="mt-1 w-full rounded-md border-slate-300 text-sm p-2 bg-slate-50 focus:bg-white"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {gps && (
        <GeofenceBadge siteId={selectedSet?.construction_site_id} lat={gps.lat} lng={gps.lng} />
      )}

      {photoDataUrl && (
        <img src={photoDataUrl} alt="Döküm" className="rounded-xl w-full max-h-60 object-cover" />
      )}

      <div className="space-y-4 bg-white p-4 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-900 text-sm border-b pb-2">
          Saha Yetkilileri Bilgileri (Ad-Soyad / TC)
        </h3>
        
        <div className="space-y-3.5 divide-y divide-slate-100">
          {(['denetci_muhendis', 'santiye_sefi', 'beton_tesisi_yetkilisi'] as const).map((role, idx) => {
            const roleLabels: Record<string, string> = {
              denetci_muhendis: 'Denetçi Mühendis',
              santiye_sefi: 'Şantiye Şefi',
              beton_tesisi_yetkilisi: 'Beton Tesisi Yetkilisi'
            }
            return (
              <div key={role} className={idx > 0 ? "pt-3.5 space-y-2" : "space-y-2"}>
                <div className="text-xs font-bold text-slate-700">{roleLabels[role]}</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] font-medium text-slate-500">Ad Soyad</span>
                    <input
                      type="text"
                      value={stakeholders[role]?.name ?? ''}
                      onChange={(e) => setStakeholders(s => ({
                        ...s,
                        [role]: { name: e.target.value, tc: s[role]?.tc ?? '' }
                      }))}
                      placeholder="Ad Soyad"
                      className="mt-1 w-full rounded-md border-slate-300 text-xs p-2 bg-slate-50 focus:bg-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-slate-500">T.C. Kimlik No</span>
                    <input
                      type="text"
                      maxLength={11}
                      value={stakeholders[role]?.tc ?? ''}
                      onChange={(e) => setStakeholders(s => ({
                        ...s,
                        [role]: { name: s[role]?.name ?? '', tc: e.target.value }
                      }))}
                      placeholder="11 haneli TC"
                      className="mt-1 w-full rounded-md border-slate-300 text-xs p-2 bg-slate-50 focus:bg-white font-mono"
                    />
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {oobBlocked && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-800 font-semibold">
            <AlertTriangle className="w-5 h-5" /> Şantiye Dışı Giriş Engellendi
          </div>
          <p className="text-sm text-red-700">
            Konum şantiye alanı dışında: {oobBlocked.distanceM}m &gt; {oobBlocked.thresholdM}m.
            Devam etmek için yönetici onayı gereklidir.
          </p>
          {oobBlocked.token && (
            <div className="text-sm text-red-900 bg-red-100/60 p-3 rounded-lg border border-red-200">
              Oluşturulan Talep Kodu: <strong className="font-mono text-base bg-red-200/50 px-2 py-0.5 rounded">{oobBlocked.token}</strong>
              <p className="text-xs text-red-700 mt-1">Bu kodu yöneticinize iletin. Yönetici onayladığında, formu doğrudan tekrar göndererek devam edebilirsiniz.</p>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-red-800 block">Alternatif: Manuel Bypass Kodu Girin</label>
            <input
              value={managerBypassToken}
              onChange={(e) => setManagerBypassToken(e.target.value)}
              placeholder="Yönetici bypass token (örn: BP-XXXX)"
              className="w-full rounded-md border-red-300 p-2 text-sm bg-white"
            />
          </div>
        </div>
      )}

      <button
        disabled={!selectedSet || !gps || collectMutation.isPending}
        onClick={submitCollection}
        className="w-full h-16 rounded-xl bg-green-600 text-white text-lg font-bold disabled:opacity-50 active:bg-green-700"
      >
        {collectMutation.isPending ? 'GÖNDERİLİYOR...' : oobBlocked ? 'YÖNETİCİ ONAYI İLE GÖNDER' : 'TOPLAMA KAYDI OLUŞTUR'}
      </button>
    </div>
  )
}


function GeofenceBadge({ siteId, lat, lng }: { siteId?: string; lat: number; lng: number }) {
  const { data } = useQuery({
    queryKey: ['geofence', siteId, lat, lng],
    queryFn: () => fieldApi.validateGeofence({ siteId: siteId!, lat, lng }),
    enabled: !!siteId,
  })
  if (!data?.data) return null
  const { valid, distanceM, thresholdM } = data.data
  return (
    <div className={`rounded-xl p-3 flex items-center gap-2 text-sm font-medium ${valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
      {valid ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
      <span>
        Şantiye Mesafesi: {distanceM}m / {thresholdM}m {valid ? '— Uygun' : '— Şantiye Dışı!'}
      </span>
    </div>
  )
}
