export interface SpecimenMeasurements {
  // TS EN 12390-3 uyarınca: silindir için çap, küp için kenar × kenar
  widthMm: number
  breadthMm?: number // küp/prizma için ikinci kenar (yoksa widthMm kullanılır)
  heightMm: number
  diameterMm?: number
  weightGr: number
  failureLoadKn: number
}

export interface CompressiveStrengthResult {
  areaMm2: number
  loadN: number
  strengthMpa: number
  densityKgM3: number
  volumeM3: number
}

function isCylinder(m: SpecimenMeasurements): boolean {
  return m.diameterMm !== undefined && m.diameterMm !== null && m.diameterMm > 0
}

function round(n: number, d: number): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

export function calculateCompressiveStrength(
  m: SpecimenMeasurements,
  _targetClass: string,
): CompressiveStrengthResult {
  // TS EN 12390-3: yük taşıyan kesit alanı
  //   Silindir: π/4·d²
  //   Küp/prizma: width × breadth (height yük doğrultusudur, alan değildir)
  const areaMm2 = isCylinder(m)
    ? (Math.PI / 4) * (m.diameterMm as number) * (m.diameterMm as number)
    : m.widthMm * (m.breadthMm ?? m.widthMm)

  const loadN = m.failureLoadKn * 1000
  const strengthMpa = loadN / areaMm2

  // Yoğunluk: weight(g) / volume(m³). mm³ → m³ = /1e9
  const volumeM3 = (areaMm2 * m.heightMm) / 1e9
  const weightKg = m.weightGr / 1000
  const densityKgM3 = volumeM3 > 0 ? weightKg / volumeM3 : 0

  return {
    areaMm2: round(areaMm2, 2),
    loadN: round(loadN, 2),
    strengthMpa: round(strengthMpa, 3),
    densityKgM3: round(densityKgM3, 2),
    volumeM3: round(volumeM3, 6),
  }
}

function parseClassTarget(cls: string): number {
  // C25/30 → 30 (fck, ikinci sayı)
  const m = cls.match(/C(\d+)\s*\/\s*(\d+)/i)
  if (!m) return 25
  return Number(m[2])
}

export interface PacalStatistics {
  ageDays: number
  count: number
  meanMpa: number
  stdDeviationMpa: number
  minMpa: number
  maxMpa: number
  characteristicMpa: number
  passesTsEn206: boolean
  outlierSpecimens: number[]
  excludedSpecimens: number[]
  criteria: {
    minSpecimens: number
    maxRange: number
    meanMin: number
    notes: string
  }
}

// TS EN 206 uyumlu paçal: range ≤ 0.15·mean (aksi halde outlier çıkar ve n≥2 kalmalı).
// n=2 için mean ≥ fck + 4 MPa kabul eşiği.
function evaluate(strengths: number[], specimenNos: number[], target: number) {
  const n = strengths.length
  if (n === 0) {
    return { mean: 0, stdDev: 0, fck: 0, range: 0, passes: false, outliers: [] as number[] }
  }
  const mean = strengths.reduce((a, b) => a + b, 0) / n
  const variance = n > 1 ? strengths.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1) : 0
  const stdDev = Math.sqrt(variance)
  const fck = mean - 1.48 * stdDev
  const min = Math.min(...strengths)
  const max = Math.max(...strengths)
  const range = max - min
  const meanPasses = mean >= target + 4
  const passes = n >= 2 && range <= 0.15 * mean && meanPasses
  const outliers: number[] = []
  if (range > 0.15 * mean) {
    const limit = 0.15 * mean
    strengths.forEach((v, i) => {
      if (Math.abs(v - mean) > limit) outliers.push(specimenNos[i])
    })
  }
  return { mean, stdDev, fck, range, passes, outliers }
}

export function calculatePacal(
  strengthsMpa: number[],
  specimenNos: number[],
  ageDays: number,
  targetClass: string,
): PacalStatistics {
  const count = strengthsMpa.length
  const target = parseClassTarget(targetClass)

  if (count === 0) {
    return {
      ageDays, count: 0,
      meanMpa: 0, stdDeviationMpa: 0, minMpa: 0, maxMpa: 0, characteristicMpa: 0,
      passesTsEn206: false,
      outlierSpecimens: [], excludedSpecimens: [],
      criteria: { minSpecimens: 2, maxRange: 0, meanMin: target, notes: 'Numune yok' },
    }
  }

  // 1. Aşama: tüm numuneleri içer
  const first = evaluate(strengthsMpa, specimenNos, target)
  let passes = first.passes
  let excludedSpecimens: number[] = []
  let mean = first.mean
  let stdDev = first.stdDev
  let fck = first.fck
  let outliers = first.outliers

  // 2. Aşama: range ihlal ediliyorsa ve en az 2 numune kalmalıysa outlier çıkar ve yeniden hesapla
  if (!passes && outliers.length > 0 && count - outliers.length >= 2) {
    const filtered = strengthsMpa.filter((_, i) => !outliers.includes(specimenNos[i]))
    const filteredNos = specimenNos.filter((n) => !outliers.includes(n))
    const second = evaluate(filtered, filteredNos, target)
    excludedSpecimens = outliers
    mean = second.mean; stdDev = second.stdDev; fck = second.fck
    passes = second.passes
    outliers = []
  }

  const min = Math.min(...strengthsMpa)
  const max = Math.max(...strengthsMpa)

  return {
    ageDays,
    count,
    meanMpa: round(mean, 3),
    stdDeviationMpa: round(stdDev, 3),
    minMpa: round(min, 3),
    maxMpa: round(max, 3),
    characteristicMpa: round(fck, 3),
    passesTsEn206: passes,
    outlierSpecimens: outliers,
    excludedSpecimens,
    criteria: {
      minSpecimens: 2,
      maxRange: round(0.15 * (mean || 1), 3),
      meanMin: target,
      notes: 'TS EN 206: fckCriterion = mean - 1.48·σ; n=2 kabul; outlier çıkarılır',
    },
  }
}
