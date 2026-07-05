import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { samplesApi } from '@/services/samples-api'
import { Search, Eye, X, ClipboardList } from 'lucide-react'
import { formatDate, formatDateTime } from '@/utils/utils'

export function FieldReportsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)

  // Tüm tamamlanmış numune setlerini çek
  const { data, isLoading } = useQuery({
    queryKey: ['field-reports'],
    queryFn: () => samplesApi.list({ per_page: 200 }),
  })

  const allSets = (data?.data ?? []) as Array<{
    id: string; yif_no: string; concrete_class: string | null; material_type: string;
    status: string; collected_at: string | null; assigned_to: string | null;
    assigned_user_name: string | null; construction_site_name: string | null;
    ebis_protocol_no: string | null; ebis_fis_no: string | null;
    gps_lat: number | null; gps_lng: number | null; geofence_valid: boolean | null;
    notes: string | null; created_at: string;
  }>

  // Filtreleme
  const q = searchQuery.toLowerCase().trim()
  const filtered = q
    ? allSets.filter((s) =>
        s.yif_no?.toLowerCase().includes(q) ||
        s.construction_site_name?.toLowerCase().includes(q) ||
        s.assigned_user_name?.toLowerCase().includes(q) ||
        s.ebis_protocol_no?.toLowerCase().includes(q)
      )
    : allSets

  // Detay için veri çek
  const { data: detailData, isLoading: isDetailLoading } = useQuery({
    queryKey: ['sample-set-detail', detailId],
    queryFn: () => samplesApi.get(detailId!),
    enabled: !!detailId,
  })
  const detail = detailData?.data

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-blue-600" /> Saha Raporları
        </h1>
        <p className="text-slate-500 text-sm mt-1">Saha personelinin doldurduğu tüm toplama ve numune bilgileri</p>
      </div>

      {/* Arama */}
      <div className="bg-white p-3 rounded-xl border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="YİF No, şantiye adı, çalışan adı veya EBİS No ile arayın..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border-slate-300 text-sm bg-slate-50 focus:bg-white"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-slate-500">Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-slate-200 text-center text-slate-400">
          {q ? 'Arama sonucu bulunamadı' : 'Henüz saha raporu yok'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase border-b">
                <tr>
                  <th className="text-left p-3">YİF No</th>
                  <th className="text-left p-3">Şantiye</th>
                  <th className="text-left p-3">Çalışan</th>
                  <th className="text-left p-3">Malzeme</th>
                  <th className="text-center p-3">Durum</th>
                  <th className="text-left p-3">Tarih</th>
                  <th className="text-center p-3">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-mono font-semibold text-slate-900">{s.yif_no}</td>
                    <td className="p-3 text-slate-600">{s.construction_site_name ?? '-'}</td>
                    <td className="p-3 text-slate-600">{s.assigned_user_name ?? '-'}</td>
                    <td className="p-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {s.material_type?.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="p-3 text-xs text-slate-500">{formatDate(s.collected_at || s.created_at)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setDetailId(s.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                      >
                        <Eye className="w-3 h-3" /> Görüntüle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detay Modal */}
      {detailId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setDetailId(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[95vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {isDetailLoading || !detail ? (
              <div className="p-10 text-center text-slate-500">Yükleniyor...</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200 shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 font-mono">{detail.yif_no}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {detail.construction_site_name} • {detail.material_type?.toUpperCase()}
                    </div>
                  </div>
                  <button onClick={() => setDetailId(null)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Şantiye Bilgileri */}
                  <Section title="Şantiye Bilgileri">
                    <FieldRow label="Şantiye" value={detail.construction_site_name} />
                    <FieldRow label="Adres" value={detail.site_address} />
                    <FieldRow label="Yüklenici" value={detail.contractor_name} />
                    <FieldRow label="Denetim Firması" value={detail.inspection_firm} />
                    <FieldRow label="Beton Sınıfı" value={detail.concrete_class || detail.site_concrete_class} />
                    <FieldRow label="Hazır Beton" value={detail.ready_mix_supplier} />
                  </Section>

                  {/* Toplama Bilgileri */}
                  <Section title="Toplama & Saha Bilgileri">
                    <FieldRow label="EBİS Protokol" value={detail.ebis_protocol_no} />
                    <FieldRow label="EBİS Fiş No" value={detail.ebis_fis_no} />
                    <FieldRow label="Toplama Tarihi" value={detail.collected_at ? formatDateTime(detail.collected_at) : null} />
                    <FieldRow label="Toplayan" value={detail.assigned_user_name} />
                    {detail.gps_lat && <FieldRow label="GPS" value={`${Number(detail.gps_lat).toFixed(5)}, ${Number(detail.gps_lng).toFixed(5)}`} />}
                    <FieldRow label="Geofence" value={detail.geofence_valid === true ? 'Şantiye İçi' : detail.geofence_valid === false ? 'Şantiye Dışı' : null} />
                    <FieldRow label="Notlar" value={detail.notes} />
                  </Section>

                  {/* Kür Havuzu */}
                  {detail.curing_pool_name && (
                    <Section title="Kür Havuzu">
                      <FieldRow label="Havuz" value={detail.curing_pool_name} />
                      <FieldRow label="Sıcaklık" value={detail.curing_pool_temperature ? `${detail.curing_pool_temperature}°C` : null} />
                      <FieldRow label="Raf/Bölge" value={detail.curing_zone_label ? `${detail.curing_zone_label} • Kat ${detail.curing_shelf_level}` : null} />
                      <FieldRow label="Kür Başlangıç" value={detail.curing_started_at ? formatDateTime(detail.curing_started_at) : null} />
                      <FieldRow label="Kür Bitiş" value={detail.curing_ended_at ? formatDateTime(detail.curing_ended_at) : null} />
                    </Section>
                  )}

                  {/* Numuneler */}
                  {detail.specimens && detail.specimens.length > 0 && (
                    <Section title={`Numuneler (${detail.specimens.length})`}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-slate-500 border-b">
                            <tr>
                              <th className="text-left p-1.5">No</th>
                              <th className="text-left p-1.5">Yaş</th>
                              <th className="text-left p-1.5">Test</th>
                              <th className="text-right p-1.5">Yük (kN)</th>
                              <th className="text-right p-1.5">Dayanım (MPa)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detail.specimens.map((sp: any) => (
                              <tr key={sp.id}>
                                <td className="p-1.5 font-mono">#{sp.specimen_no}</td>
                                <td className="p-1.5">{sp.target_age_days}g</td>
                                <td className="p-1.5">{sp.actual_test_date ? formatDate(sp.actual_test_date) : '-'}</td>
                                <td className="p-1.5 text-right font-mono">{sp.failure_load_kn ?? '-'}</td>
                                <td className="p-1.5 text-right font-mono font-bold">{sp.compressive_strength_mpa ? Number(sp.compressive_strength_mpa).toFixed(2) : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Section>
                  )}

                  {/* İmzalar */}
                  {detail.signatures && detail.signatures.length > 0 && (
                    <Section title={`İmzalar (${detail.signatures.length})`}>
                      <div className="space-y-2">
                        {detail.signatures.map((sig: any) => (
                          <div key={sig.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs">
                            <div>
                              <div className="font-semibold">{sig.full_name}</div>
                              <div className="text-slate-500">
                                {sig.role === 'denetci_muhendis' ? 'Denetçi Mühendis' : sig.role === 'santiye_sefi' ? 'Şantiye Şefi' : 'Beton Tesisi Yetkilisi'}
                                {sig.tc_kimlik_no && ` • TC: ${sig.tc_kimlik_no}`}
                              </div>
                            </div>
                            <div className="text-slate-400">{formatDate(sig.signed_at)}</div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </div>
                <div className="p-3 border-t border-slate-200 flex justify-end shrink-0 bg-slate-50">
                  <button onClick={() => setDetailId(null)} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg">Kapat</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">{title}</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">{children}</div>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className="text-xs text-slate-900">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    created: { label: 'Yeni', cls: 'bg-slate-100 text-slate-700' },
    collected: { label: 'Toplandı', cls: 'bg-amber-100 text-amber-800' },
    in_transit: { label: 'Yolda', cls: 'bg-blue-100 text-blue-800' },
    received: { label: 'Teslim', cls: 'bg-indigo-100 text-indigo-800' },
    in_curing: { label: 'Kürde', cls: 'bg-cyan-100 text-cyan-800' },
    scheduled_for_test: { label: 'Planlandı', cls: 'bg-purple-100 text-purple-800' },
    tested: { label: 'Test Edildi', cls: 'bg-emerald-100 text-emerald-800' },
    approved: { label: 'Onaylandı', cls: 'bg-green-100 text-green-800' },
    archived: { label: 'Arşiv', cls: 'bg-gray-100 text-gray-700' },
  }
  const info = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-700' }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.cls}`}>{info.label}</span>
}
