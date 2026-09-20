# Multi-stage build — backend (Node.js + Express + Prisma)
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Prisma engine บน Alpine ต้องการ openssl จริง ไม่งั้น detect libssl ผิดแล้วพยายาม fetch engine ใหม่ตอน runtime
RUN apk add --no-cache openssl libssl3
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/assets ./assets

EXPOSE 4000
# ใช้ non-root user เพื่อความปลอดภัย — chown ให้ appuser เป็นเจ้าของทั้งหมด
# ป้องกัน "Can't write to node_modules/.../engine" ถ้า prisma ต้อง fetch/write ไฟล์เพิ่มตอน runtime (เช่น schema-engine สำหรับ migrate deploy)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app
USER appuser

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
