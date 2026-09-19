import type { Request } from "express";
import { prisma } from "./prisma";
import type { AuditAction } from "@prisma/client";

export interface AuditLogInput {
  actorUserId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata as any,
      ipAddress: input.req?.ip,
      userAgent: input.req?.headers["user-agent"],
    },
  });
}
