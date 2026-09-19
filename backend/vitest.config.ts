import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/tests/**/*.test.ts"],
    setupFiles: ["src/tests/vitest.setup.ts"],
    testTimeout: 20000,
    hookTimeout: 60000,
    // รันไฟล์ test ทีละไฟล์ (ไม่ fork หลาย process พร้อมกัน) — ลดปัญหา CPU contention
    // กับ argon2 native binding บนเครื่อง CI ที่มี core จำกัด
    fileParallelism: false,
  },
});
