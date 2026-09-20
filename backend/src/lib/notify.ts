import nodemailer from "nodemailer";
import { env } from "../config/env";
import { prisma } from "./prisma";
import type { NotificationChannel, NotificationType } from "@prisma/client";

const transporter =
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: (env.SMTP_PORT ?? 587) === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null;

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) {
    throw new Error("SMTP is not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS)");
  }
  await transporter.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, to, subject, text });
}

async function sendLinePush(text: string): Promise<void> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_ALERT_GROUP_ID) {
    throw new Error("LINE Messaging API is not configured");
  }
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: env.LINE_ALERT_GROUP_ID,
      messages: [{ type: "text", text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

export interface CriticalAlertInput {
  type: NotificationType;
  beltHeadCode: string;
  checklistLabel: string;
  operatorName: string;
  detail: string;
  inspectionId: string;
}

/**
 * สร้าง notification record + พยายามส่งทันที (best-effort, ไม่ throw ออกไปกระทบ request หลัก)
 * ถ้าส่งไม่สำเร็จจะบันทึก status=failed ไว้ให้ worker/cron retry ภายหลัง
 */
export async function fireCriticalAlert(input: CriticalAlertInput): Promise<void> {
  const subject = `[แจ้งเตือนด่วน] ${input.beltHeadCode} — ${input.checklistLabel}`;
  const message = `หัวสายพาน: ${input.beltHeadCode}\nรายการ: ${input.checklistLabel}\nรายละเอียด: ${input.detail}\nผู้ตรวจ: ${input.operatorName}\nInspection ID: ${input.inspectionId}`;

  const channels: NotificationChannel[] = [];
  if (env.ALERT_EMAIL_RECIPIENTS) channels.push("email");
  if (env.LINE_CHANNEL_ACCESS_TOKEN) channels.push("line");

  for (const channel of channels) {
    const recipients =
      channel === "email"
        ? (env.ALERT_EMAIL_RECIPIENTS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
        : [env.LINE_ALERT_GROUP_ID ?? ""];

    for (const recipient of recipients) {
      const record = await prisma.notification.create({
        data: {
          type: input.type,
          channel,
          recipient,
          payload: input as any,
          relatedInspectionId: input.inspectionId,
          status: "pending",
        },
      });

      try {
        if (channel === "email") {
          await sendEmail(recipient, subject, message);
        } else {
          await sendLinePush(message);
        }
        await prisma.notification.update({
          where: { id: record.id },
          data: { status: "sent", sentAt: new Date() },
        });
      } catch (err: any) {
        await prisma.notification.update({
          where: { id: record.id },
          data: { status: "failed", errorMessage: String(err?.message ?? err) },
        });
      }
    }
  }
}
