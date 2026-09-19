# ข้อจำกัดด้าน GPS Spoofing และข้อเสนอแนะการใช้ MDM

## 1. ทำไมต้องพูดเรื่องนี้

ระบบนี้ใช้พิกัด GPS จากมือถือ Operator เป็นเงื่อนไขเปิด Checklist และตรวจ Geofence ซ้ำที่ server ทุกครั้งก่อนรับผลตรวจ (ตามที่ออกแบบไว้ใน `ARCHITECTURE.md`) แต่ **พิกัด GPS ที่รายงานผ่าน Browser Geolocation API เป็นข้อมูลที่ฝั่ง client (มือถือ) เป็นผู้รายงานเอง** — server ไม่มีทางตรวจสอบ "ความจริง" ของพิกัดนั้นได้ 100% ผ่านซอฟต์แวร์ฝั่งเดียว

## 2. ช่องทาง GPS Spoofing ที่พบได้บนมือถือทั่วไป

| ช่องทาง | รายละเอียด | แพลตฟอร์ม |
|---|---|---|
| Developer Options → "Mock location app" | Android มีฟีเจอร์ในตัวให้เลือกแอปที่มีสิทธิ์ปลอมตำแหน่ง GPS ได้ตรง ๆ | Android (ต้องเปิด Developer Options) |
| แอปปลอม GPS จาก Play Store/ไซต์นอก | เช่น Fake GPS Location, GPS Joystick ฯลฯ ทำงานร่วมกับ Mock location app | Android |
| Jailbreak + tweak (เช่น LocationFaker) | ปลอมพิกัดได้ในระดับ OS | iOS (ต้อง jailbreak) |
| แก้ไข system clock/time zone ร่วมกับ VPN | ไม่ใช่ spoof ตำแหน่งโดยตรง แต่กระทบความสอดคล้องของ timestamp | ทั้งสองแพลตฟอร์ม |
| Rooted device + Xposed/Magisk module | ปลอมพิกัดได้แนบเนียนกว่า mock location ทั่วไป จน browser ตรวจไม่ออกว่าเป็น mock | Android (root) |

## 3. สิ่งที่ระบบนี้ทำได้แล้วเพื่อลดความเสี่ยง

1. **ตรวจ GPS accuracy** — ปฏิเสธพิกัดที่ `accuracy` แย่กว่า `MAX_GPS_ACCURACY_M` (default 35m) เพราะพิกัดปลอมที่สร้างเองมักรายงานค่า accuracy ที่ผิดปกติ (สูงเกินจริงหรือแม่นยำสมบูรณ์แบบเกินจริง)
2. **ตรวจ geofence ซ้ำที่ server ทุกครั้ง** — ทั้งตอน preflight, ตอนบันทึกผลแต่ละครั้ง, และตอน sync จาก offline queue ไม่เชื่อ token/flag ใด ๆ จาก client ว่า "ผ่านแล้ว"
3. **Audit log ครบถ้วน** — บันทึกพิกัด, accuracy, ระยะทางที่คำนวณได้, user, device ทุกครั้งที่มีการตรวจ geofence ทำให้ตรวจสอบย้อนหลังได้ว่ามีรูปแบบผิดปกติหรือไม่ (เช่น พิกัดเดิมซ้ำ ๆ เป๊ะทุกครั้ง, กระโดดข้ามหัวสายพานเร็วผิดปกติ)
4. **Rate limiting + PIN + role-based access** — ลดโอกาสให้บุคคลภายนอกที่ไม่ใช่ Operator จริงเข้าระบบได้
5. **แยก preflight token อายุสั้น (10 นาที)** — จำกัดหน้าต่างเวลาที่ token เก่าจะถูกนำไปใช้ซ้ำ

## 4. สิ่งที่ระบบซอฟต์แวร์เพียงอย่างเดียว "ทำไม่ได้"

- **พิสูจน์ทางคณิตศาสตร์ว่าอุปกรณ์ไม่ได้ mock ตำแหน่ง** — Browser Geolocation API มาตรฐานไม่มีกลไกส่ง cryptographic attestation ของพิกัดมาด้วย
- **ตรวจจับ root/jailbreak แบบแนบเนียนได้แน่นอน 100%** — เทคนิค root/jailbreak detection ฝั่งเว็บมีข้อจำกัดมาก (ต่างจากแอป native ที่เรียก system API ตรวจ SafetyNet/Play Integrity หรือ DeviceCheck ได้)
- **ป้องกัน "GPS replay"** — การบันทึกพิกัดจริงจากหัวสายพานไว้ครั้งหนึ่ง แล้วนำมา mock ซ้ำในครั้งถัดไปโดยไม่ได้ไปที่หน้างานจริง

**สรุป**: มาตรการที่ทำในระบบนี้ (accuracy gate + geofence re-check ทุกครั้ง + audit log) **ลดความเสี่ยงและเพิ่มต้นทุนในการโกงอย่างมีนัยสำคัญ** แต่ไม่ใช่การป้องกันแบบสมบูรณ์ 100% หากพนักงานที่ตั้งใจโกงมีอุปกรณ์ที่ root/jailbreak และความรู้ทางเทคนิคเพียงพอ

## 5. ข้อเสนอแนะ: ใช้ MDM (Mobile Device Management) สำหรับมือถือองค์กร

เพื่อยกระดับความน่าเชื่อถือของพิกัด GPS ให้สูงขึ้นอย่างมีนัยสำคัญ แนะนำให้โครงการจัดหามือถือองค์กร (Corporate-owned) ให้ Operator ใช้งานเฉพาะงานตรวจเช็ค แล้วลงทะเบียนผ่านระบบ MDM ดังนี้:

### 5.1 นโยบายที่ควรบังคับผ่าน MDM

| นโยบาย | เหตุผล |
|---|---|
| ปิด Developer Options / USB Debugging | ปิดช่องทางเปิด "Mock location app" ได้โดยตรง |
| Allowlist แอปที่ติดตั้งได้ (App Allowlist) | ห้ามติดตั้งแอปปลอม GPS หรือแอปนอกเหนือจากที่องค์กรอนุมัติ |
| บังคับ OS/Security patch ให้เป็นเวอร์ชันล่าสุด | ลดช่องโหว่ที่ใช้ root โดยไม่ได้รับอนุญาต |
| ตรวจับ Root/Jailbreak detection ระดับ MDM agent | MDM agent (เช่น Microsoft Intune, Google Workspace Endpoint Management, SOTI MobiControl, Scalefusion) ตรวจ root/jailbreak ได้แม่นยำกว่า web browser มาก และสามารถ auto-block/wipe อุปกรณ์ที่ตรวจพบว่า root ได้ |
| Kiosk mode / Single-app mode | ล็อกให้มือถือเปิดได้เฉพาะแอป Belt Check ระหว่างเวลาปฏิบัติงาน ลดโอกาสสลับไปใช้แอปปลอม GPS |
| Location-based compliance policy | บาง MDM รองรับการตรวจสอบตำแหน่งอุปกรณ์ในระดับ OS (ผ่าน Device Location API ที่มีสิทธิ์สูงกว่า browser) และ flag อุปกรณ์ที่ผิดปกติ |
| Remote wipe/lock เมื่ออุปกรณ์สูญหาย | ป้องกันข้อมูล PIN/token รั่วไหลกรณีมือถือหาย |

### 5.2 แนวทางผสานกับระบบนี้ (แนวทางสำหรับพัฒนาต่อยอด)

1. **Native wrapper แทน PWA บริสุทธิ์** (เช่นใช้ Capacitor/Cordova ห่อ PWA เดิมเป็น native app) เพื่อเรียก native Location API ที่รองรับการตรวจสอบ mock-location flag ของ Android โดยตรง (`Location.isMock()` / `isFromMockProvider()`) — ซึ่ง Browser Geolocation API มาตรฐานไม่มีให้ใช้
2. **Google Play Integrity API / Apple DeviceCheck** — ถ้าทำเป็น native app สามารถขอ attestation จาก OS ว่าอุปกรณ์ไม่ได้ถูก root/modify ซึ่งเชื่อถือได้กว่าการตรวจจาก JavaScript ฝั่งเว็บมาก
3. **ผูก device ID กับ MDM inventory** — backend ตรวจสอบ `deviceId` ที่ส่งมา (มีอยู่แล้วใน schema `inspections.device_id`) กับรายการอุปกรณ์ที่ลงทะเบียนใน MDM ปฏิเสธอุปกรณ์ที่ไม่ได้ enroll
4. **แจ้งเตือนความผิดปกติอัตโนมัติ** — ต่อยอด audit log ที่มีอยู่แล้วด้วย job ตรวจจับ pattern ผิดปกติ เช่น พิกัดเป๊ะซ้ำ ๆ กันทุกครั้ง, ความเร็วเคลื่อนที่ระหว่างจุดตรวจสองจุดเร็วเกินความเป็นจริงทางกายภาพ

### 5.3 ทางเลือกกรณียังไม่มีงบ MDM เต็มรูปแบบ

- ใช้ **Android Enterprise (Work Profile)** ซึ่งฟรีและบังคับนโยบายพื้นฐานได้ (ปิด Developer Options, App allowlist) โดยไม่ต้องซื้อ MDM license เต็มรูปแบบ
- ตั้งกฎเวรตรวจแบบสุ่ม (spot check) ให้หัวหน้ากะเดินตรวจร่วมเป็นระยะ เพื่อ cross-check กับ audit log
- ใช้ audit log + dashboard เพื่อ flag รูปแบบที่น่าสงสัยให้ Engineer/Admin ตรวจสอบด้วยมนุษย์เป็นชั้นสุดท้าย (defense in depth)

## 6. สรุป

ระบบซอฟต์แวร์นี้ปิดช่องโหว่ที่พบบ่อยที่สุด (accuracy gate, geofence re-check ทุกครั้ง, audit trail) ได้ในระดับที่เหมาะสมสำหรับการใช้งานส่วนใหญ่ แต่การป้องกัน GPS spoofing แบบเข้มข้น 100% ต้องอาศัยการควบคุมที่ระดับอุปกรณ์ (MDM + native attestation API) ร่วมด้วย ซึ่งเป็นการลงทุนที่แนะนำสำหรับโครงการระยะยาวที่ผลตรวจมีผลต่อความปลอดภัยและการตัดสินใจซ่อมบำรุงที่สำคัญ
