import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dashboardApi, curingPoolsApi } from '@/services/domain-api'
import { samplesApi } from '@/services/samples-api'
import { authService } from '@/services/auth-service'
import { statusLabel, formatDate, slaColor, formatDateTime } from '@/utils/utils'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { User, ClipboardList, Filter, Plus, Eye, X, MapPin, Phone, Droplets, FlaskConical, Building2, CheckCircle2, FileText, History } from 'lucide-react'

const COLUMNS = ['created', 'collected', 'in_transit', 'received', 'in_curing', 'scheduled_for_test', 'tested', 'approved', 'archived'] as const

type Status = typeof COLUMNS[number]

function getNextAction(s: any, col: Status): { toStatus: Status; label: string; requiresModal: boolean } | null {
  const isConcrete = s.material_type === 'concrete'
  switch (col) {
    case 'created':
      return { toStatus: 'collected', label: 'Saha Toplama Tamamla', requiresModal: true }
    case 'collected':
      return { toStatus: 'in_transit', label: 'Kuryeye Ver (Yolda)', requiresModal: false }
    case 'in_transit':
      return { toStatus: 'received', label: 'Numuneyi Teslim Al', requiresModal: false }
    case 'received':
      if (isConcrete) {
        return { toStatus: 'in_curing', label: 'Kür Havuzuna Yerleştir', requiresModal: true }
      } else {
        return { toStatus: 'scheduled_for_test', label: 'Test Planla (Kürsüz)', requiresModal: false }
      }
    case 'in_curing':
      return { toStatus: 'scheduled_for_test', label: 'Kürden Çıkar & Test Planla', requiresModal: false }
    case 'scheduled_for_test':
      return null
    case 'tested':
      return { toStatus: 'approved', label: 'Kırım Sonucunu Onayla', requiresModal: false }
    case 'approved':
      return { toStatus: 'archived', label: 'Görevi Arşivle', requiresModal: false }
    default:
      return null
  }
}

export function KanbanPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isFieldUser = user?.role === 'field_tech' || user?.role === 'courier'
  
  // Queries
  const { data: kanbanData } = useQuery({ queryKey: ['kanban'], queryFn: () => dashboardApi.kanban() })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => authService.listUsers() })
  const { data: poolsData } = useQuery({ queryKey: ['pools'], queryFn: () => curingPoolsApi.list() })
  const { data: sitesData } = useQuery({ queryKey: ['construction-sites'], queryFn: () => samplesApi.listConstructionSites() })
  
  // State
  const [assigneeFilter, setAssigneeFilter] = useState<string>(isFieldUser ? (user?.id ?? '') : 'all')
  const [pendingTransition, setPendingTransition] = useState<{
    id: string
    toStatus: Status
    yif_no: string
  } | null>(null)
  
  // Transition Form Inputs
  const [selectedPoolId, setSelectedPoolId] = useState<string>('')
  const [selectedZoneId, setSelectedZoneId] = useState<string>('')
  const [manualProtocolNo, setManualProtocolNo] = useState<string>('')
  const [manualFisNo, setManualFisNo] = useState<string>('')
  const [manualConcreteClass, setManualConcreteClass] = useState<string>('')
  const [manualLat, setManualLat] = useState<string>('39.9208')
  const [manualLng, setManualLng] = useState<string>('32.8540')

  // Task Creation Form Inputs
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newSiteId, setNewSiteId] = useState('')
  const [newMaterialType, setNewMaterialType] = useState('concrete')
  const [newConcreteClass, setNewConcreteClass] = useState('')
  const [newYifNo, setNewYifNo] = useState('')
  const [newAssigneeId, setNewAssigneeId] = useState('')
  const [newUnitPrice, setNewUnitPrice] = useState('0')

  // Detail Modal
  const [detailSampleId, setDetailSampleId] = useState<string | null>(null)
  const { data: detailData, isLoading: isDetailLoading } = useQuery({
    queryKey: ['sample-set-detail', detailSampleId],
    queryFn: () => samplesApi.get(detailSampleId!),
    enabled: !!detailSampleId,
  })
  const detail = detailData?.data

  // Fetch zones for the selected pool in the transition modal
  const { data: zonesData } = useQuery({
    queryKey: ['pool-zones', selectedPoolId],
    queryFn: () => curingPoolsApi.getZones(selectedPoolId),
    enabled: !!selectedPoolId,
  })
  const zones = zonesData?.data ?? []
  const constructionSites = sitesData?.data ?? []

  // Pre-fill site data in the creation form
  const handleSiteChange = (siteId: string) => {
    setNewSiteId(siteId)
    const found = constructionSites.find((cs: any) => cs.id === siteId)
    if (found) {
      setNewYifNo(found.yif_no || '')
      setNewConcreteClass(found.concrete_class || '')
    }
  }

  // Mutations
  const transitionMutation = useMutation({
    mutationFn: ({ id, toStatus, payload }: { id: string; toStatus: string; payload?: any }) => 
      samplesApi.transition(id, toStatus, payload),
    onSuccess: () => {
      toast.success('Durum güncellendi')
      qc.invalidateQueries({ queryKey: ['kanban'] })
      setPendingTransition(null)
      // Reset inputs
      setSelectedPoolId('')
      setSelectedZoneId('')
      setManualProtocolNo('')
      setManualFisNo('')
      setManualConcreteClass('')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Geçiş başarısız oldu')
    }
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) => 
      samplesApi.assign(id, assigneeId),
    onSuccess: () => {
      toast.success('Çalışan ataması güncellendi')
      qc.invalidateQueries({ queryKey: ['kanban'] })
    },
    onError: () => {
      toast.error('Atama işlemi başarısız oldu')
    }
  })

  const acceptMutation = useMutation({
    mutationFn: (id: string) => samplesApi.accept(id),
    onSuccess: () => {
      toast.success('Görev kabul edildi ve başlatıldı')
      qc.invalidateQueries({ queryKey: ['kanban'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Görev kabul edilemedi')
    }
  })

  const createTaskMutation = useMutation({
    mutationFn: (body: { constructionSiteId: string; materialType: string; yifNo: string; concreteClass?: string; assignedTo?: string; unitPriceTry?: number }) => 
      samplesApi.create(body),
    onSuccess: () => {
      toast.success('Yeni saha görevi başarıyla oluşturuldu')
      qc.invalidateQueries({ queryKey: ['kanban'] })
      setIsCreateModalOpen(false)
      // Reset inputs
      setNewSiteId('')
      setNewMaterialType('concrete')
      setNewConcreteClass('')
      setNewYifNo('')
      setNewAssigneeId('')
      setNewUnitPrice('0')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Görev oluşturulamadı')
    }
  })

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string, fromStatus: string, yif_no: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, fromStatus, yif_no }))
  }

  const handleDrop = (e: React.DragEvent, toStatus: Status) => {
    e.preventDefault()
    try {
      const dataStr = e.dataTransfer.getData('text/plain')
      if (!dataStr) return
      const { id, fromStatus, yif_no } = JSON.parse(dataStr)
      if (fromStatus === toStatus) return

      // Prompt for inputs based on destination status
      if (toStatus === 'in_curing') {
        setPendingTransition({ id, toStatus, yif_no })
        return
      }
      if (toStatus === 'collected') {
        setPendingTransition({ id, toStatus, yif_no })
        return
      }

      // Simple transitions
      transitionMutation.mutate({ id, toStatus })
    } catch (err) {
      console.error(err)
    }
  }

  const submitPendingTransition = () => {
    if (!pendingTransition) return
    const { id, toStatus } = pendingTransition

    if (toStatus === 'in_curing') {
      if (!selectedZoneId) {
        toast.error('Lütfen bir kür havuz bölgesi seçin')
        return
      }
      transitionMutation.mutate({
        id,
        toStatus,
        payload: { curingPoolZoneId: selectedZoneId }
      })
    } else if (toStatus === 'collected') {
      const latNum = parseFloat(manualLat)
      const lngNum = parseFloat(manualLng)
      if (isNaN(latNum) || isNaN(lngNum)) {
        toast.error('Geçersiz konum koordinatları')
        return
      }
      transitionMutation.mutate({
        id,
        toStatus,
        payload: {
          gps: { lat: latNum, lng: lngNum, accuracyM: 10 },
          ebisProtocolNo: manualProtocolNo || undefined,
          ebisFisNo: manualFisNo || undefined,
          concreteClass: manualConcreteClass || undefined,
        }
      })
    }
  }

  const submitCreateTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSiteId) {
      toast.error('Lütfen şantiye seçin')
      return
    }
    if (!newYifNo) {
      toast.error('Lütfen YİF numarasını girin')
      return
    }
    createTaskMutation.mutate({
      constructionSiteId: newSiteId,
      materialType: newMaterialType,
      yifNo: newYifNo,
      concreteClass: newMaterialType === 'concrete' ? newConcreteClass : undefined,
      assignedTo: newAssigneeId || undefined,
      unitPriceTry: Number(newUnitPrice) || 0,
    })
  }

  // Filter and group cards
  const rawGrouped = (kanbanData?.data ?? {}) as Record<string, any[]>
  const filteredGrouped: Record<string, any[]> = {}
  
  COLUMNS.forEach((col) => {
    const list = rawGrouped[col] ?? []
    filteredGrouped[col] = list.filter((item) => {
      if (assigneeFilter === 'all') return true
      if (assigneeFilter === 'me') return item.assigned_to === user?.id
      return item.assigned_to === assigneeFilter
    })
  })

  const pools = poolsData?.data ?? []

  return (
    <div className="h-full flex flex-col space-y-3 md:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 md:p-4 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Numune İş Akışı</h1>
          <p className="text-slate-500 text-xs md:text-sm">Operasyonel süreçlerin takibi ve iş atamaları</p>
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {/* Create Task Button */}
          {!isFieldUser && (user?.role === 'owner' || user?.role === 'manager' || user?.role === 'admin') && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs md:text-sm font-semibold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Yeni Görev Oluştur</span><span className="sm:hidden">Yeni Görev</span>
            </button>
          )}

          {/* Assignee Filter Dropdown */}
          {!isFieldUser && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2 md:pl-3">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-xs md:text-sm font-medium text-slate-600 hidden sm:inline">Filtrele:</span>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="rounded-lg border-slate-300 text-xs md:text-sm p-1.5 md:p-2 bg-slate-50 hover:bg-white min-w-0 max-w-[140px]"
              >
                <option value="all">Tüm Çalışanlar</option>
                <option value="me">Bana Atananlar</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Kanban Board Container */}
      <div className="flex-1 overflow-x-auto pb-4 scroll-touch">
        <div className="flex gap-2 sm:gap-3 md:gap-4 min-w-max h-[calc(100vh-200px)] md:h-[calc(100vh-230px)]">
          {COLUMNS.map((col) => (
            <div
              key={col}
              className="w-60 sm:w-72 bg-slate-100/80 rounded-xl p-2 sm:p-3 flex flex-col border border-slate-200/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col)}
            >
              {/* Column Header */}
              <div className="font-semibold text-xs sm:text-sm mb-2 sm:mb-3 flex items-center justify-between px-1">
                <span className="text-slate-800 font-bold truncate pr-1">{statusLabel(col)}</span>
                <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full font-medium shrink-0">
                  {(filteredGrouped[col] ?? []).length}
                </span>
              </div>

              {/* Card List container */}
              <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-2.5 min-h-[200px] pr-0.5">
                {(filteredGrouped[col] ?? []).map((s) => {
                  const isAccepted = s.is_accepted === true
                  const isAssignedToMe = s.assigned_to === user?.id
                  // Disable dragging for field techs if they haven't accepted it yet
                  const isDraggable = !isFieldUser || isAccepted

                  return (
                    <div
                      key={s.id}
                      className={`bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-3.5 border border-slate-200/80 shadow-sm transition-all ${
                        isDraggable ? 'cursor-grab active:cursor-grabbing hover:shadow-md hover:border-slate-300' : 'opacity-85'
                      }`}
                      draggable={isDraggable}
                      onDragStart={(e) => handleDragStart(e, s.id, col, s.yif_no)}
                    >
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 gap-1">
                        <span className="text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                          {s.material_type.toUpperCase()}
                        </span>
                        {s.concrete_class && (
                          <span className="text-[10px] sm:text-xs font-mono text-slate-500 truncate">{s.concrete_class}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 mb-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailSampleId(s.id)
                          }}
                          className="font-semibold text-slate-900 text-xs sm:text-sm hover:text-blue-600 transition-colors truncate text-left flex-1 min-w-0"
                          title="Detayları görüntüle"
                        >
                          {s.yif_no}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailSampleId(s.id)
                          }}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                          title="Detayları görüntüle"
                          aria-label="Detayları görüntüle"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {s.ebis_protocol_no && (
                        <div className="text-[10px] sm:text-xs text-slate-500 font-mono flex items-center gap-1 mb-1 truncate">
                          <ClipboardList className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{s.ebis_protocol_no}</span>
                        </div>
                      )}

                      {s.collected_at && (
                        <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1.5 sm:mt-2">
                          Toplandı: {formatDate(s.collected_at)}
                        </div>
                      )}

                      {/* Accept Task Button for Field Workers */}
                      {isAssignedToMe && !isAccepted && col === 'created' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            acceptMutation.mutate(s.id)
                          }}
                          disabled={acceptMutation.isPending}
                          className="mt-2.5 sm:mt-3 w-full py-1.5 sm:py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[11px] sm:text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          {acceptMutation.isPending ? 'Kabul Ediliyor...' : 'Görevi Kabul Et'}
                        </button>
                      )}

                      {/* Accept Task Status Indicators */}
                      {s.assigned_to && (user?.role === 'owner' || user?.role === 'manager' || user?.role === 'admin') && (
                        <div className="mt-1.5 sm:mt-2">
                          {isAccepted ? (
                            <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-green-700 bg-green-50 px-2 sm:px-2.5 py-0.5 rounded-full border border-green-200">
                              ✓ Kabul Edildi
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-amber-700 bg-amber-50 px-2 sm:px-2.5 py-0.5 rounded-full border border-amber-200 animate-pulse">
                              ⌛ Kabul Bekliyor
                            </span>
                          )}
                        </div>
                      )}

                      {isAssignedToMe && isAccepted && col === 'created' && (
                        <div className="mt-1.5 sm:mt-2">
                          <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-green-700 bg-green-50 px-2 sm:px-2.5 py-0.5 rounded-full border border-green-200">
                            ✓ Kabul Ettiniz
                          </span>
                        </div>
                      )}

                      {/* Assignment Selector (Inside card) */}
                      {!isFieldUser && (
                        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-100 flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-slate-500">
                            <User className="w-3 h-3 text-slate-400" /> Atanan
                          </div>
                          <select
                            value={s.assigned_to ?? ''}
                            onChange={(e) => assignMutation.mutate({ id: s.id, assigneeId: e.target.value || null })}
                            className="w-full text-[11px] sm:text-xs rounded border-slate-200 p-1 sm:p-1.5 bg-slate-50 focus:bg-white text-slate-700 font-medium"
                          >
                            <option value="">— Seçilmedi —</option>
                            {users.map((u: any) => (
                              <option key={u.id} value={u.id}>{u.full_name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {isFieldUser && !isAssignedToMe && s.assigned_user_name && (
                        <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-slate-500 font-medium truncate">
                          Atanan: {s.assigned_user_name}
                        </div>
                      )}

                      {/* Quick Action Buttons */}
                      {!isFieldUser && (() => {
                        const action = getNextAction(s, col)
                        if (!action) return null
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (action.requiresModal) {
                                setPendingTransition({ id: s.id, toStatus: action.toStatus, yif_no: s.yif_no })
                              } else {
                                transitionMutation.mutate({ id: s.id, toStatus: action.toStatus })
                              }
                            }}
                            className="mt-2 sm:mt-3 w-full py-1.5 px-2 sm:px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[11px] sm:text-xs font-semibold transition-all shadow-sm active:scale-95"
                          >
                            {action.label} →
                          </button>
                        )
                      })()}

                      {col === 'scheduled_for_test' && !isFieldUser && (
                        <Link
                          to={`/lab`}
                          className="mt-2 sm:mt-3 block text-center w-full py-1.5 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] sm:text-xs font-semibold transition-all shadow-sm active:scale-95"
                        >
                          🔬 Kırım Testi
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Task Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 transition-all">
          <form onSubmit={submitCreateTask} className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Yeni Saha Görevi Oluştur</h3>
              <p className="text-xs text-slate-500 mt-0.5">Toplanacak numune ve şantiye bilgilerini belirleyin</p>
            </div>

            <div className="space-y-3.5">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Şantiye Seçimi</span>
                <select
                  value={newSiteId}
                  onChange={(e) => handleSiteChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                  required
                >
                  <option value="">— Şantiye Seçin —</option>
                  {constructionSites.map((cs: any) => (
                    <option key={cs.id} value={cs.id}>{cs.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">YİF No</span>
                  <input
                    type="text"
                    value={newYifNo}
                    onChange={(e) => setNewYifNo(e.target.value)}
                    placeholder="YIF-2026-001"
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Malzeme Türü</span>
                  <select
                    value={newMaterialType}
                    onChange={(e) => setNewMaterialType(e.target.value)}
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                  >
                    <option value="concrete">Beton (Concrete)</option>
                    <option value="steel">Çelik (Steel)</option>
                    <option value="soil">Zemin (Soil)</option>
                    <option value="aggregate">Agrega (Aggregate)</option>
                  </select>
                </label>
              </div>

              {newMaterialType === 'concrete' && (
                <label className="block animate-in slide-in-from-top-1 duration-150">
                  <span className="text-xs font-semibold text-slate-600">Beton Sınıfı</span>
                  <input
                    type="text"
                    value={newConcreteClass}
                    onChange={(e) => setNewConcreteClass(e.target.value)}
                    placeholder="C30/37"
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Çalışan Ataması (Opsiyonel)</span>
                <select
                  value={newAssigneeId}
                  onChange={(e) => setNewAssigneeId(e.target.value)}
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white"
                >
                  <option value="">— Saha Elemanı Ata —</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </label>

              {['owner', 'manager', 'admin'].includes(user?.role || '') && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Hakediş Birim Fiyatı (TL)</span>
                  <input
                    type="number"
                    value={newUnitPrice}
                    onChange={(e) => setNewUnitPrice(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50 focus:bg-white font-mono"
                  />
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={createTaskMutation.isPending}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all disabled:opacity-50"
              >
                {createTaskMutation.isPending ? 'Oluşturuluyor...' : 'Görev Oluştur'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Action Modal for transitions requiring input */}
      {pendingTransition && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 transition-all">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Süreci İlerlet: {statusLabel(pendingTransition.toStatus)}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Numune seti: <strong className="text-slate-700">{pendingTransition.yif_no}</strong>
              </p>
            </div>

            {pendingTransition.toStatus === 'in_curing' && (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Kür Havuzu</span>
                  <select
                    value={selectedPoolId}
                    onChange={(e) => {
                      setSelectedPoolId(e.target.value)
                      setSelectedZoneId('')
                    }}
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                  >
                    <option value="">— Havuz Seçin —</option>
                    {pools.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} (Kap: {p.capacity})</option>
                    ))}
                  </select>
                </label>

                {selectedPoolId && (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Bölge / Raf</span>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                      className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                    >
                      <option value="">— Raf Bölgesi Seçin —</option>
                      {zones
                        .filter((z: any) => !z.is_occupied)
                        .map((z: any) => (
                          <option key={z.id} value={z.id}>
                            Raf: {z.zone_label} (Kat: {z.shelf_level})
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {pendingTransition.toStatus === 'collected' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Tutanak No</span>
                    <input
                      type="text"
                      value={manualProtocolNo}
                      onChange={(e) => setManualProtocolNo(e.target.value)}
                      placeholder="TR-2026-000123"
                      className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Fiş No</span>
                    <input
                      type="text"
                      value={manualFisNo}
                      onChange={(e) => setManualFisNo(e.target.value)}
                      placeholder="FIS-2026-000123"
                      className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Beton Sınıfı</span>
                  <input
                    type="text"
                    value={manualConcreteClass}
                    onChange={(e) => setManualConcreteClass(e.target.value)}
                    placeholder="C30/37"
                    className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Enlem</span>
                    <input
                      type="text"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                      className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Boylam</span>
                    <input
                      type="text"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                      className="mt-1 w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingTransition(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={submitPendingTransition}
                disabled={transitionMutation.isPending}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all disabled:opacity-50"
              >
                {transitionMutation.isPending ? 'İşleniyor...' : 'Tamamla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sample Set Detail Modal */}
      {detailSampleId && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setDetailSampleId(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[95vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {isDetailLoading || !detail ? (
              <div className="p-10 text-center text-slate-500">Yükleniyor...</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 font-mono">{detail.yif_no}</h3>
                      <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full border ${slaColor(detail.sla_alert || 'normal')}`}>
                        {detail.sla_alert === 'normal' ? 'Normal' : detail.sla_alert === 'warning' ? 'Uyarı' : 'Kritik'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {statusLabel(detail.status)} • {detail.material_type?.toUpperCase()} {detail.concrete_class && `• ${detail.concrete_class}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailSampleId(null)}
                    className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
                    aria-label="Kapat"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                  <DetailSection title="Şantiye & Konum" icon={<Building2 className="w-4 h-4" />}>
                    <DetailField label="Şantiye" value={detail.construction_site_name} />
                    <DetailField label="YİF No" value={detail.site_yif_no || detail.yif_no} mono />
                    <DetailField label="Adres" value={detail.site_address} />
                    <DetailField label="Yüklenici" value={detail.contractor_name} />
                    <DetailField label="Denetim Firması" value={detail.inspection_firm} />
                    <DetailField label="Hazır Beton" value={detail.ready_mix_supplier} />
                    {detail.santiye_sorumlusu_cep && (
                      <DetailField
                        label="Şantiye Sorumlusu"
                        value={detail.santiye_sorumlusu_cep}
                        icon={<Phone className="w-3 h-3" />}
                        mono
                      />
                    )}
                    {detail.site_latitude && (
                      <DetailField
                        label="Koordinat"
                        value={`${Number(detail.site_latitude).toFixed(5)}, ${Number(detail.site_longitude).toFixed(5)} (${detail.geofence_radius_m}m)`}
                        icon={<MapPin className="w-3 h-3" />}
                        mono
                      />
                    )}
                  </DetailSection>

                  <DetailSection title="EBİS & Numune Bilgileri" icon={<FileText className="w-4 h-4" />}>
                    <DetailField label="EBİS Protokol No" value={detail.ebis_protocol_no} mono />
                    <DetailField label="EBİS Fiş No" value={detail.ebis_fis_no} mono />
                    <DetailField label="Beton Sınıfı" value={detail.concrete_class || detail.site_concrete_class} mono />
                    <DetailField label="Döküm Tarihi" value={detail.casting_date ? formatDateTime(detail.casting_date) : null} />
                    <DetailField label="Döküm Yeri" value={detail.casting_location} />
                    <DetailField label="Slump (cm)" value={detail.slump_value_cm} mono />
                    <DetailField label="Beton Sıcaklığı (°C)" value={detail.concrete_temp_c} mono />
                    <DetailField label="Hava Sıcaklığı (°C)" value={detail.air_temp_c} mono />
                  </DetailSection>

                  <DetailSection title="Saha & GPS" icon={<MapPin className="w-4 h-4" />}>
                    <DetailField
                      label="Toplama Tarihi"
                      value={detail.collected_at ? formatDateTime(detail.collected_at) : null}
                    />
                    <DetailField label="Toplayan" value={detail.collected_at ? 'Sahadan' : null} />
                    {detail.gps_lat && (
                      <DetailField
                        label="GPS"
                        value={`${detail.gps_lat}, ${detail.gps_lng}${detail.gps_accuracy_m ? ` (±${detail.gps_accuracy_m}m)` : ''}`}
                        mono
                      />
                    )}
                    <DetailField
                      label="Geofence"
                      value={
                        detail.geofence_valid === null
                          ? '—'
                          : detail.geofence_valid
                          ? '✓ Şantiye İçi'
                          : '✗ Şantiye Dışı'
                      }
                    />
                    {detail.geofence_override && (
                      <DetailField label="Bypass" value="Yönetici Onaylı" />
                    )}
                  </DetailSection>

                  {(detail.curing_pool_name || detail.received_at) && (
                    <DetailSection title="Laboratuvar" icon={<FlaskConical className="w-4 h-4" />}>
                      <DetailField
                        label="Teslim Alma"
                        value={detail.received_at ? formatDateTime(detail.received_at) : null}
                      />
                      <DetailField
                        label="Kür Havuzu"
                        value={
                          detail.curing_pool_name
                            ? `${detail.curing_pool_name} (${detail.curing_pool_temperature}°C)`
                            : null
                        }
                        icon={<Droplets className="w-3 h-3" />}
                      />
                      <DetailField
                        label="Raf / Bölge"
                        value={
                          detail.curing_zone_label
                            ? `${detail.curing_zone_label} • Kat ${detail.curing_shelf_level}`
                            : null
                        }
                      />
                      <DetailField
                        label="Kür Başlangıç"
                        value={detail.curing_started_at ? formatDateTime(detail.curing_started_at) : null}
                      />
                      <DetailField
                        label="Kür Bitiş"
                        value={detail.curing_ended_at ? formatDateTime(detail.curing_ended_at) : null}
                      />
                    </DetailSection>
                  )}

                  {detail.assigned_user_name && (
                    <DetailSection title="Atama" icon={<User className="w-4 h-4" />}>
                      <DetailField label="Çalışan" value={detail.assigned_user_name} />
                      <DetailField label="Rol" value={detail.assigned_user_role} />
                      {detail.assigned_user_phone && (
                        <DetailField
                          label="Telefon"
                          value={detail.assigned_user_phone}
                          icon={<Phone className="w-3 h-3" />}
                          mono
                        />
                      )}
                    </DetailSection>
                  )}

                  {detail.specimens && detail.specimens.length > 0 && (
                    <DetailSection title={`Numuneler (${detail.specimens.length})`} icon={<FlaskConical className="w-4 h-4" />}>
                      <div className="overflow-x-auto -mx-1 scroll-touch">
                        <table className="w-full text-xs min-w-[480px]">
                          <thead className="text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="text-left p-1.5 font-semibold">No</th>
                              <th className="text-left p-1.5 font-semibold">Yaş</th>
                              <th className="text-left p-1.5 font-semibold">Test Tarihi</th>
                              <th className="text-left p-1.5 font-semibold">Durum</th>
                              <th className="text-right p-1.5 font-semibold">Yük (kN)</th>
                              <th className="text-right p-1.5 font-semibold">Dayanım (MPa)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detail.specimens.map((sp: any) => (
                              <tr key={sp.id}>
                                <td className="p-1.5 font-mono font-semibold">#{sp.specimen_no}</td>
                                <td className="p-1.5">{sp.target_age_days}g</td>
                                <td className="p-1.5">
                                  <div>{formatDate(sp.target_test_date)}</div>
                                  {sp.actual_test_date && (
                                    <div className="text-[10px] text-slate-500">Gerçek: {formatDate(sp.actual_test_date)}</div>
                                  )}
                                </td>
                                <td className="p-1.5">
                                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${slaColor(sp.sla_alert || 'normal')}`}>
                                    {statusLabel(sp.status)}
                                  </span>
                                </td>
                                <td className="p-1.5 text-right font-mono">{sp.failure_load_kn ?? '—'}</td>
                                <td className="p-1.5 text-right font-mono font-bold text-slate-900">
                                  {sp.compressive_strength_mpa ? Number(sp.compressive_strength_mpa).toFixed(2) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </DetailSection>
                  )}

                  {detail.signatures && detail.signatures.length > 0 && (
                    <DetailSection title={`İmzalar (${detail.signatures.length})`} icon={<CheckCircle2 className="w-4 h-4" />}>
                      <div className="space-y-1.5">
                        {detail.signatures.map((sig: any) => (
                          <div key={sig.id} className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg text-xs">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800 truncate">{sig.full_name}</div>
                              <div className="text-slate-500 text-[10px]">
                                {sig.role === 'denetci_muhendis' ? 'Denetçi Mühendis' :
                                  sig.role === 'santiye_sefi' ? 'Şantiye Şefi' :
                                  sig.role === 'beton_tesisi_yetkilisi' ? 'Beton Tesisi Yetkilisi' : sig.role}
                                {sig.tc_kimlik_no && ` • TC: ${sig.tc_kimlik_no}`}
                              </div>
                            </div>
                            <div className="text-slate-400 text-[10px] shrink-0">{formatDate(sig.signed_at)}</div>
                          </div>
                        ))}
                      </div>
                    </DetailSection>
                  )}

                  {detail.audit && detail.audit.length > 0 && (
                    <DetailSection title={`Son Değişiklikler (${detail.audit.length})`} icon={<History className="w-4 h-4" />}>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {detail.audit.slice(0, 10).map((a: any) => (
                          <div key={a.id} className="text-[11px] text-slate-600 flex items-start gap-2 p-1.5 hover:bg-slate-50 rounded">
                            <span className="font-mono text-slate-400 shrink-0">{formatDateTime(a.created_at)}</span>
                            <span className="font-semibold text-slate-800 shrink-0">{a.action}</span>
                            {a.field_name && <span className="text-slate-500 truncate">{a.field_name}</span>}
                          </div>
                        ))}
                      </div>
                    </DetailSection>
                  )}

                  <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span>Oluşturuldu: {formatDateTime(detail.created_at)}</span>
                    <span>Güncellendi: {formatDateTime(detail.updated_at)}</span>
                  </div>
                </div>

                <div className="p-3 sm:p-4 border-t border-slate-200 flex justify-end gap-2 shrink-0 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setDetailSampleId(null)}
                    className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-all"
                  >
                    Kapat
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 sm:p-4">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        {icon} {title}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {children}
      </div>
    </div>
  )
}

function DetailField({ label, value, icon, mono }: { label: string; value: string | number | null | undefined; icon?: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-xs sm:text-sm text-slate-900 flex items-center gap-1 ${mono ? 'font-mono' : ''} break-words`}>
        {icon}{value}
      </div>
    </div>
  )
}
