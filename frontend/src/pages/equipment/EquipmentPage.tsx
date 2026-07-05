import { useQuery } from '@tanstack/react-query'
import { equipmentApi } from '@/services/domain-api'
import { Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatDate } from '@/utils/utils'

export function EquipmentPage() {
  const { data } = useQuery({ queryKey: ['equipment'], queryFn: () => equipmentApi.list() })
  const eq = (data?.data ?? []) as Array<{ id: string; name: string; serial_number: string; equipment_type: string; calibration_expiry_date: string; is_calibrated: boolean; is_blocked: boolean }>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="w-6 h-6" /> Cihazlar & Kalibrasyon</h1>
      <div className="grid gap-3">
        {eq.map((e) => {
          const exp = new Date(e.calibration_expiry_date + 'T00:00:00')
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const days = Math.floor((exp.getTime() - today.getTime()) / 86400000)
          const state = e.is_blocked ? 'blocked' : days < 0 ? 'expired' : days < 30 ? 'expiring' : 'ok'
          const styles = {
            ok: 'border-green-300 bg-green-50',
            expiring: 'border-yellow-300 bg-yellow-50',
            expired: 'border-red-300 bg-red-50',
            blocked: 'border-red-400 bg-red-100',
          }
          const Icons = { ok: CheckCircle2, expiring: AlertTriangle, expired: AlertTriangle, blocked: AlertTriangle }
          const Icon = Icons[state]
          return (
            <div key={e.id} className={`p-4 rounded-lg border-2 ${styles[state]}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{e.name}</h3>
                  <div className="text-xs text-slate-600 mt-0.5">SN: {e.serial_number} • {e.equipment_type}</div>
                </div>
                <Icon className={`w-5 h-5 ${state === 'ok' ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div className="mt-2 text-sm">
                Kalibrasyon Bitiş: <span className="font-medium">{formatDate(e.calibration_expiry_date)}</span>
                <span className="ml-2 text-slate-500">
                  ({days >= 0 ? `${days} gün kaldı` : `${Math.abs(days)} gün geçti`})
                </span>
              </div>
              {e.is_blocked && <div className="mt-2 text-xs font-bold text-red-700">⛔ CİHAZ BLOKLU - TEST KAYDI YAPILAMAZ</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
