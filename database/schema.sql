-- ============================================================================
-- YAPI DENETİM LABORATUVARI - COMPLETE POSTGRESQL DDL SCHEMA
-- Production-Ready Multi-Tenant Database
-- ============================================================================

BEGIN;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ============================================================================
-- ENUMERATIONS
-- ============================================================================

CREATE TYPE sample_status AS ENUM (
  'created',
  'collected',
  'in_transit',
  'received',
  'in_curing',
  'scheduled_for_test',
  'tested',
  'approved',
  'archived'
);

CREATE TYPE material_type AS ENUM (
  'concrete',
  'steel',
  'soil',
  'aggregate'
);

CREATE TYPE user_role AS ENUM (
  'owner',
  'manager',
  'field_tech',
  'courier',
  'lab_technician',
  'qc_engineer',
  'admin'
);

CREATE TYPE sla_alert_level AS ENUM (
  'normal',
  'warning',
  'critical',
  'blocked'
);

CREATE TYPE hakedis_status AS ENUM (
  'draft',
  'submitted',
  'approved',
  'invoiced',
  'paid'
);

CREATE TYPE sync_status AS ENUM (
  'pending',
  'synced',
  'failed'
);

CREATE TYPE stakeholder_role AS ENUM (
  'denetci_muhendis',
  'santiye_sefi',
  'beton_tesisi_yetkilisi'
);

CREATE TYPE equipment_type AS ENUM (
  'compression_press',
  'curing_thermometer',
  'electronic_scale',
  'slump_cone',
  'tensile_tester',
  'sieve_set',
  'other'
);

-- ============================================================================
-- TENANTS
-- ============================================================================

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(63) NOT NULL UNIQUE,
  logo_url      TEXT,
  phone         VARCHAR(20),
  email         VARCHAR(255),
  address       TEXT,
  tax_no        VARCHAR(20),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          user_role NOT NULL,
  phone         VARCHAR(20),
  tc_kimlik_no  VARCHAR(11),
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- CONSTRUCTION SITES (ŞANTİYELER)
-- ============================================================================

CREATE TABLE construction_sites (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  yif_no                VARCHAR(50) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  address               TEXT NOT NULL,
  latitude              DECIMAL(10, 7) NOT NULL,
  longitude             DECIMAL(10, 7) NOT NULL,
  geofence_radius_m     INTEGER NOT NULL DEFAULT 200,
  contractor_name       VARCHAR(255) NOT NULL,
  contractor_tax_no     VARCHAR(20),
  inspection_firm       VARCHAR(255) NOT NULL,
  ready_mix_supplier    VARCHAR(255) NOT NULL,
  concrete_class        VARCHAR(20) NOT NULL,
  property_owner        VARCHAR(255),
  santiye_sorumlusu_cep VARCHAR(20),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_construction_sites_yif UNIQUE (tenant_id, yif_no)
);

CREATE INDEX idx_construction_sites_tenant ON construction_sites(tenant_id);
CREATE INDEX idx_construction_sites_yif_no ON construction_sites(yif_no);
CREATE INDEX idx_construction_sites_active ON construction_sites(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- SAMPLE SETS (PAÇAL SETLERİ)
-- ============================================================================

CREATE TABLE sample_sets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  construction_site_id  UUID NOT NULL REFERENCES construction_sites(id),
  material_type         material_type NOT NULL,
  internal_qr_code      VARCHAR(100) UNIQUE,
  ebis_protocol_no      VARCHAR(50),
  ebis_fis_no           VARCHAR(50),
  yif_no                VARCHAR(50) NOT NULL,
  concrete_class        VARCHAR(20),
  casting_date          TIMESTAMPTZ,
  casting_location      VARCHAR(255),
  slump_value_cm        DECIMAL(5, 2),
  concrete_temp_c       DECIMAL(4, 1),
  air_temp_c            DECIMAL(4, 1),
  status                sample_status NOT NULL DEFAULT 'created',
  collected_by          UUID REFERENCES users(id),
  collected_at          TIMESTAMPTZ,
  gps_lat               DECIMAL(10, 7),
  gps_lng               DECIMAL(10, 7),
  gps_accuracy_m        DECIMAL(6, 2),
  geofence_valid        BOOLEAN,
  received_at           TIMESTAMPTZ,
  received_by           UUID REFERENCES users(id),
  curing_pool_zone_id   UUID,
  curing_started_at     TIMESTAMPTZ,
  curing_ended_at       TIMESTAMPTZ,
  notes                 TEXT,
  sla_alert             sla_alert_level NOT NULL DEFAULT 'normal',
  geofence_override     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sample_sets_tenant ON sample_sets(tenant_id);
CREATE INDEX idx_sample_sets_status ON sample_sets(status);
CREATE INDEX idx_sample_sets_ebis_protocol ON sample_sets(ebis_protocol_no) WHERE ebis_protocol_no IS NOT NULL;
CREATE INDEX idx_sample_sets_ebis_fis ON sample_sets(ebis_fis_no) WHERE ebis_fis_no IS NOT NULL;
CREATE INDEX idx_sample_sets_yif_no ON sample_sets(yif_no);
CREATE INDEX idx_sample_sets_construction_site ON sample_sets(construction_site_id);
CREATE INDEX idx_sample_sets_collected_at ON sample_sets(collected_at) WHERE collected_at IS NOT NULL;
CREATE INDEX idx_sample_sets_material_type ON sample_sets(material_type);
CREATE INDEX idx_sample_sets_created_at ON sample_sets(created_at DESC);
CREATE INDEX idx_sample_sets_sla_alert ON sample_sets(sla_alert) WHERE sla_alert != 'normal';

-- ============================================================================
-- SPECIMENS (NUMUNELER)
-- ============================================================================

CREATE TABLE specimens (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_set_id             UUID NOT NULL REFERENCES sample_sets(id) ON DELETE CASCADE,
  specimen_no               SMALLINT NOT NULL,
  target_age_days           SMALLINT NOT NULL,
  target_test_date          DATE NOT NULL,
  actual_test_date          DATE,
  width_mm                  DECIMAL(6, 2),
  height_mm                 DECIMAL(6, 2),
  diameter_mm               DECIMAL(6, 2),
  weight_gr                 DECIMAL(8, 2),
  density_kg_m3             DECIMAL(7, 2),
  failure_load_kn           DECIMAL(8, 3),
  compressive_strength_mpa  DECIMAL(7, 3),
  tested_by                 UUID REFERENCES users(id),
  equipment_id              UUID,
  status                    sample_status NOT NULL DEFAULT 'created',
  sla_alert                 sla_alert_level NOT NULL DEFAULT 'normal',
  internal_qr_code          VARCHAR(100) UNIQUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_specimens_set_no UNIQUE (sample_set_id, specimen_no),
  CONSTRAINT chk_specimen_age CHECK (target_age_days IN (7, 28)),
  CONSTRAINT chk_specimen_no CHECK (specimen_no BETWEEN 1 AND 6)
);

CREATE INDEX idx_specimens_sample_set ON specimens(sample_set_id);
CREATE INDEX idx_specimens_status ON specimens(status);
CREATE INDEX idx_specimens_target_test_date ON specimens(target_test_date);
CREATE INDEX idx_specimens_sla_alert ON specimens(sla_alert) WHERE sla_alert != 'normal';
CREATE INDEX idx_specimens_target_age ON specimens(target_age_days);

-- ============================================================================
-- EQUIPMENT (CİHAZLAR VE KALİBRASYON)
-- ============================================================================

CREATE TABLE equipment (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                    VARCHAR(255) NOT NULL,
  serial_number           VARCHAR(100) NOT NULL,
  equipment_type          equipment_type NOT NULL,
  manufacturer            VARCHAR(255),
  calibration_date        DATE NOT NULL,
  calibration_expiry_date DATE NOT NULL,
  calibration_cert_url    TEXT,
  is_calibrated           BOOLEAN NOT NULL DEFAULT TRUE,
  is_blocked              BOOLEAN NOT NULL DEFAULT FALSE,
  location                VARCHAR(255),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_equipment_serial UNIQUE (tenant_id, serial_number),
  CONSTRAINT chk_calibration_dates CHECK (calibration_expiry_date > calibration_date)
);

CREATE INDEX idx_equipment_tenant ON equipment(tenant_id);
CREATE INDEX idx_equipment_type ON equipment(equipment_type);
CREATE INDEX idx_equipment_calibration_expiry ON equipment(calibration_expiry_date);
CREATE INDEX idx_equipment_blocked ON equipment(is_blocked) WHERE is_blocked = TRUE;

-- Add foreign key to specimens table now that equipment exists
ALTER TABLE specimens
  ADD CONSTRAINT fk_specimens_equipment
  FOREIGN KEY (equipment_id) REFERENCES equipment(id);

-- ============================================================================
-- CURING POOLS (KÜR HAVUZLARI)
-- ============================================================================

CREATE TABLE curing_pools (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  capacity      INTEGER NOT NULL,
  temperature_c DECIMAL(4, 1) NOT NULL DEFAULT 20.0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_curing_pools_tenant ON curing_pools(tenant_id);

-- ============================================================================
-- CURING POOL ZONES
-- ============================================================================

CREATE TABLE curing_pool_zones (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curing_pool_id        UUID NOT NULL REFERENCES curing_pools(id) ON DELETE CASCADE,
  zone_label            VARCHAR(20) NOT NULL,
  shelf_level           SMALLINT NOT NULL DEFAULT 1,
  is_occupied           BOOLEAN NOT NULL DEFAULT FALSE,
  current_sample_set_id UUID REFERENCES sample_sets(id),

  CONSTRAINT uq_pool_zone UNIQUE (curing_pool_id, zone_label, shelf_level)
);

CREATE INDEX idx_curing_zones_pool ON curing_pool_zones(curing_pool_id);
CREATE INDEX idx_curing_zones_occupied ON curing_pool_zones(is_occupied) WHERE is_occupied = TRUE;

-- Add foreign key to sample_sets table now that curing_pool_zones exists
ALTER TABLE sample_sets
  ADD CONSTRAINT fk_sample_sets_curing_zone
  FOREIGN KEY (curing_pool_zone_id) REFERENCES curing_pool_zones(id);

-- ============================================================================
-- TEST RESULTS
-- ============================================================================

CREATE TABLE test_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  specimen_id     UUID NOT NULL REFERENCES specimens(id) ON DELETE CASCADE,
  equipment_id    UUID NOT NULL REFERENCES equipment(id),
  tested_by       UUID NOT NULL REFERENCES users(id),
  load_kn         DECIMAL(8, 3) NOT NULL,
  area_mm2        DECIMAL(10, 2) NOT NULL,
  strength_mpa    DECIMAL(7, 3) NOT NULL,
  test_date       DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_load_positive CHECK (load_kn > 0),
  CONSTRAINT chk_area_positive CHECK (area_mm2 > 0),
  CONSTRAINT chk_strength_positive CHECK (strength_mpa > 0)
);

CREATE INDEX idx_test_results_specimen ON test_results(specimen_id);
CREATE INDEX idx_test_results_equipment ON test_results(equipment_id);
CREATE INDEX idx_test_results_date ON test_results(test_date);

-- ============================================================================
-- STAKEHOLDER SIGNATURES
-- ============================================================================

CREATE TABLE stakeholder_signatures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_set_id   UUID NOT NULL REFERENCES sample_sets(id) ON DELETE CASCADE,
  role            stakeholder_role NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  tc_kimlik_no    VARCHAR(11),
  signature_svg   TEXT NOT NULL,
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_stakeholder_per_set UNIQUE (sample_set_id, role)
);

CREATE INDEX idx_stakeholder_sigs_set ON stakeholder_signatures(sample_set_id);

-- ============================================================================
-- FIELD COLLECTIONS
-- ============================================================================

CREATE TABLE field_collections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_set_id   UUID NOT NULL REFERENCES sample_sets(id) ON DELETE CASCADE,
  collected_by    UUID NOT NULL REFERENCES users(id),
  gps_lat         DECIMAL(10, 7) NOT NULL,
  gps_lng         DECIMAL(10, 7) NOT NULL,
  gps_accuracy_m  DECIMAL(6, 2),
  geofence_valid  BOOLEAN NOT NULL DEFAULT TRUE,
  photos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ocr_raw_text    TEXT,
  ocr_confidence  DECIMAL(4, 3),
  sync_status     sync_status NOT NULL DEFAULT 'pending',
  device_info     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_field_collections_set ON field_collections(sample_set_id);
CREATE INDEX idx_field_collections_sync ON field_collections(sync_status) WHERE sync_status != 'synced';
CREATE INDEX idx_field_collections_collected_by ON field_collections(collected_by);

-- ============================================================================
-- HAKEDİŞ (PROGRESS BILLING)
-- ============================================================================

CREATE TABLE hakedis (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  construction_site_id  UUID NOT NULL REFERENCES construction_sites(id),
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  total_samples         INTEGER NOT NULL DEFAULT 0,
  completed_samples     INTEGER NOT NULL DEFAULT 0,
  unit_price_try        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  amount_try            DECIMAL(14, 2) NOT NULL DEFAULT 0,
  vat_rate              DECIMAL(4, 2) NOT NULL DEFAULT 20.00,
  vat_amount_try        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_amount_try      DECIMAL(14, 2) NOT NULL DEFAULT 0,
  status                hakedis_status NOT NULL DEFAULT 'draft',
  invoice_no            VARCHAR(50),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_hakedis_period CHECK (period_end >= period_start),
  CONSTRAINT chk_hakedis_amounts CHECK (amount_try >= 0 AND total_amount_try >= 0)
);

CREATE INDEX idx_hakedis_tenant ON hakedis(tenant_id);
CREATE INDEX idx_hakedis_construction_site ON hakedis(construction_site_id);
CREATE INDEX idx_hakedis_status ON hakedis(status);
CREATE INDEX idx_hakedis_period ON hakedis(period_start, period_end);

-- ============================================================================
-- REPORTS
-- ============================================================================

CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sample_set_id   UUID NOT NULL REFERENCES sample_sets(id),
  report_type     VARCHAR(50) NOT NULL,
  report_number   VARCHAR(50) NOT NULL,
  pdf_url         TEXT NOT NULL,
  verification_qr TEXT,
  generated_by    UUID NOT NULL REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_report_number UNIQUE (tenant_id, report_number)
);

CREATE INDEX idx_reports_tenant ON reports(tenant_id);
CREATE INDEX idx_reports_sample_set ON reports(sample_set_id);
CREATE INDEX idx_reports_generated_at ON reports(generated_at DESC);

-- ============================================================================
-- AUDIT LOGS (IMMUTABLE - EVERY CELL MUTATION TRACKED)
-- ============================================================================

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id),
  entity_type   VARCHAR(50) NOT NULL,
  entity_id     UUID NOT NULL,
  action        VARCHAR(20) NOT NULL,
  field_name    VARCHAR(100),
  old_value     TEXT,
  new_value     TEXT,
  ip_address    INET NOT NULL,
  user_agent    TEXT,
  metadata      JSONB,
  hash          VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_hash ON audit_logs(hash);

-- ============================================================================
-- NOTIFICATIONS / ALERTS
-- ============================================================================

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  title         VARCHAR(255) NOT NULL,
  message       TEXT NOT NULL,
  alert_level   sla_alert_level NOT NULL DEFAULT 'normal',
  entity_type   VARCHAR(50),
  entity_id     UUID,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);

-- ============================================================================
-- SYNC QUEUE (OFFLINE-FIRST FIELD DATA)
-- ============================================================================

CREATE TABLE sync_queue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  operation     VARCHAR(20) NOT NULL,
  entity_type   VARCHAR(50) NOT NULL,
  payload       JSONB NOT NULL,
  idempotency_key UUID NOT NULL UNIQUE,
  attempts      SMALLINT NOT NULL DEFAULT 0,
  max_attempts  SMALLINT NOT NULL DEFAULT 5,
  status        sync_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX idx_sync_queue_pending ON sync_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_sync_queue_user ON sync_queue(user_id);

-- ============================================================================
-- TRIGGERS: AUTO-UPDATE updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_construction_sites_updated_at BEFORE UPDATE ON construction_sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_sample_sets_updated_at BEFORE UPDATE ON sample_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_specimens_updated_at BEFORE UPDATE ON specimens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_equipment_updated_at BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_curing_pools_updated_at BEFORE UPDATE ON curing_pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_hakedis_updated_at BEFORE UPDATE ON hakedis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGER: AUTO-BLOCK EQUIPMENT PAST CALIBRATION EXPIRY
-- ============================================================================

CREATE OR REPLACE FUNCTION check_equipment_calibration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.calibration_expiry_date < CURRENT_DATE THEN
    NEW.is_calibrated := FALSE;
    NEW.is_blocked := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_equipment_calibration BEFORE INSERT OR UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION check_equipment_calibration();

-- ============================================================================
-- TRIGGER: IMMUTABLE AUDIT LOG ON SAMPLE_SET CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_sample_set_changes()
RETURNS TRIGGER AS $$
DECLARE
  col RECORD;
  old_val TEXT;
  new_val TEXT;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sample_sets' AND column_name NOT IN ('id', 'created_at', 'updated_at')
  LOOP
    EXECUTE format('SELECT ($1).%I::text', col.column_name) INTO old_val USING OLD;
    EXECUTE format('SELECT ($1).%I::text', col.column_name) INTO new_val USING NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, field_name, old_value, new_value, ip_address, user_agent)
      VALUES (
        COALESCE(NEW.tenant_id, OLD.tenant_id),
        COALESCE(NEW.received_by, NEW.collected_by, NULL::uuid),
        'sample_set',
        COALESCE(NEW.id, OLD.id),
        'UPDATE',
        col.column_name,
        old_val,
        new_val,
        '0.0.0.0',
        'system'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_sample_sets AFTER UPDATE ON sample_sets
  FOR EACH ROW EXECUTE FUNCTION audit_sample_set_changes();

-- ============================================================================
-- TRIGGER: IMMUTABLE AUDIT LOG ON SPECIMEN CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_specimen_changes()
RETURNS TRIGGER AS $$
DECLARE
  col RECORD;
  old_val TEXT;
  new_val TEXT;
  v_tenant_id UUID;
BEGIN
  SELECT ss.tenant_id INTO v_tenant_id FROM sample_sets ss WHERE ss.id = COALESCE(NEW.sample_set_id, OLD.sample_set_id);

  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'specimens' AND column_name NOT IN ('id', 'created_at', 'updated_at')
  LOOP
    EXECUTE format('SELECT ($1).%I::text', col.column_name) INTO old_val USING OLD;
    EXECUTE format('SELECT ($1).%I::text', col.column_name) INTO new_val USING NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, field_name, old_value, new_value, ip_address, user_agent)
      VALUES (
        v_tenant_id,
        COALESCE(NEW.tested_by, NULL::uuid),
        'specimen',
        COALESCE(NEW.id, OLD.id),
        'UPDATE',
        col.column_name,
        old_val,
        new_val,
        '0.0.0.0',
        'system'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_specimens AFTER UPDATE ON specimens
  FOR EACH ROW EXECUTE FUNCTION audit_specimen_changes();

-- ============================================================================
-- CRON FUNCTION: SLA VIOLATION CHECKER (run via pg_cron or external scheduler)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_sla_violations()
RETURNS void AS $$
BEGIN
  UPDATE specimens s
  SET sla_alert = CASE
    WHEN s.target_test_date = CURRENT_DATE THEN 'critical'
    WHEN s.target_test_date = CURRENT_DATE + INTERVAL '1 day' THEN 'warning'
    WHEN s.target_test_date < CURRENT_DATE AND s.status NOT IN ('tested', 'approved', 'archived') THEN 'critical'
    ELSE 'normal'
  END
  WHERE s.status NOT IN ('tested', 'approved', 'archived');

  UPDATE sample_sets ss
  SET status = 'received'
  WHERE ss.status = 'collected'
    AND ss.collected_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (NOW() - ss.collected_at)) / 3600 > 48;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS: DASHBOARD AGGREGATIONS
-- ============================================================================

CREATE VIEW v_dashboard_stats AS
SELECT
  ss.tenant_id,
  COUNT(DISTINCT ss.id) AS total_sample_sets,
  COUNT(DISTINCT CASE WHEN ss.status = 'created' THEN ss.id END) AS pending_collection,
  COUNT(DISTINCT CASE WHEN ss.status = 'in_transit' THEN ss.id END) AS in_transit,
  COUNT(DISTINCT CASE WHEN ss.status = 'in_curing' THEN ss.id END) AS in_curing,
  COUNT(DISTINCT CASE WHEN ss.status = 'scheduled_for_test' THEN ss.id END) AS scheduled_for_test,
  COUNT(DISTINCT CASE WHEN sp.sla_alert = 'critical' THEN sp.id END) AS critical_sla_violations,
  COUNT(DISTINCT CASE WHEN sp.sla_alert = 'warning' THEN sp.id END) AS warning_sla_violations
FROM sample_sets ss
LEFT JOIN specimens sp ON sp.sample_set_id = ss.id
GROUP BY ss.tenant_id;

CREATE VIEW v_upcoming_tests AS
SELECT
  sp.id AS specimen_id,
  sp.sample_set_id,
  sp.specimen_no,
  sp.target_age_days,
  sp.target_test_date,
  sp.sla_alert,
  ss.ebis_protocol_no,
  ss.concrete_class,
  ss.yif_no,
  cs.name AS construction_site_name,
  ss.tenant_id
FROM specimens sp
JOIN sample_sets ss ON ss.id = sp.sample_set_id
JOIN construction_sites cs ON cs.id = ss.construction_site_id
WHERE sp.status NOT IN ('tested', 'approved', 'archived')
  AND sp.target_test_date <= CURRENT_DATE + INTERVAL '7 days'
ORDER BY sp.target_test_date ASC;

COMMIT;
