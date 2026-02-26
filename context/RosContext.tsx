"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import * as ROSLIB from "roslib";

interface RosContextType {
  isConnected: boolean;
  jointStates: number[];
  railPos: number;
  safetyStatus: number;
  sendJob: (jobData: any) => void;
  setTeachMode: (status: boolean) => void;
}

const RosContext = createContext<RosContextType | null>(null);

export const RosProvider = ({ children }: { children: React.ReactNode }) => {
  const [ros, setRos] = useState<ROSLIB.Ros | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [jointStates, setJointStates] = useState([0, 0, 0, 0, 0, 0]);
  const [railPos, setRailPos] = useState(0);
  const [safetyStatus, setSafetyStatus] = useState(0);

  useEffect(() => {
    const connectRos = () => {
      const rosInstance = new ROSLIB.Ros({
        url: "ws://localhost:9090",
      });

      rosInstance.on("connection", () => {
        console.log("ROS Bridge Connected");
        setIsConnected(true);
      });

      rosInstance.on("error", () => setIsConnected(false));

      rosInstance.on("close", () => {
        setIsConnected(false);
        setTimeout(connectRos, 5000);
      });

      // Joint state subscriber
      const jointSub = new ROSLIB.Topic({
        ros: rosInstance,
        name: "/joint_states",
        messageType: "sensor_msgs/JointState",
      });
      jointSub.subscribe((m: any) => {
        if (m.position) {
          setJointStates(m.position.slice(0, 6));
          if (m.position[6] !== undefined) setRailPos(m.position[6]);
        }
      });

      // Safety status subscriber
      const safetySub = new ROSLIB.Topic({
        ros: rosInstance,
        name: "/safety_status",
        messageType: "std_msgs/Int8",
      });
      safetySub.subscribe((m: any) => setSafetyStatus(m.data));

      setRos(rosInstance);
    };

    connectRos();
    return () => ros?.close();
  }, []);

  const sendJob = useCallback(
    (jobData: any) => {
      if (!ros) return;
      const topic = new ROSLIB.Topic({
        ros,
        name: "/execute_trajectory",
        messageType: "std_msgs/String",
      });
      topic.publish({ data: JSON.stringify(jobData) });
    },
    [ros]
  );

  const setTeachMode = useCallback(
    (status: boolean) => {
      if (!ros) return;
      const topic = new ROSLIB.Topic({
        ros,
        name: "/teach_mode",
        messageType: "std_msgs/Bool",
      });
      topic.publish({ data: status });
    },
    [ros]
  );

  return (
    <RosContext.Provider
      value={{
        isConnected,
        jointStates,
        railPos,
        safetyStatus,
        sendJob,
        setTeachMode,
      }}
    >
      {children}
    </RosContext.Provider>
  );
};

export const useRos = () => {
  const context = useContext(RosContext);
  if (!context) throw new Error("useRos must be used within RosProvider");
  return context;
};
