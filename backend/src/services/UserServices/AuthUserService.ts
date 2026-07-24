import AppError from "../../errors/AppError";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import { SerializeUser } from "../../helpers/SerializeUser";
import CheckSettings from "../../helpers/CheckSettings";
import { getIO } from "../../libs/socket";
import Queue from "../../models/Queue";
import User from "../../models/User";
import UserSession from "../../models/UserSession";
import sequelize from "../../database";
import {
  createActivityLog,
  ActivityActions,
  EntityTypes
} from "../ActivityLogService";
import NotifyAccountLockedService from "../AuthServices/NotifyAccountLockedService";

const MAX_LOGIN_ATTEMPTS = 10;
const BASE_LOCKOUT_MINUTES = 15;
const MAX_LOCKOUT_MINUTES = 24 * 60;

const getLockoutDurationMinutes = (lockCount: number): number => {
  const minutes = BASE_LOCKOUT_MINUTES * 2 ** lockCount;
  return Math.min(minutes, MAX_LOCKOUT_MINUTES);
};

interface Request {
  email: string;
  password: string;
  ip?: string;
}

interface Response {
  serializedUser: {
    id: number;
    name: string;
    email: string;
    profile: string;
    online: boolean;
    isTricked: boolean;
    startWork: string;
    endWork: string;
    createdAt: Date;
    queues: Queue[];
    active: boolean;
  };
  token: string;
  refreshToken: string;
}

const AuthUserService = async ({
  email,
  password,
  ip = "unknown"
}: Request): Promise<Response> => {
  const user = await User.findOne({
    where: { email },
    include: ["queues"]
  });

  if (!user) {
    await createActivityLog({
      userId: null,
      action: ActivityActions.LOGIN_FAILED,
      description: `Tentativa de login para e-mail não cadastrado`,
      entityType: EntityTypes.USER,
      ip,
      additionalData: { email }
    });

    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const remainingMinutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000
    );

    throw new AppError(
      `Conta temporariamente bloqueada por excesso de tentativas de login. Tente novamente em ${remainingMinutes} minuto(s).`,
      423
    );
  }

  if (!user.active) {
    throw new AppError("ERR_USER_INACTIVE", 401);
  }

  const Hr = new Date();

  const hh: number = Hr.getHours() * 60 * 60;
  const mm: number = Hr.getMinutes() * 60;
  const hora = hh + mm;

  const inicio: string = user.startWork;
  const hhinicio = Number(inicio.split(":")[0]) * 60 * 60;
  const mminicio = Number(inicio.split(":")[1]) * 60;
  const horainicio = hhinicio + mminicio;

  const termino: string = user.endWork;
  const hhtermino = Number(termino.split(":")[0]) * 60 * 60;
  const mmtermino = Number(termino.split(":")[1]) * 60;
  const horatermino = hhtermino + mmtermino;

  if (hora < horainicio || hora > horatermino) {
    throw new AppError("ERR_OUT_OF_HOURS", 401);
  }

  if (!(await user.checkPassword(password))) {
    const loginAttempts = user.loginAttempts + 1;

    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockoutMinutes = getLockoutDurationMinutes(user.lockCount);
      const lockedUntil = new Date(Date.now() + lockoutMinutes * 60000);
      const lockCount = user.lockCount + 1;

      await user.update({
        loginAttempts: 0,
        lockedUntil,
        lockCount
      });

      await createActivityLog({
        userId: user.id,
        action: ActivityActions.ACCOUNT_LOCKED,
        description: `Conta bloqueada após ${MAX_LOGIN_ATTEMPTS} tentativas de login falhas`,
        entityType: EntityTypes.USER,
        entityId: user.id,
        ip,
        additionalData: { lockedUntil, lockCount }
      });

      await NotifyAccountLockedService({ user, lockedUntil });

      throw new AppError(
        `Conta bloqueada por ${lockoutMinutes} minuto(s) devido a múltiplas tentativas de login falhas. Você receberá um e-mail com mais informações.`,
        423
      );
    }

    await user.update({ loginAttempts });

    await createActivityLog({
      userId: user.id,
      action: ActivityActions.LOGIN_FAILED,
      description: `Tentativa de login falhou (tentativa ${loginAttempts}/${MAX_LOGIN_ATTEMPTS})`,
      entityType: EntityTypes.USER,
      entityId: user.id,
      ip,
      additionalData: { loginAttempts }
    });

    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  if (user.loginAttempts > 0 || user.lockedUntil) {
    await user.update({ loginAttempts: 0, lockedUntil: null });
  }

  let sessionTimeoutHours = 8;
  try {
    const timeoutValue = await CheckSettings("sessionTimeout");
    sessionTimeoutHours = parseInt(timeoutValue, 10) || 8;
  } catch {
    // Setting não encontrado, usa o padrão de 8 horas
  }

  await sequelize.transaction(async t => {
    const lastSession = await UserSession.findOne({
      where: {
        userId: user.id,
        logoutAt: null
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (lastSession) {
      const lastActivity = new Date(lastSession.lastActivity).getTime();
      const currentTime = new Date().getTime();
      const diffHours = (currentTime - lastActivity) / (1000 * 60 * 60);

      // Sessão expirada: encerrar a antiga e criar uma nova — não bloquear o login
      if (diffHours >= sessionTimeoutHours) {
        await lastSession.update({ logoutAt: new Date() }, { transaction: t });
        await user.update(
          { online: false, currentSessionId: null },
          { transaction: t }
        );

        try {
          const io = getIO();
          io.emit("userSessionExpired", {
            userId: user.id,
            expired: true,
            message: "ERR_SESSION_EXPIRED"
          });
        } catch {
          // Socket.IO ainda não inicializado — broadcast não-crítico ignorado
        }

        const newSessionId = crypto.randomUUID();
        await UserSession.create(
          {
            userId: user.id,
            sessionId: newSessionId,
            loginAt: new Date(),
            lastActivity: new Date()
          },
          { transaction: t }
        );
        await user.update(
          { online: true, currentSessionId: newSessionId },
          { transaction: t }
        );
      } else {
        await lastSession.update(
          { lastActivity: new Date() },
          { transaction: t }
        );
        await user.update({ online: true }, { transaction: t });
      }
    } else {
      const newSessionId = crypto.randomUUID();
      await UserSession.create(
        {
          userId: user.id,
          sessionId: newSessionId,
          loginAt: new Date(),
          lastActivity: new Date()
        },
        { transaction: t }
      );
      await user.update(
        { online: true, currentSessionId: newSessionId },
        { transaction: t }
      );
    }
  });

  try {
    const io = getIO();
    io.emit("userSessionUpdate", {
      userId: user.id,
      online: true
    });
  } catch {
    // Socket.IO ainda não inicializado — login prossegue normalmente
  }

  const token = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  const serializedUser = await SerializeUser(user);

  return {
    serializedUser,
    token,
    refreshToken
  };
};

export default AuthUserService;
