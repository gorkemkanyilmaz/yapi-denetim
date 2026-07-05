export enum SampleStatus {
  CREATED = 'created',
  COLLECTED = 'collected',
  IN_TRANSIT = 'in_transit',
  RECEIVED = 'received',
  IN_CURING = 'in_curing',
  SCHEDULED_FOR_TEST = 'scheduled_for_test',
  TESTED = 'tested',
  APPROVED = 'approved',
  ARCHIVED = 'archived',
}

export enum MaterialType {
  CONCRETE = 'concrete',
  STEEL = 'steel',
  SOIL = 'soil',
  AGGREGATE = 'aggregate',
}

export enum UserRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  FIELD_TECH = 'field_tech',
  COURIER = 'courier',
  LAB_TECHNICIAN = 'lab_technician',
  QC_ENGINEER = 'qc_engineer',
  ADMIN = 'admin',
}

export enum SlaAlertLevel {
  NORMAL = 'normal',
  WARNING = 'warning',
  CRITICAL = 'critical',
  BLOCKED = 'blocked',
}

export enum HakedisStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  INVOICED = 'invoiced',
  PAID = 'paid',
}

export enum SyncStatus {
  PENDING = 'pending',
  SYNCED = 'synced',
  FAILED = 'failed',
}

export enum StakeholderRole {
  DENETCI_MUHENDIS = 'denetci_muhendis',
  SANTIYE_SEFI = 'santiye_sefi',
  BETON_TESISI_YETKILISI = 'beton_tesisi_yetkilisi',
}

export const VALID_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  [SampleStatus.CREATED]: [SampleStatus.COLLECTED],
  [SampleStatus.COLLECTED]: [SampleStatus.IN_TRANSIT],
  [SampleStatus.IN_TRANSIT]: [SampleStatus.RECEIVED],
  [SampleStatus.RECEIVED]: [SampleStatus.IN_CURING, SampleStatus.SCHEDULED_FOR_TEST],
  [SampleStatus.IN_CURING]: [SampleStatus.SCHEDULED_FOR_TEST],
  [SampleStatus.SCHEDULED_FOR_TEST]: [SampleStatus.TESTED],
  [SampleStatus.TESTED]: [SampleStatus.APPROVED],
  [SampleStatus.APPROVED]: [SampleStatus.ARCHIVED],
  [SampleStatus.ARCHIVED]: [],
}

export const SLA_MOLD_REMOVAL_MAX_HOURS = 24
export const SLA_MOLD_REMOVAL_WARN_HOURS = 16
export const SLA_TEST_WINDOW_ADVANCE_HOURS = 48
export const SLA_CURING_DISCHARGE_MAX_HOURS = 2
export const GEOFENCE_DEFAULT_RADIUS_M = 200
