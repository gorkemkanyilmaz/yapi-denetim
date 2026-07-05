import { Router } from 'express'
import * as ctrl from '@/controllers/auth-controller.js'
import { authenticate, requireRole } from '@/middleware/auth.js'
import { UserRole } from '@shared/types/enums'

export const authRouter = Router()

authRouter.post('/login', ctrl.login)
authRouter.post('/register', ctrl.register)
authRouter.get('/me', authenticate, ctrl.me)
authRouter.get('/users', authenticate, requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.listUsers)
authRouter.post('/users', authenticate, requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.createUser)
authRouter.patch('/users/:id', authenticate, requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.updateUser)
authRouter.delete('/users/:id', authenticate, requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.deleteUser)
