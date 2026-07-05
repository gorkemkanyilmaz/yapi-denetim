import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { hakedisApi } from '@/services/domain-api'
import { Wallet, Calendar, ArrowRight, CheckCircle2, Clock, Edit3 } from 'lucide-react'
import { formatCurrency, formatDate, statusLabel } from '@/utils/utils'
import { toast } from 'sonner'

export function HakedisPage() {
  const qc = useQueryClient()
  const currentYear = new Date().getFullYear()
  const today = new Date().toISOString().slice(0, 10)
  const firstDay = `${currentYear}-01-01`

  // Date range filter
  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(today)

  // Queries
  const { data: hakedisData, isLoading } = useQuery({
    queryKey: ['hakedis', startDate, endDate],
    queryFn: () => hakedisApi.list(startDate, endDate),
  })
  const { data: summaryData } = useQuery({
    queryKey: ['hakedis-summary', startDate, endDate],
    queryFn: () => hakedisApi.summary(startDate, endDate),
  })

  // Edit modal states
  const [editingId, setEditingId] = useState<string | null>(null)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [editVatRate, setEditVatRate] = useState('20')

  const items = (hakedisData?.data ?? []) as Array<{
    id: string
    yif_no: string
    site_name: string
    period_start: string
    period_end: string
    completed_samples: number
    total_samples: number
    unit_price_try: string
    amount_try: string
    vat_rate: string
    vat_amount_try: string
    total_amount_try: string
    status: string
    invoice_no: string | null
  }>

  const summary = summaryData?.data ?? { total_expected: '0', total_realized: '0', total_paid: '0', count_expected: '0', count_realized: '0' }

  // Split into completed and pending
  const completedStatuses = ['invoiced', 'paid']
  const completedItems = items.filter((h) => completedStatuses.includes(h.status))
  const pendingItems = items.filter((h) => !completedStatuses.includes(h.status))

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => hakedisApi.updateStatus(id, body),
    onSuccess: () => {
      toast.success('Hakediş güncellendi')
      qc.invalidateQueries({ queryKey: ['hakedis'] })
      qc.invalidateQueries({ queryKey: ['hakedis-summary'] })
      setEditingId(null)
      setInvoiceNo('')
      setEditVatRate('20')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Güncelleme başarısız')
    },
  })

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    if (!invoiceNo) {
      toast.error('Fatura numarası gerekli')
      return
    }
    statusMutation.mutate({
      id: editingId,
      body: { status: 'invoiced', invoiceNo },
    })
  }

  const getStatusStyle = (status: string) => {
    if (status === 'paid') return 'bg-green-100 text-green-800 border-green-200'
    if (status === 'invoiced') return 'bg-green-50 text-green-700 border-green-200'
    if (status === 'draft') return 'bg-amber-50 text-amber-700 border-amber-200'
    if (status === 'submitted') return 'bg-blue-50 text-blue-700 border-blue-200'
    if (status === 'approved') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    return 'bg-slate-50 text-slate-600 border-slate-200'
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-indigo-600" /> Hakediş Yönetimi
          </h1>
          <p className="text-slate-500 text-sm">Otomatik oluşturulan ve faturalanan hakedişlerin takibi</p>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-600">Tarih Aralığı:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border-slate-300 text-sm p-2 bg-slate-50"
          />
          <ArrowRight className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border-slate-300 text-sm p-2 bg-slate-50"
          />
          <button
            onClick={() => { setStartDate(firstDay); setEndDate(today) }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Bu Yıl
          </button>
        </div>
      </div>

      {/* Summary Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          title="Beklenen Toplam"
          value={formatCurrency(Number(summary.total_expected))}
          count={`${summary.count_expected} hakediş`}
          color="amber"
        />
        <SummaryCard
          title="Gerçekleşen Toplam"
          value={formatCurrency(Number(summary.total_realized))}
          count={`${summary.count_realized} hakediş`}
          color="blue"
        />
        <SummaryCard
          title="Tahsil Edilen"
          value={formatCurrency(Number(summary.total_paid))}
          count=""
          color="green"
        />
        <SummaryCard
          title="Kalan"
          value={formatCurrency(Number(summary.total_expected) - Number(summary.total_realized))}
          count=""
          color="slate"
        />
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-slate-500">Yükleniyor...</div>
      ) : (
        <div className="space-y-6">
          {/* Beklenen Hakedişler */}
          <HakedisSection
            title="Beklenen Hakedişler"
            items={pendingItems}
            emptyText="Bu tarih aralığında beklenen hakediş yok"
            editingId={editingId}
            setEditingId={setEditingId}
            invoiceNo={invoiceNo}
            setInvoiceNo={setInvoiceNo}
            editVatRate={editVatRate}
            setEditVatRate={setEditVatRate}
            handleEditSubmit={handleEditSubmit}
            statusMutation={statusMutation}
            getStatusStyle={getStatusStyle}
          />

          {/* Tamamlanan Hakedişler */}
          <HakedisSection
            title="Tamamlanan Hakedişler"
            items={completedItems}
            emptyText="Bu tarih aralığında tamamlanan hakediş yok"
            editingId={editingId}
            setEditingId={setEditingId}
            invoiceNo={invoiceNo}
            setInvoiceNo={setInvoiceNo}
            editVatRate={editVatRate}
            setEditVatRate={setEditVatRate}
            handleEditSubmit={handleEditSubmit}
            statusMutation={statusMutation}
            getStatusStyle={getStatusStyle}
          />
        </div>
      )}
    </div>
  )
}

function SummaryCard({ title, value, count, color }: { title: string; value: string; count: string; color: string }) {
  const colors: Record<string, string> = {
    amber: 'border-l-amber-500 bg-amber-50',
    blue: 'border-l-blue-500 bg-blue-50',
    green: 'border-l-green-500 bg-green-50',
    slate: 'border-l-slate-500 bg-slate-50',
  }
  return (
    <div className={`bg-white rounded-xl p-4 border border-slate-200 border-l-4 ${colors[color]}`}>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</div>
      <div className="text-xl font-bold text-slate-900 mt-1 font-mono">{value}</div>
      {count && <div className="text-xs text-slate-500 mt-0.5">{count}</div>}
    </div>
  )
}

interface HakedisSectionProps {
  title: string
  items: Array<{
    id: string; yif_no: string; site_name: string; period_start: string; period_end: string;
    completed_samples: number; total_samples: number; unit_price_try: string; amount_try: string;
    vat_rate: string; vat_amount_try: string; total_amount_try: string; status: string; invoice_no: string | null
  }>
  emptyText: string
  editingId: string | null
  setEditingId: (id: string | null) => void
  invoiceNo: string
  setInvoiceNo: (v: string) => void
  editVatRate: string
  setEditVatRate: (v: string) => void
  handleEditSubmit: (e: React.FormEvent) => void
  statusMutation: any
  getStatusStyle: (status: string) => string
}

function HakedisSection({
  title, items, emptyText, editingId, setEditingId, invoiceNo, setInvoiceNo,
  editVatRate, setEditVatRate, handleEditSubmit, statusMutation, getStatusStyle
}: HakedisSectionProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h2 className="font-semibold text-slate-800 text-sm">{title} ({items.length})</h2>
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b bg-slate-50/50">
              <tr>
                <th className="text-left p-3">YİF / Şantiye</th>
                <th className="text-left p-3">Dönem</th>
                <th className="text-center p-3">Numune</th>
                <th className="text-right p-3">Birim Fiyat</th>
                <th className="text-right p-3">Net</th>
                <th className="text-right p-3">KDV</th>
                <th className="text-right p-3">Toplam</th>
                <th className="text-center p-3">Durum</th>
                <th className="text-center p-3">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50/50">
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{h.yif_no}</div>
                    <div className="text-xs text-slate-500">{h.site_name}</div>
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    {formatDate(h.period_start)} — {formatDate(h.period_end)}
                  </td>
                  <td className="p-3 text-center font-medium text-slate-700">
                    {h.completed_samples} / {h.total_samples}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-600 text-xs">
                    {formatCurrency(Number(h.unit_price_try))}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-600">
                    {formatCurrency(Number(h.amount_try))}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-500 text-xs">
                    {formatCurrency(Number(h.vat_amount_try))}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(Number(h.total_amount_try))}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusStyle(h.status)}`}>
                      {statusLabel(h.status)}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {h.status === 'draft' && (
                      <button
                        onClick={() => { setEditingId(h.id); setInvoiceNo(''); setEditVatRate(h.vat_rate || '20') }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors"
                      >
                        <Edit3 className="w-3 h-3" /> Düzenle
                      </button>
                    )}
                    {h.status === 'paid' && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                        <CheckCircle2 className="w-3 h-3" /> Tamamlandı
                      </span>
                    )}
                    {(h.status === 'invoiced' || h.status === 'submitted' || h.status === 'approved') && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
                        <Clock className="w-3 h-3" /> Bekleniyor
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingId && items.some((h) => h.id === editingId) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleEditSubmit} className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Fatura Bilgileri Gir</h3>
              <p className="text-xs text-slate-500 mt-0.5">Hakedişi faturalandırmak için bilgileri doldurun</p>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Fatura Numarası</span>
              <input
                type="text"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="FT-2026-000456"
                className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 font-mono"
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">KDV Oranı (%)</span>
              <input
                type="number"
                value={editVatRate}
                onChange={(e) => setEditVatRate(e.target.value)}
                className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 font-mono"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">İptal</button>
              <button type="submit" disabled={statusMutation.isPending} className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">
                {statusMutation.isPending ? 'Kaydediliyor...' : 'Faturala'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
