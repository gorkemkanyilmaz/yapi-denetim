import { api } from './api'

export const specimensApi = {
  list: () => api.get('/specimens').then((r) => r.data),
  upcomingTests: () => api.get('/specimens/upcoming-tests').then((r) => r.data),
  slaViolations: () => api.get('/specimens/sla-violations').then((r) => r.data),
  get: (id: string) => api.get(`/specimens/${id}`).then((r) => r.data),
  submitTestResult: (id: string, body: {
    widthMm: number; heightMm: number; diameterMm?: number; weightGr: number;
    failureLoadKn: number; equipmentId: string; notes?: string;
  }) => api.post(`/specimens/${id}/test-result`, body).then((r) => r.data),
  pacal: (sampleSetId: string) => api.get(`/specimens/by-sample-set/${sampleSetId}/pacal`).then((r) => r.data),
}

export const equipmentApi = {
  list: () => api.get('/equipment').then((r) => r.data),
  expiring: () => api.get('/equipment/expiring').then((r) => r.data),
  create: (body: { name: string; serialNumber: string; equipmentType: string; calibrationDate: string; calibrationExpiryDate: string; manufacturer?: string }) =>
    api.post('/equipment', body).then((r) => r.data),
  recalibrate: (id: string, body: { calibrationDate: string; calibrationExpiryDate: string }) =>
    api.patch(`/equipment/${id}/calibrate`, body).then((r) => r.data),
}

export const curingPoolsApi = {
  list: () => api.get('/curing-pools').then((r) => r.data),
  getZones: (id: string) => api.get(`/curing-pools/${id}/zones`).then((r) => r.data),
  create: (body: { name: string; capacity: number; temperatureC?: number; notes?: string; numShelves?: number; zonesPerShelf?: number }) =>
    api.post('/curing-pools', body).then((r) => r.data),
  update: (id: string, body: { name: string; capacity: number; temperatureC?: number; notes?: string; isActive?: boolean; numShelves?: number; zonesPerShelf?: number }) =>
    api.patch(`/curing-pools/${id}`, body).then((r) => r.data),
  assign: (poolId: string, zoneId: string, sampleSetId: string) =>
    api.post(`/curing-pools/${poolId}/zones/${zoneId}/assign`, { sampleSetId }).then((r) => r.data),
  release: (poolId: string, zoneId: string) =>
    api.post(`/curing-pools/${poolId}/zones/${zoneId}/release`).then((r) => r.data),
}

export const hakedisApi = {
  list: () => api.get('/hakedis').then((r) => r.data),
  create: (body: { constructionSiteId: string; periodStart: string; periodEnd: string; unitPriceTry: number; vatRate?: number }) =>
    api.post('/hakedis', body).then((r) => r.data),
  updateStatus: (id: string, body: { status: string; invoiceNo?: string }) =>
    api.patch(`/hakedis/${id}/status`, body).then((r) => r.data),
  exportUrl: (id: string) => `/api/hakedis/${id}/export`,
}

export const reportsApi = {
  generate: (sampleSetId: string, reportType?: string) =>
    api.post('/reports/generate', { sampleSetId, reportType }).then((r) => r.data),
  getPdfUrl: (id: string) => `/api/reports/${id}/pdf`,
  batchGenerate: (sampleSetIds: string[]) =>
    api.post('/reports/batch-generate', { sampleSetIds }).then((r) => r.data),
}

export const dashboardApi = {
  stats: () => api.get('/dashboard/stats').then((r) => r.data),
  kanban: () => api.get('/dashboard/kanban').then((r) => r.data),
  calendar: () => api.get('/dashboard/calendar').then((r) => r.data),
  map: () => api.get('/dashboard/map').then((r) => r.data),
  financial: () => api.get('/dashboard/financial').then((r) => r.data),
}

export const fieldApi = {
  create: (body: { sampleSetId: string; gps: { lat: number; lng: number; accuracyM?: number }; photos?: string[]; ocrText?: string }) =>
    api.post('/field-collections', body).then((r) => r.data),
  ocr: (file: File) => {
    const fd = new FormData()
    fd.append('receipt', file)
    return api.post('/field-collections/ocr', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  validateGeofence: (body: { siteId: string; lat: number; lng: number }) =>
    api.post('/field-collections/validate-geofence', body).then((r) => r.data),
  bulkSync: (operations: Array<{ idempotencyKey: string; entityType: string; payload: Record<string, unknown> }>) =>
    api.post('/field-collections/sync', { operations }).then((r) => r.data),
}
