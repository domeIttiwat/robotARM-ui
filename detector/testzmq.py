import zmq
import cv2
import numpy as np

# เปลี่ยนให้ตรงกับ IP ของเครื่อง Jetson Nano ของคุณ
JETSON_IP = "192.168.137.38"

def main():
    print(f"📡 Connecting to Jetson Raw ZMQ Stream at tcp://{JETSON_IP}:5555 ...")
    
    # สร้างจุดรับสัญญาณ ZMQ (Subscriber)
    context = zmq.Context()
    socket = context.socket(zmq.SUB)
    socket.connect(f"tcp://{JETSON_IP}:5555")
    socket.setsockopt_string(zmq.SUBSCRIBE, "")

    print("✅ Connected! Waiting for frames...")
    print("❌ Press 'q' to quit.")

    while True:
        try:
            # รอรับข้อมูลภาพดิบๆ ที่ถูกบีบอัดมาจาก Jetson
            data = socket.recv_pyobj()
            
            # ถอดรหัส Base64/JPEG กลับมาเป็นรูปภาพสี OpenCV
            frame_l = cv2.imdecode(data["cam_left"], 1)
            frame_r = cv2.imdecode(data["cam_right"], 1)

            # นำภาพซ้าย-ขวามาต่อติดกัน (เพื่อประหยัดหน้าต่าง)
            combined_frame = cv2.hconcat([frame_l, frame_r])

            # แสดงผลภาพดิบบนหน้าจอ
            cv2.imshow("RAW ZMQ STREAM (Left & Right)", combined_frame)

            # กดปุ่ม 'q' เพื่อออก
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"⚠️ Error receiving frame: {e}")

    cv2.destroyAllWindows()
    print("Closed ZMQ Viewer.")

if __name__ == "__main__":
    main()