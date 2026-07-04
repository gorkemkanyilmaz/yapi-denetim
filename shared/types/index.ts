import type { SampleStatus, MaterialType, UserRole, SlaAlertLevel } from '@shared/types/enums'

export interface Tenant {
  id: string
  name: string
  slug: string
  logo_url: string | null
  created_at: string
}

export interface User {
  id: string
  tenant_id: string
  email: string
  full_name: string
  role: UserRole
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

export interface ConstructionSite {
  id: string
  tenant_id: string
  yif_no: string
  name: string
  address: string
  latitude: number
  longitude: number
  geofence_radius_m: number
  contractor_name: string
  inspection_firm: string
  ready_mix_supplier: string
  concrete_class: string
  is_active: boolean
  created_at: string
}

export interface SampleSet {
  id: string
  tenant_id: string
  construction_site_id: string
  material_type: MaterialType
  ebis_protocol_no: string | null
  ebis_fis_no: string | null
  yif_no: string
  concrete_class: string | null
  casting_date: string | null
  casting_location: string | null
  slump_value_cm: number | null
  concrete_temp_c: number | null
  air_temp_c: number | null
  status: SampleStatus
  collected_by: string | null
  collected_at: string | null
  gps_lat: number | null
  gps_lng: number | null
  geofence_valid: boolean | null
  received_at: string | null
  received_by: string | null
  curing_pool_zone_id: string | null
  curing_started_at: string | null
  curing_ended_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Specimen {
  id: string
  sample_set_id: string
  specimen_no: number
  target_age_days: number
  target_test_date: string
  actual_test_date: string | null
  width_mm: number | null
  height_mm: number | null
  diameter_mm: number | null
  weight_gr: number | null
  density_kg_m3: number | null
  failure_load_kn: number | null
  compressive_strength_mpa: number | null
  tested_by: string | null
  equipment_id: string | null
  status: SampleStatus
  sla_alert: SlaAlertLevel
  created_at: string
  updated_at: string
}

export interface Equipment {
  id: string
  tenant_id: string
  name: string
  serial_number: string
  equipment_type: string
  calibration_date: string
  calibration_expiry_date: string
  is_calibrated: boolean
  is_blocked: boolean
  notes: string | null
  created_at: string
}

export interface CuringPool {
  id: string
  tenant_id: string
  name: string
  capacity: number
  temperature_c: number
  notes: string | null
  created_at: string
}

export interface CuringPoolZone {
  id: string
  curing_pool_id: string
  zone_label: string
  shelf_level: number
  is_occupied: boolean
  current_sample_set_id: string | null
}

export interface TestResult {
  id: string
  specimen_id: string
  equipment_id: string
  tested_by: string
  load_kn: number
  area_mm2: number
  strength_mpa: number
  test_date: string
  notes: string | null
  created_at: string
}

export interface StakeholderSignature {
  id: string
  sample_set_id: string
  role: 'denetci_muhendis' | 'santiye_sefi' | 'beton_tesisi_yetkilisi'
  full_name: string
  tc_kimlik_no: string | null
  signature_svg: string
  signed_at: string
}

export interface FieldCollection {
  id: string
  sample_set_id: string
  collected_by: string
  gps_lat: number
  gps_lng: number
  gps_accuracy_m: number
  geofence_valid: boolean
  photos: string[]
  ocr_raw_text: string | null
  ocr_confidence: number | null
  sync_status: 'pending' | 'synced' | 'failed'
  created_at: string
}

export interface AuditLog {
  id: string
  tenant_id: string
  user_id: string
  entity_type: string
  entity_id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  ip_address: string
  user_agent: string
  created_at: string
}

export interface Hakedis {
  id: string
  tenant_id: string
  construction_site_id: string
  period_start: string
  period_end: string
  total_samples: number
  completed_samples: number
  amount_try: number
  status: 'draft' | 'submitted' | 'approved' | 'invoiced' | 'paid'
  invoice_no: string | null
  created_at: string
}

export interface Report {
  id: string
  tenant_id: string
  sample_set_id: string
  report_type: string
  report_number: string
  pdf_url: string
  generated_by: string
  approved_by: string | null
  generated_at: string
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  meta?: {
    page: number
    per_page: number
    total: number
    total_pages: number
  }
}

export interface SlaViolation {
  specimen_id: string
  sample_set_id: string
  violation_type: 'mold_removal' | 'testing_window' | 'curing_discharge'
  severity: SlaAlertLevel
  deadline: string
  elapsed_hours: number
  message: string
}

export interface BatchStatistics {
  sample_set_id: string
  age_days: number
  specimens_tested: number
  mean_strength_mpa: number
  std_deviation_mpa: number
  min_strength_mpa: number
  max_strength_mpa: number
  characteristic_strength_mpa: number
  passes_ts_en_206: boolean
}
