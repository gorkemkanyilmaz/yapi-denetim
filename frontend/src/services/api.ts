import axios from 'axios'

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
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)
