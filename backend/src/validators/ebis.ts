import { logger } from '@/utils/logger.js'

export const EBIS_PROTOCOL_RX = /^[A-Z]{2,4}-\d{4}-\d{3,8}$/
export const EBIS_FIS_RX = /^[A-Z]{2,5}-\d{4}-\d{3,8}$/
export const YIF_RX = /^YIF-\d{4}-\d{1,6}$/
export const CLASS_RX = /^C\d{2,3}\/\d{2,3}$/
export const MAX_EBIS_LEN = 50

export type EbisField = 'protocol_no' | 'fis_no' | 'yif_no' | 'beton_sinifi'

const MAP: Record<EbisField, { rx: RegExp; maxLen: number }> = {
  protocol_no: { rx: EBIS_PROTOCOL_RX, maxLen: MAX_EBIS_LEN },
  fis_no: { rx: EBIS_FIS_RX, maxLen: MAX_EBIS_LEN },
  yif_no: { rx: YIF_RX, maxLen: MAX_EBIS_LEN },
  beton_sinifi: { rx: CLASS_RX, maxLen: 20 },
}

export interface EbisValidationResult {
  ok: boolean
  value: string | null
  message?: string
}

export function validateEbisField(field: EbisField, raw: string | null | undefined): EbisValidationResult {
  if (!raw) return { ok: true, value: null }
  const { rx, maxLen } = MAP[field]
  const trimmed = String(raw).trim().slice(0, maxLen)
  if (!rx.test(trimmed)) {
    const msg = `Geçersiz EBİS formatı (${field}): "${trimmed}" — "${rx.source}" ile uyuşmuyor`
    logger.warn(msg, { field, value: trimmed })
    return { ok: false, value: trimmed, message: msg }
  }
  return { ok: true, value: trimmed }
}

export function assertEbisField(field: EbisField, raw: string | null | undefined): string | null {
  const r = validateEbisField(field, raw)
  if (!r.ok) {
    throw new EbisValidationError(field, r.message ?? `Geçersiz ${field}`)
  }
  return r.value
}

export class EbisValidationError extends Error {
  constructor(
    public readonly field: EbisField,
    message: string,
  ) {
    super(message)
    this.name = 'EbisValidationError'
  }
}