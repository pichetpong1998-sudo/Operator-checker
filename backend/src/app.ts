import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { beltHeadsRouter } from "./routes/beltHeads";
import { preflightRouter } from "./routes/preflight";
import { inspectionsRouter } from "./routes/inspections";
import { checklistItemsRouter } from "./routes/checklistItems";
import { uploadsRouter } from "./routes/uploads";
import { dashboardRouter } from "./routes/dashboard";
import { exportsRouter } from "./routes/exports";
import { auditRouter } from "./routes/audit";
import { bootstrapRouter } from "./routes/bootstrap";
import { importOperatorsRouter } from "./routes/importOperators";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { generalApiRateLimiter } from "./middleware/rateLimit";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // จำเป็นเมื่ออยู่หลัง reverse proxy (Nginx) เพื่อให้ req.ip ถูกต้องสำหรับ rate-limit/audit

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use("/api/v1", generalApiRateLimiter);

  app.get("/healthz", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/belt-heads", beltHeadsRouter);
  app.use("/api/v1/preflight", preflightRouter);
  app.use("/api/v1/inspections", inspectionsRouter);
  app.use("/api/v1/checklist-items", checklistItemsRouter);
  app.use("/api/v1/uploads", uploadsRouter);
  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/v1/exports", exportsRouter);
  app.use("/api/v1/audit-logs", auditRouter);
  app.use("/api/v1/bootstrap", bootstrapRouter);
  app.use("/api/v1/admin-import/operators", importOperatorsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
