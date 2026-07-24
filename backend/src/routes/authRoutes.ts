import { Router } from "express";
import * as SessionController from "../controllers/SessionController";
import * as UserController from "../controllers/UserController";
import {
  authLimiter,
  forgotPasswordLimiter,
  loginRateLimiter
} from "../config/rateLimiter";

const authRoutes = Router();

// Aplicar rate limiter apenas em rotas de autenticação sensíveis
authRoutes.post("/signup", authLimiter, UserController.store);
// loginRateLimiter (5/min) roda primeiro: rejeita rápido e barato antes de
// consumir o contador mais amplo do authLimiter (5-50/15min conforme env)
authRoutes.post(
  "/login",
  loginRateLimiter,
  authLimiter,
  SessionController.store
);
authRoutes.post(
  "/forgot-password",
  forgotPasswordLimiter,
  SessionController.forgotPassword
);
authRoutes.post(
  "/reset-password",
  authLimiter,
  SessionController.resetPassword
);

// Rotas sem rate limit (já autenticadas ou menos sensíveis)
authRoutes.post("/refresh_token", SessionController.update);
authRoutes.delete("/logout", SessionController.remove);

export default authRoutes;
