import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { specimensApi, equipmentApi } from '@/services/domain-api'
import { Save, ArrowLeft, Calculator, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/utils/utils'

export function TestEntryPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const nav = useNavigate()

  // id bir specimen_id olabilir veya sample_set_id olabilir
  // Önce specimen olarak dene, bulamazsan sample_set olarak dene
  const { data: spec } = useQuery({
    queryKey: ['specimen', id],
    queryFn: () => specimensApi.get(id!),
    enabled: !!id,
  })

  // Eğer specimen bulunamadıysa, bu bir sample_set_id olabilir
  const specimenData = spec?.data
  const isSampleSet = id && !specimenData

  // Sample set ise, tüm numuneleri çek
  const { data: sampleSetData } = useQuery({
    queryKey: ['sample-set-specimens', id],
    queryFn: () => import('@/services/samples-api').then(m => m.samplesApi.get(id!)),
    enabled: !!isSampleSet,
  })

  const specimens = isSampleSet
    ? (sampleSetData?.data?.specimens ?? []) as Array<{
        id: string; specimen_no: number; target_age_days: number; status: string;
        compressive_strength_mpa: number | null; target_test_date: string;
        yif_no?: string; concrete_class?: string; ebis_protocol_no?: string;
      }>
    : []

  // Seçili numune (sample_set modunda)
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<string | null>(null)

  // Seçili numuneyi bul
  const activeSpecimen = isSampleSet
    ? specimens.find((sp) => sp.id === selectedSpecimenId)
    : specimenData

  const s = activeSpecimen as any

  const { data: eq } = useQuery({ queryKey: ['equipment'], queryFn: () => equipmentApi.list() })
  const equipmentList = (eq?.data ?? []) as Array<{ id: string; name: string; is_blocked: boolean; is_calibrated: boolean }>

  const [form, setForm] = useState({
    widthMm: 150, breadthMm: 150, heightMm: 300, diameterMm: 150, weightGr: 12500,
    failureLoadKn: 0, equipmentId: '', notes: '',
  })
  const [preview, setPreview] = useState<{ strength: number; area: number; density: number } | null>(null)

  const effectiveId = isSampleSet ? selectedSpecimenId : id

  const submit = useMutation({
    mutationFn: () => specimensApi.submitTestResult(effectiveId!, {
      ...form,
      breadthMm: form.breadthMm || undefined,
      diameterMm: form.diameterMm || undefined,
    }),
    onSuccess: (r) => {
      toast.success(`Kaydedildi: ${r.data.strengthMpa} MPa`)
      qc.invalidateQueries({ queryKey: ['specimen', effectiveId] })
      qc.invalidateQueries({ queryKey: ['sample-set-specimens', id] })
      if (isSampleSet) {
        setSelectedSpecimenId(null)
        setPreview(null)
      } else {
        nav('/calendar')
      }
    },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'Hata'),
  })

  function calc() {
    const area = form.diameterMm ? (Math.PI / 4) * form.diameterMm * form.diameterMm : form.widthMm * (form.breadthMm || form.widthMm)
    const strength = (form.failureLoadKn * 1000) / area
    const volume = (area * form.heightMm) / 1_000_000_000
    const density = (form.weightGr / 1000) / volume
    setPreview({ strength: Math.round(strength * 1000) / 1000, area: Math.round(area * 100) / 100, density: Math.round(density * 100) / 100 })
  }

  // Sample set modunda numune seçimi göster
  if (isSampleSet && !selectedSpecimenId) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 text-sm text-slate-600"><ArrowLeft className="w-4 h-4" /> Geri</button>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h1 className="text-xl font-bold flex items-center gap-2"><FlaskConical className="w-5 h-5 text-blue-600" /> Kırım Testi — Numune Seçimi</h1>
          <p className="text-sm text-slate-500 mt-1">Test edilecek numuneyi seçin</p>
        </div>
        {specimens.length === 0 ? (
          <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-slate-500">
            Bu set için numune bulunamadı
          </div>
        ) : (
          <div className="grid gap-2">
            {specimens.map((sp) => {
              const isTested = sp.status === 'tested' || sp.status === 'approved' || sp.status === 'archived'
              return (
                <button
                  key={sp.id}
                  onClick={() => { setSelectedSpecimenId(sp.id); setPreview(null) }}
                  disabled={isTested}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    isTested
                      ? 'bg-green-50 border-green-200 opacity-60 cursor-not-allowed'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">Numune #{sp.specimen_no} — {sp.target_age_days} Gün</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Hedef Tarih: {formatDate(sp.target_test_date)}
                        {sp.compressive_strength_mpa && ` • ${sp.compressive_strength_mpa} MPa`}
                      </div>
                    </div>
                    <div className="text-right">
                      {isTested ? (
                        <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">Test Edildi</span>
                      ) : (
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">Test Et →</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (!s) return <div className="p-8 text-center text-slate-500">Yükleniyor...</div>

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={() => isSampleSet ? setSelectedSpecimenId(null) : nav(-1)} className="flex items-center gap-1 text-sm text-slate-600"><ArrowLeft className="w-4 h-4" /> Geri</button>
      <div className="bg-white rounded-xl p-5 border border-slate-200">
        <h1 className="text-xl font-bold">Kırım Testi — Numune #{s.specimen_no}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mt-2 text-slate-600">
          <div>YİF: <span className="font-medium text-slate-900">{s.yif_no}</span></div>
          <div>EBİS: <span className="font-medium text-slate-900">{s.ebis_protocol_no ?? '-'}</span></div>
          <div>Sınıf: <span className="font-medium text-slate-900">{s.concrete_class ?? '-'}</span></div>
          <div>Hedef: <span className="font-medium text-slate-900">{s.target_age_days}g / {formatDate(s.target_test_date)}</span></div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 border border-slate-200 grid grid-cols-2 gap-3">
        <Field label="Genişlik (mm)" v={form.widthMm} onChange={(v) => setForm({ ...form, widthMm: Number(v) })} />
        <Field label="En (mm, prizma)" v={form.breadthMm} onChange={(v) => setForm({ ...form, breadthMm: Number(v) })} />
        <Field label="Yükseklik (mm)" v={form.heightMm} onChange={(v) => setForm({ ...form, heightMm: Number(v) })} />
        <Field label="Çap (mm, silindir)" v={form.diameterMm} onChange={(v) => setForm({ ...form, diameterMm: Number(v) })} />
        <Field label="Ağırlık (gr)" v={form.weightGr} onChange={(v) => setForm({ ...form, weightGr: Number(v) })} />
        <Field label="Kırım Yükü F (kN)" v={form.failureLoadKn} onChange={(v) => setForm({ ...form, failureLoadKn: Number(v) })} />
        <div>
          <label className="block text-xs font-medium text-slate-600">Cihaz</label>
          <select className="w-full rounded-md border-slate-300 p-2" value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}>
            <option value="">— Seçiniz —</option>
            {equipmentList.map((e) => (
              <option key={e.id} value={e.id} disabled={e.is_blocked || !e.is_calibrated}>
                {e.name} {e.is_blocked ? '(BLOKLU)' : e.is_calibrated ? '' : '(KALİBRASYON YOK)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button onClick={calc} className="w-full h-12 rounded-lg bg-slate-800 text-white flex items-center justify-center gap-2">
        <Calculator className="w-4 h-4" /> HESAPLA: f_c = F / A
      </button>

      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Alan (mm²)" v={preview.area.toString()} />
          <Stat label="Yoğunluk (kg/m³)" v={preview.density.toString()} />
          <Stat label="Dayanım (MPa)" v={preview.strength.toString()} />
        </div>
      )}

      <button
        disabled={!effectiveId || !form.equipmentId || form.failureLoadKn <= 0 || submit.isPending}
        onClick={() => submit.mutate()}
        className="w-full h-14 rounded-xl bg-green-600 text-white text-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Save className="w-5 h-5" /> {submit.isPending ? 'KAYDEDİLİYOR...' : 'TEST SONUCUNU KAYDET'}
      </button>
    </div>
  )
}

function Field({ label, v, onChange }: { label: string; v: number; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <input type="number" step="0.01" value={v} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border-slate-300 p-2" />
    </div>
  )
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-lg font-bold text-blue-900">{v}</div>
    </div>
  )
}
