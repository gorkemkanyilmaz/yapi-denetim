-- ============================================================================
-- MIGRATION 005: AUDIT TRIGGERS, INDEXES, AND SECURITY FIXES
-- ============================================================================

BEGIN;

-- ============================================================================
-- ADD INSERT/DELETE AUDIT TRIGGERS FOR sample_sets
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_sample_set_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, field_name, old_value, new_value, ip_address, user_agent)
  VALUES (
    NEW.tenant_id,
    NEW.assigned_to,
    'sample_set',
    NEW.id,
    'INSERT',
    NULL,
    NULL,
    NEW.yif_no || ' (' || NEW.material_type || ')',
    '0.0.0.0',
    'system'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_sample_set_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, field_name, old_value, new_value, ip_address, user_agent)
  VALUES (
    OLD.tenant_id,
    NULL,
    'sample_set',
    OLD.id,
    'DELETE',
    NULL,
    OLD.yif_no || ' (' || OLD.material_type || ')',
    NULL,
    '0.0.0.0',
    'system'
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_sample_sets_insert ON sample_sets;
CREATE TRIGGER trg_audit_sample_sets_insert
  AFTER INSERT ON sample_sets
  FOR EACH ROW EXECUTE FUNCTION audit_sample_set_insert();

DROP TRIGGER IF EXISTS trg_audit_sample_sets_delete ON sample_sets;
CREATE TRIGGER trg_audit_sample_sets_delete
  AFTER DELETE ON sample_sets
  FOR EACH ROW EXECUTE FUNCTION audit_sample_set_delete();

-- ============================================================================
-- ADD INSERT/DELETE AUDIT TRIGGERS FOR specimens
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_specimen_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT ss.tenant_id INTO v_tenant_id FROM sample_sets ss WHERE ss.id = NEW.sample_set_id;
  INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, field_name, old_value, new_value, ip_address, user_agent)
  VALUES (
    v_tenant_id,
    NULL,
    'specimen',
    NEW.id,
    'INSERT',
    NULL,
    NULL,
    'Specimen #' || NEW.specimen_no || ' (age=' || NEW.target_age_days || 'd)',
    '0.0.0.0',
    'system'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_specimen_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT ss.tenant_id INTO v_tenant_id FROM sample_sets ss WHERE ss.id = OLD.sample_set_id;
  INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, field_name, old_value, new_value, ip_address, user_agent)
  VALUES (
    v_tenant_id,
    NULL,
    'specimen',
    OLD.id,
    'DELETE',
    NULL,
    'Specimen #' || OLD.specimen_no || ' (age=' || OLD.target_age_days || 'd)',
    NULL,
    '0.0.0.0',
    'system'
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_specimens_insert ON specimens;
CREATE TRIGGER trg_audit_specimens_insert
  AFTER INSERT ON specimens
  FOR EACH ROW EXECUTE FUNCTION audit_specimen_insert();

DROP TRIGGER IF EXISTS trg_audit_specimens_delete ON specimens;
CREATE TRIGGER trg_audit_specimens_delete
  AFTER DELETE ON specimens
  FOR EACH ROW EXECUTE FUNCTION audit_specimen_delete();

-- ============================================================================
-- MISSING COMPOSITE INDEXES FOR 100K+ ROW TABLES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sample_sets_tenant_status ON sample_sets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sample_sets_tenant_yif ON sample_sets(tenant_id, yif_no);
CREATE INDEX IF NOT EXISTS idx_sample_sets_tenant_created ON sample_sets(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_specimens_target_date_set ON specimens(target_test_date, sample_set_id);
CREATE INDEX IF NOT EXISTS idx_hakedis_tenant_period ON hakedis(tenant_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_field_collections_created ON field_collections(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_tenant_generated ON reports(tenant_id, generated_at DESC);

-- ============================================================================
-- FIX: internal_qr_code should be per-tenant UNIQUE, not global
-- ============================================================================

ALTER TABLE sample_sets DROP CONSTRAINT IF EXISTS sample_sets_internal_qr_code_key;
ALTER TABLE sample_sets ADD CONSTRAINT uq_sample_sets_tenant_qr UNIQUE (tenant_id, internal_qr_code);

-- ============================================================================
-- FIX: test_results should have UNIQUE on specimen_id to prevent duplicates
-- ============================================================================

ALTER TABLE test_results ADD CONSTRAINT uq_test_results_specimen UNIQUE (specimen_id);

-- ============================================================================
-- FIX: specimens.chk_specimen_age should allow more age values per TS EN 12390
-- ============================================================================

ALTER TABLE specimens DROP CONSTRAINT IF EXISTS chk_specimen_age;
ALTER TABLE specimens ADD CONSTRAINT chk_specimen_age CHECK (target_age_days IN (1, 2, 3, 7, 14, 28, 56, 90));

-- ============================================================================
-- FIX: specimens.chk_specimen_no should allow more specimen numbers
-- ============================================================================

ALTER TABLE specimens DROP CONSTRAINT IF EXISTS chk_specimen_no;
ALTER TABLE specimens ADD CONSTRAINT chk_specimen_no CHECK (specimen_no BETWEEN 1 AND 9);

COMMIT;
