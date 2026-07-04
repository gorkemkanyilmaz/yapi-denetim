import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '@/services/domain-api'
import { samplesApi } from '@/services/samples-api'
import { toast } from 'sonner'
import { AlertTriangle, TrendingUp, Wallet, FlaskConical, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { formatCurrency, formatDate, statusLabel } from '@/utils/utils'
import L from 'leaflet'
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png'
// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

export function DashboardHome() {
  const qc = useQueryClient()
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => dashboardApi.stats() })
  const { data: fin } = useQuery({ queryKey: ['financial'], queryFn: () => dashboardApi.financial() })
  const { data: map } = useQuery({ queryKey: ['map'], queryFn: () => dashboardApi.map() })
  const { data: bypassData } = useQuery({ queryKey: ['bypass-requests'], queryFn: () => samplesApi.listBypassRequests() })

  const bypassRequests = bypassData?.data ?? []

  const approveBypassMutation = useMutation({
    mutationFn: (id: string) => samplesApi.approveBypassRequest(id),
    onSuccess: () => {
      toast.success('Bypass talebi onaylandı')
      qc.invalidateQueries({ queryKey: ['bypass-requests'] })
    },
    onError: () => {
      toast.error('Onay işlemi gerçekleştirilemedi')
    }
  })

  const s = stats?.data?.samples
  const f = stats?.data?.financial
  const sl = stats?.data?.sla
  const moldCritical = Number(sl?.mold_critical ?? 0)
  const specimenCritical = Number(sl?.critical_sla_violations ?? 0)
  const totalCritical = moldCritical + specimenCritical
  const sites = (map?.data?.sites ?? []) as Array<{ id: string; name: string; latitude: number; longitude: number; yif_no: string; address: string }>
  const firstSite = sites[0]
  const center: [number, number] = firstSite ? [Number(firstSite.latitude), Number(firstSite.longitude)] : [39.92, 32.85]

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Kontrol Merkezi</h1>
        <p className="text-slate-500 text-xs md:text-sm">Tüm operasyonel ve finansal göstergeler</p>
      </div>

      {totalCritical > 0 && (
        <div className="bg-red-600 text-white rounded-xl p-3.5 md:p-4 flex items-center gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm md:text-base">KRİTİK SLA İHLALİ</div>
            <div className="text-xs md:text-sm truncate">
              {totalCritical} numune acil müdahale bekliyor
              {moldCritical > 0 && ` (${moldCritical} mold/kür SLA)`}
            </div>
          </div>
          <Link to="/calendar" className="bg-white text-red-600 px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold shrink-0">İncele</Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={<FlaskConical className="w-4 h-4 md:w-5 md:h-5" />} title="Bekleyen Toplama" value={s?.pending_collection ?? 0} color="blue" />
        <StatCard icon={<MapPin className="w-4 h-4 md:w-5 md:h-5" />} title="Transferde" value={s?.in_transit ?? 0} color="indigo" />
        <StatCard icon={<TrendingUp className="w-4 h-4 md:w-5 md:h-5" />} title="Kürde" value={s?.in_curing ?? 0} color="cyan" />
        <StatCard icon={<AlertTriangle className="w-4 h-4 md:w-5 md:h-5" />} title="Kritik SLA" value={totalCritical} color="red" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={<FlaskConical className="w-4 h-4 md:w-5 md:h-5" />} title="Bugün Toplanan" value={stats?.data?.periodicStats?.dailyCollected ?? 0} color="blue" />
        <StatCard icon={<FlaskConical className="w-4 h-4 md:w-5 md:h-5" />} title="Bu Ay Toplanan" value={stats?.data?.periodicStats?.monthlyCollected ?? 0} color="indigo" />
        <StatCard icon={<FlaskConical className="w-4 h-4 md:w-5 md:h-5" />} title="Bugün Kırılan" value={stats?.data?.periodicStats?.dailyCrushed ?? 0} color="cyan" />
        <StatCard icon={<FlaskConical className="w-4 h-4 md:w-5 md:h-5" />} title="Bu Ay Kırılan" value={stats?.data?.periodicStats?.monthlyCrushed ?? 0} color="indigo" />
      </div>

      <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200">
        <h2 className="font-semibold mb-3 md:mb-4 text-slate-800 flex items-center gap-2 text-sm md:text-base">
          <FlaskConical className="w-4 h-4 text-blue-600" /> İş Akışı Durum Takibi
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 md:gap-3">
          {(['created', 'collected', 'in_transit', 'received', 'in_curing', 'scheduled_for_test', 'tested', 'approved', 'archived'] as const).map((st) => {
            const statusLabelsMap: Record<string, { label: string; color: string }> = {
              created: { label: 'Yeni Görev', color: 'bg-slate-50 border-slate-200' },
              collected: { label: 'Saha Toplandı', color: 'bg-amber-50 border-amber-200' },
              in_transit: { label: 'Kuryede / Yolda', color: 'bg-blue-50 border-blue-200' },
              received: { label: 'Teslim Alındı', color: 'bg-indigo-50 border-indigo-200' },
              in_curing: { label: 'Kür Havuzunda', color: 'bg-cyan-50 border-cyan-200' },
              scheduled_for_test: { label: 'Kırım Planlandı', color: 'bg-purple-50 border-purple-200' },
              tested: { label: 'Test Edildi (Kırıldı)', color: 'bg-emerald-50 border-emerald-200' },
              approved: { label: 'Onaylandı', color: 'bg-green-50 border-green-200' },
              archived: { label: 'Arşivlendi', color: 'bg-gray-50 border-gray-200' },
            }
            const info = statusLabelsMap[st] || { label: st, color: 'bg-slate-50 border-slate-200' }
            const count = stats?.data?.statusCounts?.[st] ?? 0
            return (
              <div key={st} className={`flex flex-col items-center justify-between p-3 rounded-xl border ${info.color} hover:shadow-sm transition-all text-center`}>
                <div className="text-2xl font-extrabold text-slate-800">{count}</div>
                <div className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">{info.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200 lg:col-span-2">
          <h2 className="font-semibold mb-3 flex items-center gap-2 text-sm md:text-base"><MapPin className="w-4 h-4" /> Şantiye Haritası</h2>
          <div className="h-56 sm:h-72 rounded-lg overflow-hidden">
            {map?.data ? (
              <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {sites.map((s) => (
                  <Marker key={s.id} position={[Number(s.latitude), Number(s.longitude)]}>
                    <Popup>
                      <div className="text-sm">
                        <div className="font-bold">{s.name}</div>
                        <div>YİF: {s.yif_no}</div>
                        <div>{s.address}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-slate-100 text-slate-400">
                Harita yükleniyor...
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200">
          <h2 className="font-semibold mb-3 flex items-center gap-2 text-sm md:text-base"><Wallet className="w-4 h-4" /> Finansal Durum</h2>
          <div className="space-y-3">
            <FinancialRow label="Bekleyen" value={f?.pending_try} color="amber" />
            <FinancialRow label="Faturalandı" value={f?.invoiced_try} color="blue" />
            <FinancialRow label="Tahsil Edildi" value={f?.paid_try} color="green" />
          </div>
        </div>
      </div>

      {bypassRequests.length > 0 && (
        <div className="bg-white rounded-xl p-4 md:p-5 border border-red-200 shadow-sm">
          <h2 className="font-semibold mb-3 flex items-center gap-2 text-red-800 text-sm md:text-base">
            <AlertTriangle className="w-4 h-4 text-red-600" /> Şantiye Dışı Giriş Onay Talepleri
          </h2>
          <div className="divide-y divide-slate-100">
            {bypassRequests.map((r: any) => (
              <div key={r.id} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-sm md:text-base truncate">{r.site_name}</div>
                  <div className="text-xs text-slate-500">
                    Saha Elemanı: <strong className="text-slate-700">{r.requester_name}</strong> • Mesafe: <span className="text-red-600 font-semibold">{r.distance_m}m</span> (YİF: {r.yif_no})
                  </div>
                  <div className="text-xs font-mono bg-slate-100 text-slate-800 rounded px-1.5 py-0.5 inline-block mt-1">
                    Onay Kodu: {r.token}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => approveBypassMutation.mutate(r.id)}
                  disabled={approveBypassMutation.isPending}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 shrink-0"
                >
                  {approveBypassMutation.isPending ? 'Onaylanıyor...' : 'Onayla'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200">
        <h2 className="font-semibold mb-3 text-sm md:text-base">Son Hakedişler</h2>
        <div className="overflow-x-auto scroll-touch">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b">
              <tr><th className="text-left p-2">YİF</th><th className="text-left p-2">Dönem</th><th className="text-right p-2">Numune</th><th className="text-right p-2">Tutar</th><th className="text-left p-2">Durum</th></tr>
            </thead>
            <tbody>
              {((fin?.data ?? []) as Array<{ id: string; yif_no: string; period_start: string; period_end: string; completed_samples: number; total_amount_try: string; status: string }>).slice(0, 5).map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">{h.yif_no}</td>
                  <td className="p-2">{formatDate(h.period_start)} – {formatDate(h.period_end)}</td>
                  <td className="p-2 text-right">{h.completed_samples}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(Number(h.total_amount_try))}</td>
                  <td className="p-2"><span className="text-xs px-2 py-0.5 rounded bg-slate-100">{statusLabel(h.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value, color }: { icon: React.ReactNode; title: string; value: number | string; color: string }) {
  const colors: Record<string, string> = { blue: 'bg-blue-50 text-blue-700', indigo: 'bg-indigo-50 text-indigo-700', cyan: 'bg-cyan-50 text-cyan-700', red: 'bg-red-50 text-red-700' }
  return (
    <div className="bg-white rounded-xl p-3 md:p-4 border border-slate-200">
      <div className={`inline-flex p-1.5 md:p-2 rounded-lg ${colors[color]}`}>{icon}</div>
      <div className="text-xl md:text-2xl font-bold mt-1.5 md:mt-2">{value}</div>
      <div className="text-[10px] md:text-xs text-slate-500 leading-tight">{title}</div>
    </div>
  )
}

function FinancialRow({ label, value, color }: { label: string; value: string | undefined; color: 'amber' | 'blue' | 'green' }) {
  const colors = { amber: 'text-amber-700', blue: 'text-blue-700', green: 'text-green-700' }
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`font-mono font-bold ${colors[color]}`}>{formatCurrency(Number(value ?? 0))}</span>
    </div>
  )
}
