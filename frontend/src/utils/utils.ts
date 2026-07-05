import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string | null | undefined, locale = 'tr-TR'): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString(locale)
}

export function formatDateTime(iso: string | null | undefined, locale = 'tr-TR'): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(locale)
}

export function formatCurrency(value: number | string | undefined | null, currency = 'TRY'): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (Number.isNaN(n)) return '₺0,00'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(n)
}

export function elapsedHours(fromIso: string | Date | null): number {
  if (!fromIso) return 0
  return (Date.now() - new Date(fromIso).getTime()) / 36e5
}

export function slaColor(level: 'normal' | 'warning' | 'critical' | 'blocked'): string {
  switch (level) {
    case 'critical':
    case 'blocked':
      return 'bg-red-100 text-red-800 border-red-300'
    case 'warning':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    default:
      return 'bg-green-100 text-green-800 border-green-300'
  }
}

export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    created: 'Oluşturuldu',
    collected: 'Toplandı',
    in_transit: 'Transferde',
    received: 'Teslim Alındı',
    in_curing: 'Kürde',
    scheduled_for_test: 'Test Planlandı',
    tested: 'Test Edildi',
    approved: 'Onaylandı',
    archived: 'Arşivlendi',
  }
  return map[s] ?? s
}
