export interface SpecimenMeasurements {
  widthMm: number
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
  passed: boolean
}

export function calculateCompressiveStrength(m: SpecimenMeasurements, targetClass: string): CompressiveStrengthResult {
  const isCylindrical = m.diameterMm !== undefined && m.diameterMm > 0
  const areaMm2 = isCylindrical
    ? (Math.PI / 4) * m.diameterMm! * m.diameterMm!
    : m.widthMm * m.heightMm

  const loadN = m.failureLoadKn * 1000
  const strengthMpa = loadN / areaMm2

  const volumeCm3 = (areaMm2 * (m.heightMm)) / 1000
  const weightKg = m.weightGr / 1000
  const densityKgM3 = (weightKg / volumeCm3) * 1_000_000

  const target = parseClassTarget(targetClass)
  const passed = strengthMpa >= target * 0.85

  return {
    areaMm2: round(areaMm2, 2),
    loadN: round(loadN, 2),
    strengthMpa: round(strengthMpa, 3),
    densityKgM3: round(densityKgM3, 2),
    passed,
  }
}

function parseClassTarget(cls: string): number {
  const m = cls.match(/C(\d+)\/(\d+)/i)
  if (!m) return 25
  return Number(m[2])
}

function round(n: number, d: number): number {
  const f = 10 ** d
  return Math.round(n * f) / f
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
  criteria: {
    minSpecimens: number
    maxRange: number
    meanMin: number
  }
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
      ageDays,
      count: 0,
      meanMpa: 0,
      stdDeviationMpa: 0,
      minMpa: 0,
      maxMpa: 0,
      characteristicMpa: 0,
      passesTsEn206: false,
      outlierSpecimens: [],
      criteria: { minSpecimens: 3, maxRange: 0, meanMin: target },
    }
  }
  const mean = strengthsMpa.reduce((a, b) => a + b, 0) / count
  const variance =
    count > 1
      ? strengthsMpa.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (count - 1)
      : 0
  const stdDev = Math.sqrt(variance)
  const min = Math.min(...strengthsMpa)
  const max = Math.max(...strengthsMpa)
  const range = max - min
  const fck = mean - 1.48 * stdDev
  const passes = count >= 3 && fck >= target && range <= 0.15 * mean
  const outliers: number[] = []
  if (range > 0.15 * mean) {
    const limit = 0.15 * mean
    strengthsMpa.forEach((v, i) => {
      if (Math.abs(v - mean) > limit) outliers.push(specimenNos[i])
    })
  }
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
    criteria: { minSpecimens: 3, maxRange: round(0.15 * mean, 3), meanMin: target },
  }
}
