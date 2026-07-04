-- ============================================================================
-- MIGRATION 001: QA AUDIT FIXES
-- Adds missing columns required for audit trail integrity, SLA alarm flags,
-- and geofence manager-bypass tracking.
-- ============================================================================

BEGIN;

-- audit_logs: hash-chained immutable audit trail + structured metadata
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS hash    VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_audit_logs_hash ON audit_logs(hash);

-- audit_logs.user_id: allow NULL for system-triggered (PL/pgSQL trigger) audits
-- where no human user is associated (e.g. specimen status cascades). Fixes FK
-- violation that previously rolled back specimen status transitions.
ALTER TABLE audit_logs
  ALTER COLUMN user_id DROP NOT NULL;

-- sample_sets: regulatory SLA alarm flag (mold removal / curing discharge) and
-- geofence manager-bypass sign-off flag ("Şantiye Dışı Giriş" override)
ALTER TABLE sample_sets
  ADD COLUMN IF NOT EXISTS sla_alert          sla_alert_level NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS geofence_override   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sample_sets_sla_alert
  ON sample_sets(sla_alert) WHERE sla_alert != 'normal';

-- Replace trigger functions to use NULL user_id instead of the zero UUID (FK-safe)
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
        'sample_set', COALESCE(NEW.id, OLD.id), 'UPDATE',
        col.column_name, old_val, new_val, '0.0.0.0', 'system'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        'specimen', COALESCE(NEW.id, OLD.id), 'UPDATE',
        col.column_name, old_val, new_val, '0.0.0.0', 'system'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;