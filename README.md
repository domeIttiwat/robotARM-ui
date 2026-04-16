    ติดตั้ง Node.js 20+


curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3

    Clone โปรเจกต์


git clone https://github.com/domeIttiwat/robotARM-ui.git
cd robotARM-ui

    ตั้งค่า ROS URL


cp .env.local.example .env.local
nano .env.local
แก้ให้ตรงกับ setup ของคุณ:


ถ้า ROS รันบน Pi5 เครื่องเดียวกัน
NEXT_PUBLIC_ROS_URL=ws://localhost:9090

ถ้า ROS รันเครื่องอื่น
NEXT_PUBLIC_ROS_URL=ws://192.168.1.xxx:9090

    ติดตั้ง dependencies + ตั้งค่า DB


npm install
npx prisma generate
npx prisma db push
npm run seed    # optional: ใส่ข้อมูลตัวอย่าง

    รัน (เลือกอย่างใดอย่างหนึ่ง)


Development
npm run dev

Production (เร็วกว่า แนะนำ)
npm run build && npm start
เปิดเบราว์เซอร์ที่ http://localhost:3000/ หรือ http://<ip-ของ-pi5>:3000 จากเครื่องอื่น

    เปิดอัตโนมัติตอน boot (ถ้าต้องการ)

