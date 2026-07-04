import { useQuery } from '@tanstack/react-query'
import { samplesApi } from '@/services/samples-api'
import { formatDate, formatDateTime, statusLabel } from '@/utils/utils'
import { QRCodeSVG } from 'qrcode.react'

export function ReportPreview({ sampleSetId }: { sampleSetId: string }) {
  const { data } = useQuery({ queryKey: ['sample-set', sampleSetId], queryFn: () => samplesApi.get(sampleSetId), enabled: !!sampleSetId })
  const set = data?.data
  if (!set) return <div>Yükleniyor...</div>

  const specimens = (set.specimens ?? []) as Array<{ specimen_no: number; target_age_days: number; actual_test_date: string | null; width_mm: number | null; height_mm: number | null; diameter_mm: number | null; weight_gr: number | null; density_kg_m3: number | null; failure_load_kn: number | null; compressive_strength_mpa: number | null }>
  const sigs = (set.signatures ?? []) as Array<{ role: string; full_name: string; signed_at: string }>
  const reportNo = `${set.yif_no}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
  const verifyUrl = `${window.location.origin}/verify/${reportNo}`

  return (
    <div className="bg-white shadow-2xl rounded-lg p-8 max-w-4xl mx-auto" id="report-preview">
      <header className="border-2 border-slate-800 p-4 flex items-start justify-between">
        <div className="text-center flex-1">
          <div className="text-xs text-slate-600">T.C.</div>
          <div className="text-base font-bold mt-1">ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞI</div>
          <div className="text-lg font-bold mt-2">Taze Beton Deney Raporu</div>
          <div className="text-xs text-slate-500 mt-2">Yapı Denetim Laboratuvarı</div>
        </div>
        <div className="text-right space-y-1">
          <QRCodeSVG value={verifyUrl} size={88} />
          <div className="text-[10px] text-slate-600">Rapor No: {reportNo}</div>
          <div className="text-[10px] text-slate-600">Tarih: {formatDate(new Date().toISOString())}</div>
          <div className="text-[10px] text-slate-600">Sayfa: 1 / 1</div>
        </div>
      </header>

      <Section title="Proje ve Belge Bilgileri">
        <Table rows={[
          ['YİF No / Yapı Sahibi', `${set.yif_no}`],
          ['Müteahhit Firma', set.contractor_name ?? '-'],
          ['Yapı Denetim Firması', set.inspection_firm ?? '-'],
          ['Şantiye Adresi', set.site_address ?? '-'],
          ['Beton Sınıfı', set.concrete_class ?? set.site_concrete_class ?? '-'],
          ['Hazır Beton Tesisi', set.ready_mix_supplier ?? '-'],
          ['Döküm Yeri', 'Betonarme Döşeme / Tabliye'],
        ]} />
      </Section>

      <Section title="Numune Alım Bilgileri">
        <Table rows={[
          ['EBİS Tutanak / Fiş No', `${set.ebis_protocol_no ?? '-'} / ${set.ebis_fis_no ?? '-'}`],
          ['Numune Tarihi / Saati', set.collected_at ? formatDateTime(set.collected_at) : '-'],
          ['Çökme (cm) / Beton Sıcaklığı (°C)', '- / -'],
          ['Hava Sıcaklığı (°C)', '-'],
        ]} />
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          {(['denetci_muhendis', 'santiye_sefi', 'beton_tesisi_yetkilisi'] as const).map((role) => {
            const sig = sigs.find((s) => s.role === role)
            return (
              <div key={role} className="border border-slate-300 rounded p-2 text-center">
                <div className="font-semibold">{roleLabel(role)}</div>
                <div className="text-slate-700 mt-2 min-h-[24px]">{sig ? sig.full_name : <span className="text-slate-400">— İmza Bekleniyor —</span>}</div>
                <div className="text-slate-400 text-[10px] mt-1">{sig ? formatDateTime(sig.signed_at) : ''}</div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Kırım Sonuçları">
        <table className="w-full text-xs border border-slate-300">
          <thead className="bg-blue-900 text-white">
            <tr>
              <th className="p-1">No</th>
              <th className="p-1">Yaş</th>
              <th className="p-1">Deney Tarihi</th>
              <th className="p-1">Ebatlar (mm)</th>
              <th className="p-1">Ağırlık (gr)</th>
              <th className="p-1">Yoğunluk (kg/m³)</th>
              <th className="p-1">Kırım Yükü (kN)</th>
              <th className="p-1">f_c (MPa)</th>
            </tr>
          </thead>
          <tbody>
            {specimens.length === 0 ? (
              <tr><td colSpan={8} className="p-2 text-center text-slate-400">Numune kaydı yok</td></tr>
            ) : specimens.map((sp) => (
              <tr key={sp.specimen_no} className="border-t border-slate-200 text-center">
                <td className="p-1">#{sp.specimen_no}</td>
                <td className="p-1">{sp.target_age_days}g</td>
                <td className="p-1">{sp.actual_test_date ? formatDate(sp.actual_test_date) : '-'}</td>
                <td className="p-1">{sp.diameter_mm ? `Ø${sp.diameter_mm}x${sp.height_mm}` : `${sp.width_mm}x${sp.height_mm}`}</td>
                <td className="p-1">{sp.weight_gr ?? '-'}</td>
                <td className="p-1">{sp.density_kg_m3 ?? '-'}</td>
                <td className="p-1">{sp.failure_load_kn ?? '-'}</td>
                <td className="p-1 font-bold">{sp.compressive_strength_mpa ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {([7, 28] as const).map((age) => {
            const subset = specimens.filter((s) => s.target_age_days === age && s.compressive_strength_mpa !== null)
            if (subset.length === 0) return null
            const mean = subset.reduce((a, b) => a + Number(b.compressive_strength_mpa), 0) / subset.length
            const sd = Math.sqrt(subset.reduce((a, b) => a + (Number(b.compressive_strength_mpa) - mean) ** 2, 0) / subset.length)
            const fck = mean - 1.48 * sd
            return (
              <div key={age} className="border border-slate-300 rounded p-2">
                <div className="font-bold">{age} Günlük Paçal</div>
                <div>Ortalama: {mean.toFixed(2)} MPa • s: {sd.toFixed(2)} • f_ck: {fck.toFixed(2)}</div>
                <div className={fck >= 30 ? 'text-green-700' : 'text-red-700'}>{fck >= 30 ? 'TS EN 206 UYGUN' : 'UYGUN DEĞİL'}</div>
              </div>
            )
          })}
        </div>
      </Section>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <SignatureBlock title="Kalite Kontrol Mühendisi" name="Kalite Mühendisi" />
        <SignatureBlock title="Laboratuvar Müdürü" name="Laboratuvar Müdürü" />
      </div>

      <div className="mt-6 text-[10px] text-slate-600 italic text-center border-t pt-3">
        Bu rapor, Çevre, Şehircilik ve İklim Değişikliği Bakanlığı mevzuatına uygun olarak elektronik ortamda test edilerek onaylanmıştır.
      </div>
      <div className="text-[9px] text-center text-slate-400 mt-1">Doğrulama: {verifyUrl} • Durum: {statusLabel(set.status)}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h2 className="font-bold text-sm bg-slate-100 px-3 py-1.5 border-l-4 border-blue-700">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Table({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="w-full text-xs border border-slate-300">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} className="border-b border-slate-200 last:border-0">
            <th className="text-left p-1.5 bg-slate-50 w-1/3 font-medium align-top">{k}</th>
            <td className="p-1.5">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SignatureBlock({ title, name }: { title: string; name: string }) {
  return (
    <div className="border border-slate-300 rounded p-3 h-24 flex flex-col justify-between">
      <div className="text-xs font-semibold">{title}</div>
      <div className="text-xs text-slate-500">İmza: ____________________</div>
      <div className="text-xs">{name}</div>
    </div>
  )
}

function roleLabel(r: string): string {
  return { denetci_muhendis: 'Yapı Denetim Denetçi Mühendisi', santiye_sefi: 'Şantiye Şefi', beton_tesisi_yetkilisi: 'Hazır Beton Tesisi Yetkilisi' }[r] ?? r
}
