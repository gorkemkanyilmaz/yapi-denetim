import { create } from 'zustand'
import type { User, Tenant } from '@shared/types'

interface AuthState {
  user: User | null
  tenant: Tenant | null
  token: string | null
  hydrated: boolean
  setAuth: (user: User, tenant: Tenant, token: string) => void
  hydrate: () => void
  logout: () => void
}

const STORAGE_KEYS = {
  token: 'auth_token',
  tenantId: 'tenant_id',
  user: 'auth_user',
  tenant: 'auth_tenant',
} as const

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  token: null,
  hydrated: false,

  setAuth: (user, tenant, token) => {
    localStorage.setItem(STORAGE_KEYS.token, token)
    localStorage.setItem(STORAGE_KEYS.tenantId, tenant.id)
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
    localStorage.setItem(STORAGE_KEYS.tenant, JSON.stringify(tenant))
    set({ user, tenant, token, hydrated: true })
  },

  hydrate: () => {
    const token = localStorage.getItem(STORAGE_KEYS.token)
    const user = safeParse<User>(localStorage.getItem(STORAGE_KEYS.user))
    const tenant = safeParse<Tenant>(localStorage.getItem(STORAGE_KEYS.tenant))

    if (token && user && tenant) {
      set({ user, tenant, token, hydrated: true })
      return
    }
    set({ hydrated: true })
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEYS.token)
    localStorage.removeItem(STORAGE_KEYS.tenantId)
    localStorage.removeItem(STORAGE_KEYS.user)
    localStorage.removeItem(STORAGE_KEYS.tenant)
    set({ user: null, tenant: null, token: null, hydrated: true })
  },
}))
