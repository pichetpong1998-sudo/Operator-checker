import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "not_authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "insufficient_role", required: roles });
    }
    next();
  };
}
