-- ============================================================================
-- MIGRATION 003: FİRMA KULLANIM SÜRESİ (TENANT EXPIRY)
-- Her tenant (firma) için bir son kullanma tarihi tanımlanır.
-- Tarih geçtiğinde tüm kullanıcılar giriş yapamaz; mevcut session'lar da
-- sunucu tarafından 403 ile reddedilir. Veriler SİLİNMEZ.
-- ============================================================================

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS expires_at DATE;

COMMENT ON COLUMN tenants.expires_at
  IS 'Firmanın uygulamayı kullanabileceği son tarih. Bu tarihten sonra tüm girişler engellenir.';

-- Mevcut tenant (ankara-ydl) için 2026-12-31 set et
UPDATE tenants
   SET expires_at = '2026-12-31'
 WHERE slug = 'ankara-ydl'
   AND expires_at IS NULL;

COMMIT;
