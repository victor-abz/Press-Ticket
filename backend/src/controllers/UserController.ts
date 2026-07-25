import { Request, Response } from "express";
import { Op } from "sequelize";
import { getIO } from "../libs/socket";

import AppError from "../errors/AppError";
import CheckSettingsHelper from "../helpers/CheckSettings";

import CreateUserService from "../services/UserServices/CreateUserService";
import DeleteUserService from "../services/UserServices/DeleteUserService";
import ListUsersService from "../services/UserServices/ListUsersService";
import ShowUserService from "../services/UserServices/ShowUserService";
import UpdateUserService from "../services/UserServices/UpdateUserService";
import User from "../models/User";
import {
  createActivityLog,
  ActivityActions,
  EntityTypes
} from "../services/ActivityLogService";
import GetClientIp from "../helpers/GetClientIp";
import { SendRefreshToken } from "../helpers/SendRefreshToken";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;

  const { users, count, hasMore } = await ListUsersService({
    searchParam,
    pageNumber
  });

  return res.json({ users, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { users } = await ListUsersService({});

  if (users.length >= Number(process.env.USER_LIMIT)) {
    throw new AppError("ERR_USER_CREATION_COUNT", 403);
  }

  const {
    email,
    password,
    name,
    profile,
    isTricked,
    queueIds,
    whatsappIds,
    startWork,
    endWork,
    active,
    whatsappNumber
  } = req.body;

  if (
    req.url === "/signup" &&
    (await CheckSettingsHelper("userCreation")) === "disabled"
  ) {
    throw new AppError("ERR_USER_CREATION_DISABLED", 403);
  } else if (req.url !== "/signup" && req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const user = await CreateUserService({
    email,
    password,
    name,
    profile: req.url === "/signup" ? "user" : profile,
    isTricked,
    queueIds,
    whatsappIds,
    startWork,
    endWork,
    active,
    whatsappNumber
  });

  const logUserId = req.user?.id || 1;
  const clientIp = GetClientIp(req);

  await createActivityLog({
    userId: typeof logUserId === "string" ? parseInt(logUserId) : logUserId,
    action: ActivityActions.CREATE,
    description: `Usuário ${user.name} (${user.email}) criado com perfil ${user.profile}`,
    entityType: EntityTypes.USER,
    entityId: user.id,
    ip: clientIp,
    additionalData: {
      email: user.email,
      profile: user.profile
    }
  });

  const io = getIO();
  io.emit("user", {
    action: "create",
    user
  });

  return res.status(200).json(user);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;

  const user = await ShowUserService(userId);

  return res.status(200).json(user);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;

  const newUserId = userId.toString();
  const sessionUserId = req.user.id.toString();

  if (req.user.profile !== "admin" && sessionUserId !== newUserId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const userData = req.body;
  const isSelf = sessionUserId === newUserId;
  const isPasswordChange =
    typeof userData.password === "string" && userData.password.length > 0;

  let isDeactivation = false;
  let isReactivation = false;
  if (userData.active === false) {
    const userBeforeUpdate = await User.findByPk(userId, {
      attributes: ["active"]
    });
    isDeactivation = userBeforeUpdate?.active !== false;
  } else if (userData.active === true) {
    const userBeforeUpdate = await User.findByPk(userId, {
      attributes: ["active"]
    });
    isReactivation = userBeforeUpdate?.active === false;
  }

  const result = await UpdateUserService({
    userData,
    userId,
    requestUserId: req.user.id
  });
  const logUserId = req.user?.id || 1;
  const clientIp = GetClientIp(req);

  if (result) {
    if (isPasswordChange && isSelf) {
      await createActivityLog({
        userId: typeof logUserId === "string" ? parseInt(logUserId) : logUserId,
        action: ActivityActions.PASSWORD_CHANGED,
        description: `Usuário ${result.name} (${result.email}) alterou a própria senha`,
        entityType: EntityTypes.USER,
        entityId: result.id,
        ip: clientIp
      });
    } else if (isPasswordChange) {
      await createActivityLog({
        userId: typeof logUserId === "string" ? parseInt(logUserId) : logUserId,
        action: ActivityActions.ADMIN_PASSWORD_RESET,
        description: `Admin redefiniu a senha do usuário ${result.name} (${result.email})`,
        entityType: EntityTypes.USER,
        entityId: result.id,
        ip: clientIp
      });
    } else if (isDeactivation) {
      await createActivityLog({
        userId: typeof logUserId === "string" ? parseInt(logUserId) : logUserId,
        action: ActivityActions.ACCOUNT_DEACTIVATED,
        description: `Admin desativou a conta do usuário ${result.name} (${result.email})`,
        entityType: EntityTypes.USER,
        entityId: result.id,
        ip: clientIp
      });
    } else if (isReactivation) {
      await createActivityLog({
        userId: typeof logUserId === "string" ? parseInt(logUserId) : logUserId,
        action: ActivityActions.USER_REACTIVATED,
        description: `Admin reativou a conta do usuário ${result.name} (${result.email})`,
        entityType: EntityTypes.USER,
        entityId: result.id,
        ip: clientIp
      });
    } else {
      await createActivityLog({
        userId: typeof logUserId === "string" ? parseInt(logUserId) : logUserId,
        action: ActivityActions.UPDATE,
        description: `Usuário ${result.name} (${result.email}) atualizado`,
        entityType: EntityTypes.USER,
        entityId: result.id,
        ip: clientIp,
        additionalData: {
          name: userData.name,
          profile: userData.profile,
          email: userData.email,
          active: userData.active,
          queueIds: userData.queueIds,
          whatsappIds: userData.whatsappIds
        }
      });
    }
  }

  if (!result) {
    return res.status(200).json(result);
  }

  const { refreshToken, ...responseBody } = result;
  const { token: _token, ...broadcastUser } = responseBody;

  if (refreshToken) {
    SendRefreshToken(res, refreshToken);
  }

  const io = getIO();
  io.emit("user", {
    action: "update",
    user: broadcastUser
  });

  return res.status(200).json(responseBody);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;

  if (req.user.profile !== "admin" && req.user.profile !== "masteradmin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const userToDelete = await ShowUserService(userId);

  await DeleteUserService(userId);
  const logUserId = req.user?.id || 1;
  const clientIp = GetClientIp(req);

  await createActivityLog({
    userId: typeof logUserId === "string" ? parseInt(logUserId) : logUserId,
    action: ActivityActions.DELETE,
    description: `Usuário ${userToDelete.name} (${userToDelete.email}) excluído`,
    entityType: EntityTypes.USER,
    entityId: parseInt(userId),
    ip: clientIp,
    additionalData: {
      email: userToDelete.email,
      profile: userToDelete.profile
    }
  });

  const io = getIO();
  io.emit("user", {
    action: "delete",
    userId
  });

  return res.status(200).json({ message: "User deleted" });
};

export const listLocked = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin" && req.user.profile !== "masteradmin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const users = await User.findAll({
    where: { lockedUntil: { [Op.gt]: new Date() } },
    attributes: [
      "id",
      "name",
      "email",
      "lockedUntil",
      "lockCount",
      "loginAttempts"
    ],
    order: [["lockedUntil", "DESC"]]
  });

  return res.status(200).json(users);
};

export const unlockUser = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin" && req.user.profile !== "masteradmin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { userId } = req.params;

  const user = await User.findByPk(userId);

  if (!user) {
    throw new AppError("ERR_NO_USER_FOUND", 404);
  }

  await user.update({ loginAttempts: 0, lockedUntil: null, lockCount: 0 });

  const clientIp = GetClientIp(req);
  const logUserId = req.user?.id || 1;

  await createActivityLog({
    userId: typeof logUserId === "string" ? parseInt(logUserId) : logUserId,
    action: ActivityActions.ACCOUNT_UNLOCKED,
    description: `Conta de ${user.name} (${user.email}) desbloqueada manualmente por administrador`,
    entityType: EntityTypes.USER,
    entityId: user.id,
    ip: clientIp
  });

  return res.status(200).json({ message: "Conta desbloqueada com sucesso." });
};
