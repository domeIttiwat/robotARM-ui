import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Realistic robot arm sequences for a café environment
// Joints in degrees: joint_1=base rotation, joint_2=shoulder, joint_3=elbow, joint_4=wrist1, joint_5=wrist2, joint_6=wrist3
// slider_joint in mm (0-500mm linear rail)
// Speed: 10-100%, Delay: ms to wait after reaching position

const jobSequences = [
  {
    name: "Coffee Preparation",
    description: "ลำดับการชงกาแฟ: หยิบแก้ว → เครื่องชงกาแฟ → วางบนถาด",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Move to Cup Dispenser", joint_1: 42, joint_2: -55, joint_3: 25, joint_4: -35, joint_5: 5, joint_6: 15, slider_joint: 60, speed: 70, delay: 100, gripper: 0 },
      { label: "Lower to Cup", joint_1: 42, joint_2: -82, joint_3: 48, joint_4: -28, joint_5: 5, joint_6: 15, slider_joint: 60, speed: 30, delay: 200, gripper: 0 },
      { label: "Grip Cup", joint_1: 42, joint_2: -82, joint_3: 48, joint_4: -28, joint_5: 5, joint_6: 15, slider_joint: 60, speed: 20, delay: 500, gripper: 80 },
      { label: "Lift Cup Up", joint_1: 42, joint_2: -55, joint_3: 25, joint_4: -35, joint_5: 5, joint_6: 15, slider_joint: 60, speed: 40, delay: 300, gripper: 80 },
      { label: "Move to Coffee Machine", joint_1: 88, joint_2: -62, joint_3: 30, joint_4: -58, joint_5: 0, joint_6: 30, slider_joint: 220, speed: 65, delay: 100, gripper: 80 },
      { label: "Position Cup at Spout", joint_1: 88, joint_2: -88, joint_3: 52, joint_4: -42, joint_5: 0, joint_6: 30, slider_joint: 220, speed: 20, delay: 300, gripper: 80 },
      { label: "Wait for Coffee", joint_1: 88, joint_2: -88, joint_3: 52, joint_4: -42, joint_5: 0, joint_6: 30, slider_joint: 220, speed: 10, delay: 4000, gripper: 80 },
      { label: "Lift Full Cup", joint_1: 88, joint_2: -62, joint_3: 30, joint_4: -58, joint_5: 0, joint_6: 30, slider_joint: 220, speed: 25, delay: 300, gripper: 80 },
      { label: "Move to Serving Tray", joint_1: 128, joint_2: -68, joint_3: 35, joint_4: -48, joint_5: -5, joint_6: 45, slider_joint: 350, speed: 55, delay: 100, gripper: 80 },
      { label: "Lower Cup to Tray", joint_1: 128, joint_2: -90, joint_3: 55, joint_4: -40, joint_5: -5, joint_6: 45, slider_joint: 350, speed: 20, delay: 300, gripper: 80 },
      { label: "Release Cup", joint_1: 128, joint_2: -90, joint_3: 55, joint_4: -40, joint_5: -5, joint_6: 45, slider_joint: 350, speed: 10, delay: 400, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Pastry Placement",
    description: "วางขนมบนจาน: หยิบจากถาดเก็บ → จัดเรียงบนจานเสิร์ฟ",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Move Over Pastry Tray", joint_1: -35, joint_2: -50, joint_3: 20, joint_4: -40, joint_5: 8, joint_6: -20, slider_joint: 80, speed: 65, delay: 100, gripper: 0 },
      { label: "Descend to Pastry", joint_1: -35, joint_2: -78, joint_3: 45, joint_4: -35, joint_5: 8, joint_6: -20, slider_joint: 80, speed: 25, delay: 200, gripper: 0 },
      { label: "Grip Pastry", joint_1: -35, joint_2: -78, joint_3: 45, joint_4: -35, joint_5: 8, joint_6: -20, slider_joint: 80, speed: 15, delay: 600, gripper: 80 },
      { label: "Lift Pastry", joint_1: -35, joint_2: -50, joint_3: 20, joint_4: -40, joint_5: 8, joint_6: -20, slider_joint: 80, speed: 30, delay: 300, gripper: 80 },
      { label: "Rotate to Serving Plate", joint_1: 55, joint_2: -52, joint_3: 22, joint_4: -42, joint_5: -5, joint_6: 0, slider_joint: 180, speed: 60, delay: 100, gripper: 80 },
      { label: "Align Over Plate", joint_1: 55, joint_2: -65, joint_3: 35, joint_4: -38, joint_5: -5, joint_6: 0, slider_joint: 180, speed: 25, delay: 200, gripper: 80 },
      { label: "Lower Gently to Plate", joint_1: 55, joint_2: -85, joint_3: 50, joint_4: -32, joint_5: -5, joint_6: 0, slider_joint: 180, speed: 15, delay: 300, gripper: 80 },
      { label: "Release Pastry", joint_1: 55, joint_2: -85, joint_3: 50, joint_4: -32, joint_5: -5, joint_6: 0, slider_joint: 180, speed: 10, delay: 400, gripper: 0 },
      { label: "Lift Away from Plate", joint_1: 55, joint_2: -65, joint_3: 35, joint_4: -38, joint_5: -5, joint_6: 0, slider_joint: 180, speed: 40, delay: 200, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Cup Stacking",
    description: "จัดเรียงแก้ว: หยิบแก้วซ้อนทับให้เป็นระเบียบ",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Approach Cup Stack A", joint_1: -60, joint_2: -52, joint_3: 22, joint_4: -38, joint_5: 0, joint_6: -10, slider_joint: 120, speed: 70, delay: 100, gripper: 0 },
      { label: "Descend to Top Cup", joint_1: -60, joint_2: -80, joint_3: 50, joint_4: -32, joint_5: 0, joint_6: -10, slider_joint: 120, speed: 25, delay: 200, gripper: 0 },
      { label: "Grip Top Cup", joint_1: -60, joint_2: -80, joint_3: 50, joint_4: -32, joint_5: 0, joint_6: -10, slider_joint: 120, speed: 15, delay: 500, gripper: 80 },
      { label: "Lift Cup", joint_1: -60, joint_2: -52, joint_3: 22, joint_4: -38, joint_5: 0, joint_6: -10, slider_joint: 120, speed: 35, delay: 200, gripper: 80 },
      { label: "Move to Target Stack B", joint_1: 60, joint_2: -52, joint_3: 22, joint_4: -38, joint_5: 0, joint_6: 10, slider_joint: 280, speed: 65, delay: 100, gripper: 80 },
      { label: "Align Over Stack B", joint_1: 60, joint_2: -65, joint_3: 35, joint_4: -36, joint_5: 0, joint_6: 10, slider_joint: 280, speed: 20, delay: 200, gripper: 80 },
      { label: "Lower Cup onto Stack", joint_1: 60, joint_2: -82, joint_3: 52, joint_4: -30, joint_5: 0, joint_6: 10, slider_joint: 280, speed: 15, delay: 300, gripper: 80 },
      { label: "Release Cup", joint_1: 60, joint_2: -82, joint_3: 52, joint_4: -30, joint_5: 0, joint_6: 10, slider_joint: 280, speed: 10, delay: 400, gripper: 0 },
      { label: "Lift Clear of Stack", joint_1: 60, joint_2: -55, joint_3: 25, joint_4: -38, joint_5: 0, joint_6: 10, slider_joint: 280, speed: 45, delay: 200, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Tray Organization",
    description: "จัดถาดเสิร์ฟ: เรียงแก้ว จาน และอุปกรณ์ให้เป็นระเบียบ",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Pick Up Glass 1", joint_1: -25, joint_2: -78, joint_3: 48, joint_4: -34, joint_5: 3, joint_6: -8, slider_joint: 45, speed: 30, delay: 300, gripper: 80 },
      { label: "Lift Glass 1", joint_1: -25, joint_2: -52, joint_3: 22, joint_4: -38, joint_5: 3, joint_6: -8, slider_joint: 45, speed: 45, delay: 200, gripper: 80 },
      { label: "Place Glass on Tray Left", joint_1: 30, joint_2: -80, joint_3: 50, joint_4: -36, joint_5: -3, joint_6: 5, slider_joint: 160, speed: 20, delay: 400, gripper: 0 },
      { label: "Move to Plate", joint_1: -40, joint_2: -58, joint_3: 28, joint_4: -38, joint_5: 0, joint_6: -15, slider_joint: 90, speed: 65, delay: 100, gripper: 0 },
      { label: "Grip Plate", joint_1: -40, joint_2: -82, joint_3: 52, joint_4: -32, joint_5: 0, joint_6: -15, slider_joint: 90, speed: 20, delay: 500, gripper: 80 },
      { label: "Lift and Transport Plate", joint_1: 20, joint_2: -52, joint_3: 22, joint_4: -40, joint_5: 0, joint_6: 0, slider_joint: 200, speed: 55, delay: 200, gripper: 80 },
      { label: "Place Plate on Tray Center", joint_1: 20, joint_2: -82, joint_3: 52, joint_4: -36, joint_5: 0, joint_6: 0, slider_joint: 200, speed: 20, delay: 400, gripper: 0 },
      { label: "Verify Alignment", joint_1: 20, joint_2: -65, joint_3: 35, joint_4: -40, joint_5: 0, joint_6: 0, slider_joint: 200, speed: 15, delay: 800, gripper: 0 },
      { label: "Adjust Tray Position", joint_1: 15, joint_2: -72, joint_3: 42, joint_4: -38, joint_5: 2, joint_6: -2, slider_joint: 195, speed: 10, delay: 500, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Beverage Mixing",
    description: "ผสมเครื่องดื่ม: เทส่วนผสม น้ำเชื่อม และนม",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Pick Up Mixing Cup", joint_1: 38, joint_2: -75, joint_3: 45, joint_4: -32, joint_5: 6, joint_6: 12, slider_joint: 75, speed: 35, delay: 300, gripper: 80 },
      { label: "Position Under Syrup Dispenser", joint_1: 72, joint_2: -62, joint_3: 35, joint_4: -45, joint_5: 0, joint_6: 20, slider_joint: 180, speed: 50, delay: 100, gripper: 80 },
      { label: "Dispense Syrup", joint_1: 72, joint_2: -75, joint_3: 48, joint_4: -40, joint_5: 0, joint_6: 20, slider_joint: 180, speed: 15, delay: 2000, gripper: 80 },
      { label: "Move to Milk Station", joint_1: 108, joint_2: -62, joint_3: 35, joint_4: -45, joint_5: -5, joint_6: 35, slider_joint: 300, speed: 55, delay: 100, gripper: 80 },
      { label: "Dispense Milk", joint_1: 108, joint_2: -75, joint_3: 48, joint_4: -40, joint_5: -5, joint_6: 35, slider_joint: 300, speed: 15, delay: 2500, gripper: 80 },
      { label: "Move to Stir Position", joint_1: 90, joint_2: -55, joint_3: 25, joint_4: -50, joint_5: 0, joint_6: 25, slider_joint: 240, speed: 45, delay: 200, gripper: 80 },
      { label: "Stir Beverage", joint_1: 90, joint_2: -70, joint_3: 40, joint_4: -48, joint_5: 15, joint_6: 25, slider_joint: 240, speed: 20, delay: 3000, gripper: 80 },
      { label: "Lift Mixing Cup", joint_1: 90, joint_2: -52, joint_3: 22, joint_4: -50, joint_5: 0, joint_6: 25, slider_joint: 240, speed: 30, delay: 300, gripper: 80 },
      { label: "Place Cup for Serving", joint_1: 50, joint_2: -80, joint_3: 50, joint_4: -38, joint_5: 0, joint_6: 15, slider_joint: 400, speed: 25, delay: 400, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Topping Application",
    description: "ใส่ท็อปปิ้ง: วิปครีม ซอส และตกแต่งหน้าเครื่องดื่ม",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Grip Whipped Cream Can", joint_1: -55, joint_2: -72, joint_3: 42, joint_4: -35, joint_5: -8, joint_6: -20, slider_joint: 95, speed: 30, delay: 300, gripper: 80 },
      { label: "Position Over Cup", joint_1: 65, joint_2: -58, joint_3: 28, joint_4: -45, joint_5: 5, joint_6: 22, slider_joint: 210, speed: 50, delay: 100, gripper: 80 },
      { label: "Apply Whipped Cream", joint_1: 65, joint_2: -68, joint_3: 38, joint_4: -42, joint_5: 5, joint_6: 22, slider_joint: 210, speed: 10, delay: 2500, gripper: 80 },
      { label: "Return Cream Can", joint_1: -55, joint_2: -72, joint_3: 42, joint_4: -35, joint_5: -8, joint_6: -20, slider_joint: 95, speed: 45, delay: 300, gripper: 0 },
      { label: "Grip Chocolate Sauce", joint_1: -42, joint_2: -68, joint_3: 38, joint_4: -36, joint_5: -5, joint_6: -15, slider_joint: 110, speed: 35, delay: 200, gripper: 80 },
      { label: "Position Over Cup Sauce", joint_1: 65, joint_2: -58, joint_3: 28, joint_4: -45, joint_5: 5, joint_6: 22, slider_joint: 210, speed: 50, delay: 100, gripper: 80 },
      { label: "Drizzle Chocolate Sauce", joint_1: 65, joint_2: -65, joint_3: 35, joint_4: -42, joint_5: 18, joint_6: 22, slider_joint: 210, speed: 8, delay: 1800, gripper: 80 },
      { label: "Return Sauce Bottle", joint_1: -42, joint_2: -68, joint_3: 38, joint_4: -36, joint_5: -5, joint_6: -15, slider_joint: 110, speed: 45, delay: 200, gripper: 0 },
      { label: "Add Garnish", joint_1: 80, joint_2: -72, joint_3: 42, joint_4: -40, joint_5: 10, joint_6: 28, slider_joint: 215, speed: 15, delay: 1200, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Package Assembly",
    description: "แพ็คสินค้า: ใส่กล่อง ปิดฝา และติดสติกเกอร์",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Pick Up Box Bottom", joint_1: -48, joint_2: -78, joint_3: 48, joint_4: -34, joint_5: 0, joint_6: -18, slider_joint: 115, speed: 30, delay: 300, gripper: 80 },
      { label: "Position Box on Table", joint_1: 25, joint_2: -82, joint_3: 52, joint_4: -36, joint_5: 0, joint_6: 8, slider_joint: 250, speed: 35, delay: 400, gripper: 0 },
      { label: "Grip Product", joint_1: -30, joint_2: -75, joint_3: 45, joint_4: -35, joint_5: 5, joint_6: -10, slider_joint: 70, speed: 25, delay: 400, gripper: 80 },
      { label: "Place Product in Box", joint_1: 25, joint_2: -85, joint_3: 55, joint_4: -38, joint_5: 5, joint_6: 8, slider_joint: 250, speed: 20, delay: 500, gripper: 0 },
      { label: "Align Product", joint_1: 25, joint_2: -80, joint_3: 50, joint_4: -38, joint_5: 5, joint_6: 8, slider_joint: 250, speed: 10, delay: 600, gripper: 0 },
      { label: "Pick Up Box Lid", joint_1: -55, joint_2: -72, joint_3: 42, joint_4: -35, joint_5: -5, joint_6: -22, slider_joint: 130, speed: 30, delay: 300, gripper: 80 },
      { label: "Place Lid on Box", joint_1: 25, joint_2: -68, joint_3: 38, joint_4: -40, joint_5: -5, joint_6: 8, slider_joint: 250, speed: 15, delay: 400, gripper: 0 },
      { label: "Press Lid Down", joint_1: 25, joint_2: -78, joint_3: 48, joint_4: -38, joint_5: -5, joint_6: 8, slider_joint: 250, speed: 10, delay: 800, gripper: 0 },
      { label: "Move Box to Output", joint_1: 115, joint_2: -68, joint_3: 38, joint_4: -42, joint_5: 0, joint_6: 40, slider_joint: 420, speed: 50, delay: 300, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Station Setup",
    description: "เตรียมสถานี: จัดวางอุปกรณ์และภาชนะก่อนเริ่มงาน",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Pick Up Cup Holder", joint_1: -68, joint_2: -75, joint_3: 45, joint_4: -35, joint_5: 2, joint_6: -25, slider_joint: 55, speed: 35, delay: 300, gripper: 80 },
      { label: "Place Cup Holder Station 1", joint_1: 45, joint_2: -78, joint_3: 48, joint_4: -36, joint_5: 2, joint_6: 15, slider_joint: 150, speed: 25, delay: 400, gripper: 0 },
      { label: "Grab Napkin Holder", joint_1: -52, joint_2: -72, joint_3: 42, joint_4: -36, joint_5: -3, joint_6: -18, slider_joint: 85, speed: 40, delay: 200, gripper: 80 },
      { label: "Place Napkin Holder", joint_1: 52, joint_2: -75, joint_3: 45, joint_4: -38, joint_5: -3, joint_6: 18, slider_joint: 165, speed: 25, delay: 400, gripper: 0 },
      { label: "Arrange Sugar Packets", joint_1: 18, joint_2: -80, joint_3: 50, joint_4: -38, joint_5: 8, joint_6: 5, slider_joint: 130, speed: 15, delay: 1000, gripper: 0 },
      { label: "Position Stir Sticks", joint_1: -18, joint_2: -78, joint_3: 48, joint_4: -36, joint_5: -5, joint_6: -5, slider_joint: 110, speed: 15, delay: 800, gripper: 0 },
      { label: "Check Station Alignment", joint_1: 0, joint_2: -55, joint_3: 25, joint_4: -42, joint_5: 0, joint_6: 0, slider_joint: 140, speed: 20, delay: 1500, gripper: 0 },
      { label: "Fine-tune Positions", joint_1: 5, joint_2: -65, joint_3: 35, joint_4: -40, joint_5: 2, joint_6: 2, slider_joint: 145, speed: 10, delay: 1000, gripper: 0 },
      { label: "Signal Setup Complete", joint_1: 0, joint_2: -55, joint_3: 25, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 20, delay: 500, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Quality Check",
    description: "ตรวจสอบคุณภาพ: สแกนและตรวจสอบสินค้าก่อนส่งมอบ",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Move Camera to Zone A", joint_1: -30, joint_2: -50, joint_3: 20, joint_4: -40, joint_5: 0, joint_6: -10, slider_joint: 80, speed: 60, delay: 200, gripper: 0 },
      { label: "Scan Product Front", joint_1: -30, joint_2: -62, joint_3: 32, joint_4: -38, joint_5: 0, joint_6: -10, slider_joint: 80, speed: 10, delay: 2000, gripper: 0 },
      { label: "Scan Product Side", joint_1: -15, joint_2: -62, joint_3: 32, joint_4: -40, joint_5: 12, joint_6: -5, slider_joint: 80, speed: 10, delay: 1500, gripper: 0 },
      { label: "Scan Product Top", joint_1: -22, joint_2: -45, joint_3: 15, joint_4: -45, joint_5: -8, joint_6: -8, slider_joint: 80, speed: 10, delay: 1500, gripper: 0 },
      { label: "Move Camera to Zone B", joint_1: 35, joint_2: -50, joint_3: 20, joint_4: -40, joint_5: 0, joint_6: 12, slider_joint: 200, speed: 60, delay: 200, gripper: 0 },
      { label: "Inspect Cup Fill Level", joint_1: 35, joint_2: -58, joint_3: 28, joint_4: -40, joint_5: 0, joint_6: 12, slider_joint: 200, speed: 10, delay: 2000, gripper: 0 },
      { label: "Check Lid Seal", joint_1: 35, joint_2: -52, joint_3: 22, joint_4: -42, joint_5: -5, joint_6: 12, slider_joint: 200, speed: 10, delay: 1500, gripper: 0 },
      { label: "Verify Label Placement", joint_1: 30, joint_2: -48, joint_3: 18, joint_4: -44, joint_5: 10, joint_6: 10, slider_joint: 195, speed: 10, delay: 1500, gripper: 0 },
      { label: "Approve and Tag Item", joint_1: 30, joint_2: -65, joint_3: 35, joint_4: -40, joint_5: 0, joint_6: 10, slider_joint: 195, speed: 20, delay: 800, gripper: 0 },
      { label: "Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
  {
    name: "Cleanup Workflow",
    description: "ทำความสะอาดสถานี: เก็บอุปกรณ์ เช็ดโต๊ะ และจัดพื้นที่",
    tasks: [
      { label: "Home Position", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
      { label: "Pick Up Cleaning Cloth", joint_1: -45, joint_2: -75, joint_3: 45, joint_4: -35, joint_5: 5, joint_6: -15, slider_joint: 100, speed: 35, delay: 300, gripper: 80 },
      { label: "Wipe Zone A Left Pass", joint_1: -60, joint_2: -68, joint_3: 38, joint_4: -38, joint_5: 0, joint_6: -22, slider_joint: 50, speed: 20, delay: 500, gripper: 80 },
      { label: "Wipe Zone A Right Pass", joint_1: 0, joint_2: -68, joint_3: 38, joint_4: -38, joint_5: 0, joint_6: 0, slider_joint: 50, speed: 20, delay: 500, gripper: 80 },
      { label: "Wipe Zone B Left Pass", joint_1: -60, joint_2: -68, joint_3: 38, joint_4: -38, joint_5: 0, joint_6: -22, slider_joint: 200, speed: 20, delay: 500, gripper: 80 },
      { label: "Wipe Zone B Right Pass", joint_1: 0, joint_2: -68, joint_3: 38, joint_4: -38, joint_5: 0, joint_6: 0, slider_joint: 200, speed: 20, delay: 500, gripper: 80 },
      { label: "Wipe Zone C Pass", joint_1: -30, joint_2: -68, joint_3: 38, joint_4: -38, joint_5: 0, joint_6: -10, slider_joint: 350, speed: 20, delay: 500, gripper: 80 },
      { label: "Return Cleaning Cloth", joint_1: -45, joint_2: -75, joint_3: 45, joint_4: -35, joint_5: 5, joint_6: -15, slider_joint: 100, speed: 40, delay: 300, gripper: 0 },
      { label: "Collect Used Items", joint_1: 70, joint_2: -78, joint_3: 48, joint_4: -36, joint_5: -5, joint_6: 25, slider_joint: 380, speed: 30, delay: 400, gripper: 80 },
      { label: "Deposit Used Items in Bin", joint_1: 150, joint_2: -70, joint_3: 40, joint_4: -40, joint_5: -5, joint_6: 55, slider_joint: 460, speed: 35, delay: 500, gripper: 0 },
      { label: "Final Return Home", joint_1: 0, joint_2: -45, joint_3: 0, joint_4: -45, joint_5: 0, joint_6: 0, slider_joint: 0, speed: 80, delay: 200, gripper: 0 },
    ],
  },
];

async function main() {
  console.log("🌱 Seeding database with realistic café robot sequences...");

  // Clear existing data
  await prisma.task.deleteMany();
  await prisma.job.deleteMany();

  for (let jobIdx = 0; jobIdx < jobSequences.length; jobIdx++) {
    const jobDef = jobSequences[jobIdx];
    const job = await prisma.job.create({
      data: {
        name: jobDef.name,
        description: jobDef.description,
        tasks: {
          create: jobDef.tasks.map((t, taskIdx) => ({
            sequence: taskIdx + 1,
            label: t.label,
            joint_1: t.joint_1,
            joint_2: t.joint_2,
            joint_3: t.joint_3,
            joint_4: t.joint_4,
            joint_5: t.joint_5,
            joint_6: t.joint_6,
            slider_joint: t.slider_joint,
            speed: t.speed,
            delay: t.delay,
            gripper: t.gripper,
          })),
        },
      },
      include: { tasks: true },
    });

    console.log(
      `✅ Created Job #${jobIdx + 1}: "${job.name}" with ${job.tasks.length} tasks`
    );
  }

  console.log("🎉 Seeding complete! Realistic café robot sequences ready.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seeding failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
