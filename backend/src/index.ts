import { createApp } from "./app";
import { env } from "./config/env";
import { ensureBucket } from "./lib/storage";

async function main() {
  await ensureBucket().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Warning: could not ensure MinIO bucket exists on startup:", err.message);
  });

  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Hongsa Belt Inspection API listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
