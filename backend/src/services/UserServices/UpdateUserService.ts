import * as Yup from "yup";

import AppError from "../../errors/AppError";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import { SerializeUser } from "../../helpers/SerializeUser";
import { assertPasswordValid } from "../../helpers/validatePassword";
import User from "../../models/User";
import ShowUserService from "./ShowUserService";

interface UserData {
  email?: string;
  password?: string;
  currentPassword?: string;
  name?: string;
  online?: boolean;
  profile?: string;
  isTricked?: boolean;
  queueIds?: number[];
  whatsappIds?: number[];
  startWork?: string;
  endWork?: string;
  active?: boolean;
  whatsappNumber?: string;
}

interface Request {
  userData: UserData;
  userId: string | number;
  requestUserId?: string | number;
}

type Response = Awaited<ReturnType<typeof SerializeUser>> & {
  token?: string;
  refreshToken?: string;
};

const UpdateUserService = async ({
  userData,
  userId,
  requestUserId
}: Request): Promise<Response | undefined> => {
  const user = await ShowUserService(userId);

  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    email: Yup.string().email(),
    profile: Yup.string(),
    password: Yup.string(),
    online: Yup.boolean()
  });

  const {
    email,
    password,
    currentPassword,
    profile,
    isTricked,
    name,
    queueIds = [],
    whatsappIds = [],
    startWork,
    endWork,
    online,
    active,
    whatsappNumber
  } = userData;

  try {
    await schema.validate({ email, password, profile, name, online });
  } catch (err) {
    throw new AppError(err.message);
  }

  const isSelf =
    requestUserId !== undefined &&
    requestUserId.toString() === userId.toString();
  const isPasswordChange = Boolean(password);
  const isDeactivation = active === false && user.active !== false;

  if (isPasswordChange && isSelf) {
    const userWithPasswordHash = await User.findByPk(userId, {
      attributes: ["id", "passwordHash"]
    });

    const currentPasswordMatches =
      !!currentPassword &&
      !!userWithPasswordHash &&
      (await userWithPasswordHash.checkPassword(currentPassword));

    if (!currentPasswordMatches) {
      throw new AppError("ERR_INVALID_PASSWORD", 401);
    }
  }

  if (isPasswordChange) {
    assertPasswordValid(password as string);
  }

  const shouldInvalidateSessions = isPasswordChange || isDeactivation;

  await user.update({
    email,
    password,
    profile,
    isTricked,
    name,
    startWork,
    endWork,
    online,
    active,
    whatsappNumber,
    ...(shouldInvalidateSessions ? { tokenVersion: user.tokenVersion + 1 } : {})
  });

  await user.$set("queues", queueIds);
  await user.$set("whatsapps", whatsappIds);

  await user.reload();

  const serializedUser = await SerializeUser(user);

  if (isPasswordChange && isSelf) {
    return {
      ...serializedUser,
      token: createAccessToken(user),
      refreshToken: createRefreshToken(user)
    };
  }

  return serializedUser;
};

export default UpdateUserService;
