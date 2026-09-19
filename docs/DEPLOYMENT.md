# คู่มือติดตั้งบน Linux Server (ละเอียด)

## 1. ข้อกำหนดเบื้องต้น

- Ubuntu Server 22.04 LTS ขึ้นไป (หรือ distro อื่นที่รองรับ Docker)
- RAM อย่างน้อย 4GB, Disk 40GB+ (เผื่อรูปภาพสะสม)
- Docker Engine 24+ และ Docker Compose plugin:

  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  ```

- โดเมนที่ชี้มาที่ IP public ของ server (สำหรับ HTTPS อัตโนมัติ) หรือใช้เฉพาะภายใน LAN ของโครงการ (ดูหัวข้อ 5)

## 2. ติดตั้งโปรเจกต์

```bash
sudo mkdir -p /opt/hongsa-belt-inspection
# คัดลอกไฟล์โปรเจกต์ทั้งหมดไปที่ /opt/hongsa-belt-inspection
cd /opt/hongsa-belt-inspection
cp .env.example .env
```

แก้ `.env` ให้ครบตาม [`ENV_VARS.md`](./ENV_VARS.md) แล้วแก้โดเมนใน `Caddyfile`

## 3. เปิดใช้งาน

```bash
docker compose up -d --build
docker compose exec backend npm run prisma:seed
```

## 4. ตรวจสอบ

```bash
docker compose ps
curl -k https://<โดเมน>/healthz
# ควรได้ {"ok":true,...}
```

## 5. ทางเลือก: Nginx + certbot แทน Caddy

ถ้าองค์กรมีนโยบายให้ใช้ Nginx อยู่แล้ว สามารถแทนที่ `reverse_proxy` service ด้วย Nginx ได้:

1. ลบ service `reverse_proxy` ใน `docker-compose.yml` และ expose พอร์ต 80 ของ service `frontend` ออกมาแทนชั่วคราว
2. ติดตั้ง Nginx + certbot บน host โดยตรง:

   ```bash
   sudo apt install nginx certbot python3-certbot-nginx
   ```

3. ตั้งค่า Nginx site config ให้ proxy ไปที่ frontend container (port ที่ expose ไว้) และ backend `/api/`:

   ```nginx
   server {
       listen 80;
       server_name belt-check.hongsa-mining.example.com;

       location /api/ {
           proxy_pass http://127.0.0.1:8081/api/;  # backend container port ที่ expose
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       location / {
           proxy_pass http://127.0.0.1:8080;  # frontend container port ที่ expose
       }
   }
   ```

4. ออกใบรับรอง HTTPS อัตโนมัติ:

   ```bash
   sudo certbot --nginx -d belt-check.hongsa-mining.example.com
   ```

5. ตั้ง cron/systemd timer สำหรับต่ออายุใบรับรองอัตโนมัติ (certbot ติดตั้ง timer นี้ให้อัตโนมัติอยู่แล้วโดย default)

## 6. ใช้งานเฉพาะภายใน LAN ของโครงการ (ไม่มีโดเมนสาธารณะ)

ถ้าเครือข่ายเหมืองเป็น LAN ปิดไม่ออกอินเทอร์เน็ต ให้ใช้ `tls internal` ใน `Caddyfile` (ดู comment ในไฟล์) ซึ่งจะออกใบรับรองจาก internal CA ของ Caddy เอง — ต้องติดตั้ง root certificate นี้ลงมือถือ Operator ทุกเครื่องเพื่อไม่ให้ browser แจ้งเตือนไม่ปลอดภัย มิฉะนั้น PWA installation บน iOS อาจถูกบล็อก

## 7. Backup

```bash
# Backup PostgreSQL
docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > backup_$(date +%F).sql.gz

# Backup MinIO data (object storage)
docker run --rm -v hongsa-belt-inspection_minio_data:/data -v $(pwd)/backups:/backup alpine \
  tar czf /backup/minio_$(date +%F).tar.gz -C /data .
```

แนะนำตั้ง cron job รัน backup รายวันและเก็บไฟล์ backup ไว้นอก server (offsite/cloud storage)

## 8. อัปเดตระบบ

```bash
cd /opt/hongsa-belt-inspection
# ดึงโค้ดเวอร์ชันใหม่มาวางทับ
docker compose up -d --build
# Prisma migration ใหม่จะรันอัตโนมัติตอน backend container start
```

## 9. Monitoring พื้นฐาน

```bash
docker compose logs -f backend      # ดู log backend real-time
docker compose logs -f | grep ERROR # ดูเฉพาะ error
docker stats                         # ดู resource usage
```

แนะนำต่อยอดด้วย Prometheus/Grafana หรือ Uptime Kuma สำหรับ monitoring ระยะยาว (ไม่รวมอยู่ใน scope ของ deliverable ชุดนี้)
