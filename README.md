# Yapı Denetim Laboratuvarı

Türk yapı denetim sektörü için tasarlanmış uçtan uca bir numune yönetim ve laboratuvar otomasyon sistemi.

## Modüller

- **Saha Toplama** — GPS, geofence, OCR, mobil-önce (offline) veri toplama
- **Numune İş Akışı (Kanban)** — 9 durumlu süreç yönetimi, sürükle-bırak atama
- **Kür Havuzları** — Raf/bölge yönetimi ile birlikte kür havuzu CRUD
- **Cihaz Yönetimi** — Kalibrasyon takibi, otomatik bloklama
- **Hakediş** — Dönemsel faturalandırma, KDV hesabı
- **Raporlar** — PDF üretimi, QR doğrulama
- **Çalışanlar** — Rol bazlı yetkilendirme, performans takibi
- **SLA İzleme** — Mold/kür/test ihlali alarmları

## Teknoloji

**Backend:** Node.js · Express 5 · TypeScript · PostgreSQL · Drizzle ORM · JWT · BullMQ

**Frontend:** React 19 · Vite · TanStack Query · Zustand · Tailwind CSS 4 · Leaflet · Tesseract.js

## Kurulum

```bash
# 1. Bağımlılıklar
cd backend  && npm install
cd ../frontend && npm install

# 2. Çevre değişkenleri
cp .env.example .env
# DB_HOST, DB_PASSWORD, JWT_SECRET alanlarını doldurun

# 3. Veritabanı şeması
psql -U postgres -d yapi_denetim -f database/schema.sql
psql -U postgres -d yapi_denetim -f database/migrations/001_qa_audit_fixes.sql
psql -U postgres -d yapi_denetim -f database/migrations/002_santiye_sorumlusu_cep.sql

# 4. Çalıştırma (2 terminal)
cd backend  && npm run dev
cd frontend && npm run dev
```

## Roller

`owner` · `manager` · `admin` · `lab_technician` · `qc_engineer` · `field_tech` · `courier`

## Yapı

```
yapi-denetim/
├── backend/        # Express API + iş kuralları
├── frontend/       # React SPA
├── database/       # SQL şema + migration
└── shared/         # Backend/frontend arası tipler
```
