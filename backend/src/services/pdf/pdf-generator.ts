import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { logger } from '@/utils/logger.js'

export interface ReportData {
  reportNumber: string
  reportType: 'fresh_concrete' | 'steel_tensile' | 'soil' | 'aggregate'
  generatedAt: string
  tenant: {
    name: string
    logoUrl: string | null
    taxNo: string | null
    address: string | null
  }
  constructionSite: {
    yifNo: string
    name: string
    address: string
    contractor: string
    inspectionFirm: string
    readyMixSupplier: string
    propertyOwner: string | null
  }
  sampleSet: {
    ebisProtocolNo: string | null
    ebisFisNo: string | null
    concreteClass: string | null
    castingDate: string | null
    castingLocation: string | null
    slumpCm: number | null
    concreteTempC: number | null
    airTempC: number | null
  }
  specimens: Array<{
    specimenNo: number
    ageDays: number
    testDate: string | null
    dimensions: string
    weightGr: number | null
    densityKgM3: number | null
    loadKn: number | null
    strengthMpa: number | null
  }>
  pacal7?: { mean: number; stdDev: number; characteristic: number; passes: boolean }
  pacal28?: { mean: number; stdDev: number; characteristic: number; passes: boolean }
  signatures: Array<{
    role: string
    fullName: string
    signedAt: string
    signatureSvg: string
  }>
  approvers: {
    qcEngineer: { name: string; title: string }
    labManager: { name: string; title: string }
  }
  verificationUrl: string
}

const ROLE_LABELS: Record<string, string> = {
  denetci_muhendis: 'Yapı Denetim Denetçi Mühendisi',
  santiye_sefi: 'Şantiye Şefi',
  beton_tesisi_yetkilisi: 'Hazır Beton Tesisi Yetkilisi',
}

const REPORT_TITLES: Record<ReportData['reportType'], string> = {
  fresh_concrete: 'Taze Beton Deney Raporu',
  steel_tensile: 'Demir Çekme Deney Raporu',
  soil: 'Zemin Deney Raporu',
  aggregate: 'Agrega Deney Raporu',
}

export async function generateReportPdf(data: ReportData): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(data.verificationUrl, { width: 120, margin: 0 })
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: data.reportNumber } })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    drawHeader(doc, data, qrBuffer)
    drawProjectTable(doc, data)
    drawTestingTable(doc, data)
    drawSignatures(doc, data)
    drawFooter(doc, data)

    doc.end()
  })
}

function drawHeader(doc: PDFKit.PDFDocument, data: ReportData, qr: Buffer) {
  doc.lineWidth(1).rect(36, 36, 523, 70).stroke()
  doc.fontSize(8).fillColor('#666').text('T.C.', 44, 42)
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000')
    .text('ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ BAKANLIĞI', 44, 54, { width: 360, align: 'center' })
  doc.fontSize(14).font('Helvetica-Bold').text(REPORT_TITLES[data.reportType], 44, 72, { width: 360, align: 'center' })
  doc.font('Helvetica').fontSize(8).fillColor('#333')
    .text(data.tenant.name, 44, 92, { width: 360, align: 'center' })

  doc.image(qr, 460, 42, { width: 90 })
  doc.fontSize(7).fillColor('#000')
    .text(`Rapor No: ${data.reportNumber}`, 460, 134, { width: 90, align: 'center' })
    .text(`Tarih: ${new Date(data.generatedAt).toLocaleDateString('tr-TR')}`, 460, 144, { width: 90, align: 'center' })
    .text(`Sayfa: 1 / 1`, 460, 154, { width: 90, align: 'center' })
  doc.moveDown(3)
}

function drawProjectTable(doc: PDFKit.PDFDocument, data: ReportData) {
  let y = 120
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Proje ve Belge Bilgileri', 36, y)
  y += 16
  const rows: Array<[string, string]> = [
    ['YİF No / Yapı Sahibi', `${data.constructionSite.yifNo}  •  ${data.constructionSite.propertyOwner ?? '-'}`],
    ['Müteahhit Firma', data.constructionSite.contractor],
    ['Yapı Denetim Firması', data.constructionSite.inspectionFirm],
    ['Şantiye Adresi', data.constructionSite.address],
    ['Beton Sınıfı / Hazır Beton Tesisi', `${data.sampleSet.concreteClass ?? '-'}  •  ${data.constructionSite.readyMixSupplier}`],
    ['Döküm Yeri', data.sampleSet.castingLocation ?? '-'],
  ]
  for (const [k, v] of rows) {
    doc.rect(36, y, 523, 18).stroke()
    doc.fontSize(8).font('Helvetica-Bold').text(k, 40, y + 5, { width: 170 })
    doc.font('Helvetica').text(v, 214, y + 5, { width: 340 })
    y += 18
  }
  y += 10
  drawSamplingHeader(doc, y, data)
}

function drawSamplingHeader(doc: PDFKit.PDFDocument, startY: number, data: ReportData) {
  let y = startY
  doc.fontSize(11).font('Helvetica-Bold').text('Numune Alım Bilgileri', 36, y)
  y += 16
  const rows: Array<[string, string]> = [
    ['EBİS Tutanak/Fiş No', `${data.sampleSet.ebisProtocolNo ?? '-'} / ${data.sampleSet.ebisFisNo ?? '-'}`],
    ['Numune Tarih/Saati', data.sampleSet.castingDate ? new Date(data.sampleSet.castingDate).toLocaleString('tr-TR') : '-'],
    ['Çökme (cm) / Beton Sıcaklığı (°C)', `${data.sampleSet.slumpCm ?? '-'} cm  •  ${data.sampleSet.concreteTempC ?? '-'} °C`],
    ['Hava Sıcaklığı (°C)', data.sampleSet.airTempC?.toString() ?? '-'],
  ]
  for (const [k, v] of rows) {
    doc.rect(36, y, 523, 18).stroke()
    doc.fontSize(8).font('Helvetica-Bold').text(k, 40, y + 5, { width: 220 })
    doc.font('Helvetica').text(v, 264, y + 5, { width: 290 })
    y += 18
  }
  y += 10
  drawStakeholders(doc, y, data)
}

function drawStakeholders(doc: PDFKit.PDFDocument, y: number, data: ReportData) {
  doc.fontSize(10).font('Helvetica-Bold').text('Saha İmza Sahipleri', 36, y)
  y += 14
  const sigs = data.signatures
  const colW = 170
  sigs.slice(0, 3).forEach((s, i) => {
    const x = 36 + i * (colW + 6)
    doc.rect(x, y, colW, 60).stroke()
    doc.fontSize(7).font('Helvetica-Bold').text(ROLE_LABELS[s.role] ?? s.role, x + 4, y + 4, { width: colW - 8 })
    doc.font('Helvetica').fontSize(8).text(s.fullName, x + 4, y + 16, { width: colW - 8 })
    try {
      const m = s.signatureSvg.match(/d="([^"]+)"/)
      if (m) {
        doc.fontSize(7).fillColor('#1e40af').text('[İmza]', x + 4, y + 30)
      } else {
        doc.text(s.signatureSvg.slice(0, 40), x + 4, y + 30, { width: colW - 8 })
      }
    } catch {
      doc.text('[İmza]', x + 4, y + 30)
    }
    doc.fillColor('#000').fontSize(6).text(new Date(s.signedAt).toLocaleString('tr-TR'), x + 4, y + 48, { width: colW - 8 })
  })
  doc.y = y + 70
  doc.x = 36
}

function drawTestingTable(doc: PDFKit.PDFDocument, data: ReportData) {
  let y = doc.y + 10
  doc.fontSize(11).font('Helvetica-Bold').text('Kırım Sonuçları', 36, y)
  y += 16
  const headers = ['No', 'Yaş', 'Test Tarihi', 'Ebat (mm)', 'Ağır. (gr)', 'Yoğ. (kg/m³)', 'Yük (kN)', 'Dayanım (MPa)']
  const colWidths = [24, 28, 64, 90, 50, 60, 50, 80]
  let x = 36
  doc.rect(36, y, 523, 18).fillAndStroke('#1e3a8a', '#000')
  doc.fillColor('#fff').fontSize(8)
  headers.forEach((h, i) => {
    doc.text(h, x + 3, y + 5, { width: colWidths[i] - 6, align: 'center' })
    x += colWidths[i]
  })
  doc.fillColor('#000')
  y += 18
  for (const s of data.specimens) {
    x = 36
    doc.rect(36, y, 523, 16).stroke()
    const cells = [
      `#${s.specimenNo}`,
      `${s.ageDays} gün`,
      s.testDate ? new Date(s.testDate).toLocaleDateString('tr-TR') : '-',
      s.dimensions,
      s.weightGr?.toString() ?? '-',
      s.densityKgM3?.toString() ?? '-',
      s.loadKn?.toString() ?? '-',
      s.strengthMpa?.toString() ?? '-',
    ]
    cells.forEach((c, i) => {
      doc.fontSize(8).font('Helvetica').text(c, x + 3, y + 4, { width: colWidths[i] - 6, align: 'center' })
      x += colWidths[i]
    })
    y += 16
  }
  y += 8
  drawPacal(doc, y, data)
}

function drawPacal(doc: PDFKit.PDFDocument, y: number, data: ReportData) {
  doc.fontSize(10).font('Helvetica-Bold').text('Paçal (Ortalama) Değerlendirmesi', 36, y)
  y += 14
  const pacals: Array<[string, ReportData['pacal7']]> = [
    ['7 Günlük Paçal', data.pacal7],
    ['28 Günlük Paçal', data.pacal28],
  ]
  for (const [label, p] of pacals) {
    if (!p) continue
    doc.rect(36, y, 523, 18).stroke()
    doc.fontSize(8).font('Helvetica-Bold').text(label, 40, y + 5, { width: 110 })
    doc.font('Helvetica').text(
      `Ort: ${p.mean.toFixed(2)} MPa  •  s: ${p.stdDev.toFixed(2)}  •  fck: ${p.characteristic.toFixed(2)}  •  ${p.passes ? 'TS EN 206 UYGUN' : 'UYGUN DEĞİL'}`,
      154, y + 5, { width: 400 },
    )
    y += 18
  }
  doc.y = y + 8
  doc.x = 36
}

function drawSignatures(doc: PDFKit.PDFDocument, data: ReportData) {
  let y = doc.y + 10
  doc.fontSize(11).font('Helvetica-Bold').text('Onay', 36, y)
  y += 16
  const sigs = [data.approvers.qcEngineer, data.approvers.labManager]
  const titles = ['Kalite Kontrol Mühendisi', 'Laboratuvar Müdürü']
  sigs.forEach((s, i) => {
    const x = 200 + i * 180
    doc.rect(x, y, 160, 70).stroke()
    doc.fontSize(8).font('Helvetica-Bold').text(titles[i], x + 4, y + 4, { width: 152 })
    doc.font('Helvetica').text(s.name, x + 4, y + 18, { width: 152 })
    doc.fontSize(7).text(s.title, x + 4, y + 32, { width: 152 })
    doc.fontSize(8).fillColor('#1e40af').text('[Elektronik İmza]', x + 4, y + 48)
    doc.fillColor('#000')
  })
  doc.y = y + 80
  doc.x = 36
}

function drawFooter(doc: PDFKit.PDFDocument, data: ReportData) {
  const y = doc.page.height - 60
  doc.fontSize(8).fillColor('#333').font('Helvetica-Oblique').text(
    'Bu rapor, Çevre, Şehircilik ve İklim Değişikliği Bakanlığı mevzuatına uygun olarak elektronik ortamda test edilerek onaylanmıştır.',
    36, y, { width: 523, align: 'center' },
  )
  doc.fontSize(7).fillColor('#666').text(
    `Doğrulama: ${data.verificationUrl}  •  ${data.tenant.name}  •  VKN: ${data.tenant.taxNo ?? '-'}`,
    36, y + 18, { width: 523, align: 'center' },
  )
}

export async function generateReportPdfFromSampleSet(_sampleSetId: string): Promise<Buffer> {
  logger.warn('generateReportPdfFromSampleSet not yet wired to DB; use generateReportPdf with hydrated data')
  return generateReportPdf({
    reportNumber: 'PREVIEW-0001',
    reportType: 'fresh_concrete',
    generatedAt: new Date().toISOString(),
    tenant: { name: 'Örnek Lab.', logoUrl: null, taxNo: '0000000000', address: '-' },
    constructionSite: {
      yifNo: '-', name: '-', address: '-', contractor: '-',
      inspectionFirm: '-', readyMixSupplier: '-', propertyOwner: '-',
    },
    sampleSet: {
      ebisProtocolNo: '-', ebisFisNo: '-', concreteClass: 'C30/37',
      castingDate: null, castingLocation: '-', slumpCm: null,
      concreteTempC: null, airTempC: null,
    },
    specimens: [],
    signatures: [],
    approvers: { qcEngineer: { name: '-', title: '-' }, labManager: { name: '-', title: '-' } },
    verificationUrl: 'https://example.com/verify',
  })
}
