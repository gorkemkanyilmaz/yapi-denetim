import { api } from './api'
import { useAuthStore } from '@/store/auth'

export const authService = {
  async login(email: string, password: string, tenantSlug?: string) {
    const r = await api.post('/auth/login', { email, password, tenantSlug })
    const { token, user, tenant } = r.data.data
    useAuthStore.getState().setAuth(user, tenant, token)
    return r.data
  },
  async register(payload: { tenantName: string; tenantSlug: string; adminEmail: string; adminPassword: string; adminFullName: string }) {
    const r = await api.post('/auth/register', payload)
    return r.data
  },
  async me() {
    const r = await api.get('/auth/me')
    return r.data.data
  },
  async listUsers() {
    const r = await api.get('/auth/users')
    return r.data.data
  },
  async createUser(body: { email: string; fullName: string; role: string; phone?: string; password: string }) {
    const r = await api.post('/auth/users', body)
    return r.data.data
  },
  async updateUser(id: string, body: { fullName: string; role: string; phone?: string; isActive: boolean; password?: string }) {
    const r = await api.patch(`/auth/users/${id}`, body)
    return r.data.data
  },
  async deleteUser(id: string) {
    const r = await api.delete(`/auth/users/${id}`)
    return r.data
  },
  logout() {
    useAuthStore.getState().logout()
  },
}
