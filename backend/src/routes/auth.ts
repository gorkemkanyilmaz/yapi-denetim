import { Router } from 'express'
import * as ctrl from '@/controllers/auth-controller.js'
import { authenticate } from '@/middleware/auth.js'

export const authRouter = Router()

authRouter.post('/login', ctrl.login)
authRouter.post('/register', ctrl.register)
authRouter.get('/me', authenticate, ctrl.me)
authRouter.get('/users', authenticate, ctrl.listUsers)
authRouter.post('/users', authenticate, ctrl.createUser)
authRouter.patch('/users/:id', authenticate, ctrl.updateUser)
authRouter.delete('/users/:id', authenticate, ctrl.deleteUser)
