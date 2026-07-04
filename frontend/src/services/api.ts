import axios from 'axios'
import { toast } from 'sonner'

const baseURL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  const tenantId = localStorage.getItem('tenant_id')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (tenantId) config.headers['x-tenant-id'] = tenantId
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const code = err.response?.data?.code

    if (status === 403 && code === 'TENANT_EXPIRED') {
      toast.error('Firma kullanım süresi dolmuştur. Yönetici ile iletişime geçin.')
      localStorage.removeItem('auth_token')
      localStorage.removeItem('tenant_id')
      localStorage.removeItem('auth_user')
      localStorage.removeItem('auth_tenant')
      window.location.href = '/login'
      return Promise.reject(err)
    }
    if (status === 403 && code === 'TENANT_DISABLED') {
      toast.error('Firma hesabı devre dışı bırakılmıştır.')
      localStorage.removeItem('auth_token')
      localStorage.removeItem('tenant_id')
      localStorage.removeItem('auth_user')
      localStorage.removeItem('auth_tenant')
      window.location.href = '/login'
      return Promise.reject(err)
    }
    if (status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('tenant_id')
      localStorage.removeItem('auth_user')
      localStorage.removeItem('auth_tenant')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)
