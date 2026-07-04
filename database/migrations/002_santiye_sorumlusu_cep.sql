-- ============================================================================
-- MIGRATION 002: ŞANTİYE SORUMLUSU CEP TELEFONU
-- Şantiye sahasındaki yetkili kişinin (şantiye şefi / sorumlu) cep telefonu
-- bilgisinin eklenmesi. Saha personelinin iletişim kurabilmesi için.
-- ============================================================================

BEGIN;

ALTER TABLE construction_sites
  ADD COLUMN IF NOT EXISTS santiye_sorumlusu_cep VARCHAR(20);

COMMENT ON COLUMN construction_sites.santiye_sorumlusu_cep
  IS 'Şantiye sahasındaki yetkili kişinin (şantiye şefi) cep telefonu numarası';

COMMIT;
