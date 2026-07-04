import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { reportsApi } from '@/services/domain-api'
import { samplesApi } from '@/services/samples-api'
import { FileText, Eye } from 'lucide-react'
import { ReportPreview } from '@/components/reports/ReportPreview'
import { toast } from 'sonner'

export function ReportsPage() {
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null)
  const { data: sets } = useQuery({ queryKey: ['sample-sets'], queryFn: () => samplesApi.list({ per_page: 50 }) })
  const generate = useMutation({
    mutationFn: (sampleSetId: string) => reportsApi.generate(sampleSetId),
    onSuccess: (r) => { toast.success(`Rapor üretildi: ${r.data.report_number}`) },
    onError: () => toast.error('Rapor oluşturulamadı'),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FileText className="w-6 h-6" /> Rapor Üretimi</h1>
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <label className="block text-sm font-medium mb-1">Numune Seti</label>
        <select className="w-full rounded-md border-slate-300 p-2" value={selectedSetId ?? ''} onChange={(e) => setSelectedSetId(e.target.value)}>
          <option value="">— Seçiniz —</option>
          {((sets?.data?.data ?? []) as Array<{ id: string; yif_no: string; ebis_protocol_no: string | null; concrete_class: string | null }>).map((s) => (
            <option key={s.id} value={s.id}>{s.yif_no} • {s.ebis_protocol_no ?? '-'} • {s.concrete_class ?? '-'}</option>
          ))}
        </select>
        <div className="mt-3 flex gap-2">
          <button
            disabled={!selectedSetId || generate.isPending}
            onClick={() => selectedSetId && generate.mutate(selectedSetId)}
            className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            <Eye className="w-4 h-4" /> Önizle / Üret
          </button>
        </div>
      </div>

      {selectedSetId && <ReportPreview sampleSetId={selectedSetId} />}
    </div>
  )
}
