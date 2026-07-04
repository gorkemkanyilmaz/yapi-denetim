import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listQueue, flushQueue, removeFromQueue, type QueuedOp } from '@/services/offline-queue'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'

export function FieldQueuePage() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const tenant = useAuthStore((s) => s.tenant)
  const { data: queue = [], refetch } = useQuery<QueuedOp[]>({ queryKey: ['queue'], queryFn: listQueue })

  const flush = useMutation({
    mutationFn: async () => {
      if (!token || !tenant) throw new Error('not authenticated')
      return flushQueue(token, tenant.id)
    },
    onSuccess: (r) => {
      toast.success(`${r.flushed} senkronize, ${r.failed} başarısız`)
      qc.invalidateQueries({ queryKey: ['queue'] })
    },
    onError: () => toast.error('Senkronizasyon başarısız'),
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Senkronizasyon Kuyruğu</h2>
        <button
          onClick={() => flush.mutate()}
          disabled={flush.isPending || queue.length === 0}
          className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-2 rounded-md disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" /> Şimdi Senkronize Et
        </button>
      </div>
      {queue.length === 0 ? (
        <div className="text-center text-slate-500 py-10">Kuyrukta bekleyen kayıt yok.</div>
      ) : (
        queue.map((op) => (
          <div key={op.id} className="bg-white rounded-lg p-3 border border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{op.method} {op.endpoint}</div>
              <div className="text-xs text-slate-500">{new Date(op.createdAt).toLocaleString('tr-TR')} • {op.attempts} deneme</div>
              {op.lastError && <div className="text-xs text-red-600 mt-1">Hata: {op.lastError}</div>}
            </div>
            <button onClick={async () => { if (op.id) await removeFromQueue(op.id); void refetch() }} className="text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))
      )}
    </div>
  )
}
