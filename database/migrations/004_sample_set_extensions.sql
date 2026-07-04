-- ============================================================================
-- MIGRATION 004: SAMPLE SET EXTENSIONS + BYPASS REQUESTS
-- (assigned_to, unit_price_try, is_accepted, accepted_at, bypass_requests)
-- Bu alanlar backend kodunda ve mevcut Neon DB'de zaten var (ad-hoc scriptlerle
-- eklenmiş). Bu migration bunları canonical schema + numbered migration sistemine
-- dahil eder; fresh install'lar artık çalışır.
-- ============================================================================

BEGIN;

-- sample_sets: assigned_to (kullanıcı ataması)
ALTER TABLE sample_sets
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sample_sets_assigned_to
  ON sample_sets(assigned_to) WHERE assigned_to IS NOT NULL;

-- sample_sets: unit_price_try (hakediş birim fiyat)
ALTER TABLE sample_sets
  ADD COLUMN IF NOT EXISTS unit_price_try DECIMAL(12,2) NOT NULL DEFAULT 0
  CHECK (unit_price_try >= 0);
COMMENT ON COLUMN sample_sets.unit_price_try IS 'Bu numune seti için hakediş birim fiyatı (TL)';

-- sample_sets: is_accepted + accepted_at (saha elemanı görev kabul akışı)
ALTER TABLE sample_sets
  ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
COMMENT ON COLUMN sample_sets.is_accepted IS 'Atanan saha elemanının görevi kabul ettiği bayrak';
COMMENT ON COLUMN sample_sets.accepted_at IS 'Görevin kabul edildiği an';

-- ============================================================================
-- BYPASS REQUESTS (Şantiye Dışı Giriş onay talepleri)
-- Geofence dışından toplama durumunda yönetici onayı için kullanılır.
-- ============================================================================
CREATE TABLE IF NOT EXISTS bypass_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sample_set_id UUID NOT NULL REFERENCES sample_sets(id) ON DELETE CASCADE,
  requested_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  distance_m    INTEGER NOT NULL CHECK (distance_m >= 0),
  threshold_m   INTEGER NOT NULL CHECK (threshold_m > 0),
  token         VARCHAR(50) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_bypass_token UNIQUE (token),
  CONSTRAINT uq_bypass_pending_per_sample UNIQUE (sample_set_id)
);

CREATE INDEX IF NOT EXISTS idx_bypass_tenant ON bypass_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bypass_status ON bypass_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bypass_sample ON bypass_requests(sample_set_id);
CREATE INDEX IF NOT EXISTS idx_bypass_requested_by ON bypass_requests(requested_by);

COMMIT;