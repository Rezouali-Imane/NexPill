import type { PlatformRole } from "@prisma/client";
import type { RequestHandler } from "express";
import { prisma } from "../db/prisma";
import { ForbiddenError, UnauthorizedError } from "../errors";

declare module "express-serve-static-core" {
  interface Request {
    platformRole?: PlatformRole;
  }
}

export const requireRole = (
  ...allowedRoles: PlatformRole[]
): RequestHandler => {
  return async (request, _response, next) => {
    const userId = request.user?.id;

    if (!userId) {
      next(new UnauthorizedError("Authentication is required"));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { platformRole: true, disabledAt: true },
    });

    if (!user || user.disabledAt) {
      next(new ForbiddenError("Your account is not allowed to access this resource."));
      return;
    }

    if (!allowedRoles.includes(user.platformRole)) {
      next(new ForbiddenError("You do not have permission to access this resource."));
      return;
    }

    request.platformRole = user.platformRole;
    next();
  };
};
