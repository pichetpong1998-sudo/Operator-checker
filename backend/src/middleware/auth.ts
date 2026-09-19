import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/tokens";
import { prisma } from "../lib/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_bearer_token" });
  }
  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);

    // ตรวจ tokenVersion กับ DB ทุกครั้ง — รองรับ revoke ทันทีเมื่อ admin reset PIN / suspend user
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "active" || user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: "token_revoked" });
    }

    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_or_expired_token" });
  }
}
