import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { hakedisApi } from '@/services/domain-api'
import { samplesApi } from '@/services/samples-api'
import { Wallet, Download, Plus, Calendar } from 'lucide-react'
import { formatCurrency, formatDate, statusLabel } from '@/utils/utils'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'

export function HakedisPage() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const tenant = useAuthStore((s) => s.tenant)

  // Creation form states
  const [isOpen, setIsOpen] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [unitPrice, setUnitPrice] = useState('2500')
  const [vatRate, setVatRate] = useState('20')

  // Status transition states
  const [statusUpdateId, setStatusUpdateId] = useState<string | null>(null)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [targetStatus, setTargetStatus] = useState<string>('')

  // Queries
  const { data: hakedisData, isLoading } = useQuery({
    queryKey: ['hakedis'],
    queryFn: () => hakedisApi.list(),
  })
  const { data: sitesData } = useQuery({
    queryKey: ['construction-sites'],
    queryFn: () => samplesApi.listConstructionSites(),
  })

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
    vat_amount_try: string
    total_amount_try: string
    status: string
    invoice_no: string | null
  }>

  const sites = sitesData?.data ?? []

  // Mutation for creation
  const createMutation = useMutation({
    mutationFn: (body: any) => hakedisApi.create(body),
    onSuccess: () => {
      toast.success('Hakediş raporu başarıyla oluşturuldu')
      qc.invalidateQueries({ queryKey: ['hakedis'] })
      setIsOpen(false)
      setSelectedSiteId('')
      setPeriodStart('')
      setPeriodEnd('')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Hakediş oluşturulamadı')
    },
  })

  // Mutation for status update
  const statusMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => hakedisApi.updateStatus(id, body),
    onSuccess: () => {
      toast.success('Hakediş durumu güncellendi')
      qc.invalidateQueries({ queryKey: ['hakedis'] })
      setStatusUpdateId(null)
      setInvoiceNo('')
      setTargetStatus('')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Durum güncellenemedi')
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSiteId || !periodStart || !periodEnd) {
      toast.error('Lütfen tüm zorunlu alanları doldurun')
      return
    }
    createMutation.mutate({
      constructionSiteId: selectedSiteId,
      periodStart,
      periodEnd,
      unitPriceTry: Number(unitPrice),
      vatRate: Number(vatRate),
    })
  }

  const triggerStatusUpdate = (id: string, nextStatus: string) => {
    if (nextStatus === 'invoiced') {
      setStatusUpdateId(id)
      setTargetStatus(nextStatus)
      setInvoiceNo('')
    } else {
      statusMutation.mutate({
        id,
        body: { status: nextStatus },
      })
    }
  }

  const handleInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!statusUpdateId) return
    if (!invoiceNo) {
      toast.error('Fatura numarası girmek zorunludur')
      return
    }
    statusMutation.mutate({
      id: statusUpdateId,
      body: { status: targetStatus, invoiceNo },
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-slate-100 text-slate-700'
      case 'submitted':
        return 'bg-blue-50 text-blue-700 border-blue-100'
      case 'approved':
        return 'bg-yellow-50 text-yellow-700 border-yellow-100'
      case 'invoiced':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100'
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100'
      default:
        return 'bg-slate-50 text-slate-500'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-indigo-600" /> Hakediş Yönetimi
          </h1>
          <p className="text-slate-500 text-sm">Hakediş raporlama, e-Fatura XML çıktısı ve ödeme kontrolü</p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" /> Hakediş Raporu Oluştur
        </button>
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-slate-500">Yükleniyor...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto font-sans">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase border-b">
                <tr>
                  <th className="p-4">YİF / Şantiye</th>
                  <th className="p-4">Dönem</th>
                  <th className="p-4 text-center">Numune (Tamamlanan / Toplam)</th>
                  <th className="p-4 text-right">Net Tutar</th>
                  <th className="p-4 text-right">Genel Toplam (KDV Dahil)</th>
                  <th className="p-4">Durum</th>
                  <th className="p-4">Fatura No</th>
                  <th className="p-4 text-right">Aksiyonlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      Kayıtlı hakediş raporu bulunamadı.
                    </td>
                  </tr>
                ) : (
                  items.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/50">
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">{h.yif_no}</div>
                        <div className="text-xs text-slate-500">{h.site_name}</div>
                      </td>
                      <td className="p-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formatDate(h.period_start)} — {formatDate(h.period_end)}
                        </div>
                      </td>
                      <td className="p-4 text-center font-medium text-slate-700">
                        {h.completed_samples} / {h.total_samples}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-600">
                        {formatCurrency(Number(h.amount_try))}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(Number(h.total_amount_try))}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(h.status)}`}>
                          {statusLabel(h.status)}
                        </span>
                      </td>
                      <td className="p-4 text-xs font-mono text-slate-600">{h.invoice_no ?? '—'}</td>
                      <td className="p-4 text-right space-y-1">
                        <div className="flex items-center justify-end gap-2">
                          {h.status === 'draft' && (
                            <button
                              onClick={() => triggerStatusUpdate(h.id, 'submitted')}
                              className="px-2 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200"
                            >
                              Gönderildi Yap
                            </button>
                          )}
                          {h.status === 'submitted' && (
                            <button
                              onClick={() => triggerStatusUpdate(h.id, 'approved')}
                              className="px-2 py-1 text-xs font-semibold bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded border border-yellow-200"
                            >
                              Onayla
                            </button>
                          )}
                          {(h.status === 'approved' || h.status === 'submitted') && (
                            <button
                              onClick={() => triggerStatusUpdate(h.id, 'invoiced')}
                              className="px-2 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded border border-indigo-200"
                            >
                              Fatura Et
                            </button>
                          )}
                          {h.status === 'invoiced' && (
                            <button
                              onClick={() => triggerStatusUpdate(h.id, 'paid')}
                              className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200"
                            >
                              Ödeme Alındı
                            </button>
                          )}

                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/hakedis/${h.id}/export`, {
                                  headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant?.id ?? '' },
                                })
                                if (!res.ok) throw new Error('İndirme başarısız')
                                const blob = await res.blob()
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `hakedis-${h.id}.xml`
                                a.click()
                                URL.revokeObjectURL(url)
                              } catch { toast.error('XML indirilemedi') }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> XML
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900">Hakediş Raporu Oluştur</h3>
              <p className="text-xs text-slate-500 mt-0.5">Seçilen döneme ait kırım sonuçlarını faturalandırın</p>
            </div>

            <div className="space-y-3.5">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Şantiye Seçimi</span>
                <select
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                  required
                >
                  <option value="">— Şantiye Seçin —</option>
                  {sites.map((site: any) => (
                    <option key={site.id} value={site.id}>
                      {site.name} ({site.yif_no})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Başlangıç Tarihi</span>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Bitiş Tarihi</span>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                    required
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Referans Birim Fiyatı (TL)</span>
                  <input
                    type="number"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="2500"
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 font-mono"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">KDV Oranı (%)</span>
                  <input
                    type="number"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    placeholder="20"
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 font-mono"
                    required
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all disabled:opacity-50"
              >
                {createMutation.isPending ? 'Oluşturuluyor...' : 'Hakedişi Hesapla'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invoice Submission Modal */}
      {statusUpdateId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <form
            onSubmit={handleInvoiceSubmit}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900">Fatura Detaylarını Girin</h3>
              <p className="text-xs text-slate-500 mt-0.5">Hakedişi faturalandırmak için fatura numarasını belirtin</p>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Fatura Numarası (Invoice No)</span>
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

            <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStatusUpdateId(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={statusMutation.isPending}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all"
              >
                {statusMutation.isPending ? 'Güncelleniyor...' : 'Faturayı Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
