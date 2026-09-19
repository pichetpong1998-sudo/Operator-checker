import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA config: precache app shell, runtime-cache API GET requests (NetworkFirst)
// ข้อมูลที่ยืนยันแล้ว (server-confirmed) เท่านั้นที่ cache ไว้อ่าน — ไม่ใช้แทนแหล่งข้อมูลหลัก
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Hongsa Belt Inspection",
        short_name: "BeltCheck",
        description: "ระบบตรวจเช็คหัวสายพานรายชั่วโมง โครงการเหมืองหงสา",
        theme_color: "#0f766e",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/(belt-heads|checklist-items)/,
            handler: "NetworkFirst",
            options: { cacheName: "reference-data-cache", networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
