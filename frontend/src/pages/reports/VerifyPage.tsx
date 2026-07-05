import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/services/domain-api'
import { FileText } from 'lucide-react'

export function VerifyPage() {
  const { reportNo } = useParams<{ reportNo: string }>()
  const { data, isLoading, error } = useQuery({
    queryKey: ['verify-report', reportNo],
    queryFn: () => reportsApi.verify(reportNo!),
    enabled: !!reportNo,
  })

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-500">Rapor doğrulanıyor...</div>
    </div>
  )

  if (error || !data?.data) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <FileText className="w-12 h-12 text-red-400 mx-auto" />
        <h1 className="text-xl font-bold text-slate-900">Rapor Bulunamadı</h1>
        <p className="text-slate-500 text-sm">Bu rapor numarasına ait kayıt bulunamadı veya erişim yetkiniz yok.</p>
      </div>
    </div>
  )

  const report = data.data

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Rapor Doğrulama</h1>
              <p className="text-xs text-green-600 font-medium">Bu rapor geçerli ve doğrulanmıştır</p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500">Rapor No</div>
                <div className="font-mono font-bold text-slate-900">{report.report_number}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500">Rapor Türü</div>
                <div className="font-medium text-slate-900">{report.report_type}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500">Üretim Tarihi</div>
                <div className="text-slate-700">{new Date(report.generated_at).toLocaleDateString('tr-TR')}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500">Numune Seti</div>
                <div className="font-mono text-slate-700">{report.sample_set_id?.slice(0, 8)}...</div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-center text-slate-400">
          Bu sayfa yapı denetim laboratuvarı rapor doğrulama sistemi tarafından otomatik oluşturulmuştur.
        </p>
      </div>
    </div>
  )
}
