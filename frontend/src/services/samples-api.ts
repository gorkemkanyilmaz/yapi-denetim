import { api } from './api'

export interface SampleSet {
  id: string
  tenant_id: string
  construction_site_id: string
  construction_site_name?: string
  material_type: 'concrete' | 'steel' | 'soil' | 'aggregate'
  ebis_protocol_no: string | null
  ebis_fis_no: string | null
  yif_no: string
  concrete_class: string | null
  status: string
  collected_at: string | null
  curing_started_at: string | null
  geofence_valid: boolean | null
  created_at: string
}

export const samplesApi = {
  list: (params?: { status?: string; material?: string; yif_no?: string; page?: number; per_page?: number }) =>
    api.get('/samples', { params }).then((r) => r.data),
  listConstructionSites: () =>
    api.get('/samples/construction-sites').then((r) => r.data),
  createConstructionSite: (body: {
    name: string
    yifNo: string
    address: string
    latitude?: number
    longitude?: number
    contractorName?: string
    inspectionFirm?: string
    readyMixSupplier?: string
    concreteClass?: string
    santiyeSorumlusuCep?: string
  }) => api.post('/samples/construction-sites', body).then((r) => r.data),
  updateConstructionSite: (id: string, body: {
    name: string
    yifNo: string
    address: string
    latitude?: number
    longitude?: number
    contractorName?: string
    inspectionFirm?: string
    readyMixSupplier?: string
    concreteClass?: string
    santiyeSorumlusuCep?: string
  }) => api.patch(`/samples/construction-sites/${id}`, body).then((r) => r.data),
  listBypassRequests: () =>
    api.get('/samples/bypass-requests').then((r) => r.data),
  approveBypassRequest: (id: string) =>
    api.patch(`/samples/bypass-requests/${id}/approve`).then((r) => r.data),
  get: (id: string) => api.get(`/samples/${id}`).then((r) => r.data),
  create: (body: { constructionSiteId: string; materialType: string; yifNo: string; concreteClass?: string; assignedTo?: string; unitPriceTry?: number }) =>
    api.post('/samples', body).then((r) => r.data),
  transition: (id: string, toStatus: string, payload?: Record<string, unknown>) =>
    api.patch(`/samples/${id}/status`, { toStatus, payload }).then((r) => r.data),
  assign: (id: string, assigneeId: string | null) =>
    api.patch(`/samples/${id}/assign`, { assigneeId }).then((r) => r.data),
  accept: (id: string) =>
    api.patch(`/samples/${id}/accept`).then((r) => r.data),
  addSignature: (id: string, body: { role: string; fullName: string; tcKimlikNo?: string; signatureSvg: string }) =>
    api.post(`/samples/${id}/signatures`, body).then((r) => r.data),
  getAudit: (id: string) => api.get(`/samples/${id}/audit`).then((r) => r.data),
}
