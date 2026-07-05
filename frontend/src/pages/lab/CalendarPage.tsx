import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { specimensApi, dashboardApi } from '@/services/domain-api'
import { Calendar, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { cn, formatDate, slaColor } from '@/utils/utils'

export function CalendarPage() {
  const { data: cal } = useQuery({ queryKey: ['calendar'], queryFn: () => dashboardApi.calendar() })
  const { data: violations } = useQuery({ queryKey: ['sla-violations'], queryFn: () => specimensApi.slaViolations() })
  const items = (cal?.data ?? []) as Array<{ id: string; specimen_no: number; target_test_date: string; target_age_days: number; sla_alert: 'normal' | 'warning' | 'critical' | 'blocked'; ebis_protocol_no: string | null; yif_no: string; concrete_class: string | null; site_name: string; status: string }>
  const viols = (violations?.data ?? []) as Array<{ id: string; sla_alert: string; site_name: string; ebis_protocol_no: string | null; yif_no: string; target_age_days: number; specimen_no: number }>

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-6 h-6" /> Kırım Takvimi
        </h1>
        <p className="text-slate-500 text-sm">Renk kodlu önceliklendirme: <span className="text-red-700 font-medium">Kırmızı</span> = Bugün/Kritik, <span className="text-yellow-700 font-medium">Sarı</span> = Yarın, <span className="text-green-700 font-medium">Yeşil</span> = Gelecek</p>
      </div>

      {viols.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-800 font-semibold mb-2">
            <AlertCircle className="w-5 h-5" /> Aktif SLA İhlalleri ({viols.length})
          </div>
          <ul className="space-y-1 text-sm">
            {viols.slice(0, 5).map((v) => (
              <li key={v.id} className="flex justify-between">
                <span>{v.yif_no} • Numune #{v.specimen_no} ({v.target_age_days}g) • {v.site_name}</span>
                <Link to={`/test/${v.id}`} className="text-red-700 underline">Çöz</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((it) => {
          const date = it.target_test_date
          const colorClass =
            it.sla_alert === 'critical' || it.sla_alert === 'blocked' ? 'border-l-4 border-red-500 bg-red-50' :
            it.sla_alert === 'warning' ? 'border-l-4 border-yellow-500 bg-yellow-50' :
            'border-l-4 border-green-500 bg-green-50'
          const urgencyLabel = date === today ? 'BUGÜN' : date === tomorrow ? 'YARIN' : 'GELECEK'
          const UrgencyIcon = date === today ? AlertCircle : date === tomorrow ? Clock : CheckCircle2
          return (
            <Link
              key={it.id}
              to={`/test/${it.id}`}
              className={cn('rounded-lg p-3 hover:shadow-md transition-shadow', colorClass)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase">{urgencyLabel}</span>
                <UrgencyIcon className="w-4 h-4" />
              </div>
              <div className="font-semibold text-slate-900">{it.yif_no} • Numune #{it.specimen_no}</div>
              <div className="text-xs text-slate-600">{it.target_age_days} günlük • {formatDate(it.target_test_date)}</div>
              <div className="text-xs text-slate-500 mt-1">{it.site_name}</div>
              <div className="mt-2">
                <span className={cn('inline-block text-xs px-2 py-0.5 rounded border', slaColor(it.sla_alert))}>
                  {it.sla_alert === 'critical' ? 'Kritik' : it.sla_alert === 'warning' ? 'Uyarı' : it.sla_alert === 'blocked' ? 'Engelli' : 'Normal'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
