-- ============================================================================
-- SEED DATA FOR DEVELOPMENT
-- ============================================================================

BEGIN;

INSERT INTO tenants (id, name, slug, email, phone, address, tax_no)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Ankara Yapı Denetim Lab.',
  'ankara-ydl',
  'info@ankaraydl.com',
  '+90 312 000 0000',
  'Çankaya, Ankara',
  '1234567890'
);

INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, phone)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner@ankaraydl.com', '$2a$12$nnwlCWbooHmlmQ/iv7YskOdDsH9xaIHkSIxYneVPtyQwuG70eT4Am', 'Ahmet Yılmaz', 'owner', '+90 532 000 0001'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'field@ankaraydl.com', '$2a$12$nnwlCWbooHmlmQ/iv7YskOdDsH9xaIHkSIxYneVPtyQwuG70eT4Am', 'Mehmet Demir', 'field_tech', '+90 532 000 0002'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'lab@ankaraydl.com', '$2a$12$nnwlCWbooHmlmQ/iv7YskOdDsH9xaIHkSIxYneVPtyQwuG70eT4Am', 'Ayşe Kaya', 'lab_technician', '+90 532 000 0003'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'qc@ankaraydl.com', '$2a$12$nnwlCWbooHmlmQ/iv7YskOdDsH9xaIHkSIxYneVPtyQwuG70eT4Am', 'Fatma Çelik', 'qc_engineer', '+90 532 000 0004'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'admin@ankaraydl.com', '$2a$12$nnwlCWbooHmlmQ/iv7YskOdDsH9xaIHkSIxYneVPtyQwuG70eT4Am', 'Ali Öztürk', 'admin', '+90 532 000 0005');

INSERT INTO construction_sites (id, tenant_id, yif_no, name, address, latitude, longitude, contractor_name, inspection_firm, ready_mix_supplier, concrete_class)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'YIF-2026-001', 'Çankaya Konut Projesi', 'Çankaya, Ankara', 39.9208, 32.8541, 'ABC İnşaat A.Ş.', 'XYZ Yapı Denetim', 'Ankara Hazır Beton', 'C30/37'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'YIF-2026-002', 'Keçiören AVM İnşaatı', 'Keçiören, Ankara', 39.9760, 32.8620, 'DEF Yapı Ltd.', 'XYZ Yapı Denetim', 'Başkent Beton', 'C25/30');

INSERT INTO equipment (id, tenant_id, name, serial_number, equipment_type, calibration_date, calibration_expiry_date)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Basınç Test Presi #1', 'BTP-2024-001', 'compression_press', '2026-01-15', '2027-01-15'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Kür Havuzu Termometresi', 'KHT-2024-001', 'curing_thermometer', '2026-03-01', '2027-03-01'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Elektronik Terazi', 'ET-2024-001', 'electronic_scale', '2026-02-10', '2027-02-10');

INSERT INTO curing_pools (id, tenant_id, name, capacity, temperature_c)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Kür Havuzu A', 50, 20.0),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Kür Havuzu B', 30, 20.0);

INSERT INTO curing_pool_zones (id, curing_pool_id, zone_label, shelf_level)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'A1', 1),
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'A2', 1),
  ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'A3', 2),
  ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', 'B1', 1),
  ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000002', 'B2', 1);

COMMIT;
