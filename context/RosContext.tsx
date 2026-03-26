"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import * as ROSLIB from "roslib";
import { loadJetsonConfig, makeWsUrl } from "@/lib/jetsonConfig";

export interface CalibrationData {
  offsets: number[];  // [j1, j2, j3, j4, j5, j6, rail, gripper]
  flips: boolean[];   // [j1, j2, j3, j4, j5, j6, rail, gripper]
  tcpOffset: { x: number; y: number; z: number };  // Tool center point offset in mm
  tcpFlips: { x: boolean; y: boolean; z: boolean }; // Flip sign of each TCP axis
}

const DEFAULT_CALIBRATION: CalibrationData = {
  offsets: [0, 0, 0, 0, 0, 0, 0, 0],
  flips: [false, false, false, false, false, false, false, false],
  tcpOffset: { x: 0, y: 0, z: 0 },
  tcpFlips: { x: false, y: false, z: false },
};

export interface EffectorPose {
  x: number; y: number; z: number;
  roll: number; pitch: number; yaw: number;
}

interface RosContextType {
  isConnected: boolean;
  jointStates: number[];
  jointVelocities: number[];
  railPos: number;
  gripperPos: number;
  safetyStatus: number;
  robotStatus: number;
  machineState: number;
  effectorPose: EffectorPose;
  sendJob: (jobData: any) => void;
  sendGotoPosition: (taskData: any) => void;
  sendJogCommand: (cmd: any) => void;
  setTeachMode: (status: boolean) => void;
  isExecuting: boolean;
  isPaused: boolean;
  executionStartTime: number | null;
  currentTaskIndex: number;
  stopExecution: () => void;
  pauseExecution: () => void;
  resumeExecution: () => void;
  startExecution: () => void;
  setCurrentTaskIndex: (index: number) => void;
  isTestMode: boolean;
  setTestMode: (v: boolean) => void;
  publishSafetyLevel: (level: 0 | 1 | 2) => void;
  calibration: CalibrationData;
  setCalibration: (data: CalibrationData) => void;
  effectiveTcpOffset: { x: number; y: number; z: number };
}

const RosContext = createContext<RosContextType | null>(null);

export const RosProvider = ({ children }: { children: React.ReactNode }) => {
  // Use refs so callbacks always read the latest instance without stale closures
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const isConnectedRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [jointStates, setJointStates] = useState([0, 0, 0, 0, 0, 0]);
  const [jointVelocities, setJointVelocities] = useState([0, 0, 0, 0, 0, 0]);
  const [railPos, setRailPos] = useState(0);
  const [gripperPos, setGripperPos] = useState(0);
  const [safetyStatus, setSafetyStatus] = useState(0);
  const [robotStatus, setRobotStatus] = useState(0);
  const [machineState, setMachineState] = useState(0);
  const [effectorPose, setEffectorPose] = useState<EffectorPose>({ x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 });
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [executionStartTime, setExecutionStartTime] = useState<number | null>(
    null
  );
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [isTestMode, setIsTestMode] = useState(false);

  const [calibration, setCalibrationState] = useState<CalibrationData>(DEFAULT_CALIBRATION);

  // Load from localStorage after mount (avoids SSR/client hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem("robotCalibration");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.tcpOffset) parsed.tcpOffset = { x: 0, y: 0, z: 0 };
        if (!parsed.tcpFlips)  parsed.tcpFlips  = { x: false, y: false, z: false };
        setCalibrationState(parsed);
      } catch {}
    }
  }, []);

  // Ref so subscriber closure always sees latest calibration without re-subscribing
  const calibrationRef = useRef(calibration);
  useEffect(() => { calibrationRef.current = calibration; }, [calibration]);

  const setCalibration = useCallback((data: CalibrationData) => {
    setCalibrationState(data);
    localStorage.setItem("robotCalibration", JSON.stringify(data));
  }, []);

  // Forward transform: raw sensor → display value
  const applyForward = (raw: number, index: number, cal: CalibrationData) =>
    (cal.flips[index] ? -raw : raw) + cal.offsets[index];

  // Inverse transform: display value → raw command
  const applyInverse = useCallback((display: number, index: number) => {
    const cal = calibrationRef.current;
    const unOffset = display - cal.offsets[index];
    return cal.flips[index] ? -unOffset : unOffset;
  }, []);

  useEffect(() => {
    const connectRos = () => {
      const cfg = loadJetsonConfig();
      const rosInstance = new ROSLIB.Ros({
        url: makeWsUrl(cfg.ip, cfg.rosPort),
      });

      rosInstance.on("connection", () => {
        console.log("[ROS] Bridge connected");
        rosRef.current = rosInstance;
        isConnectedRef.current = true;
        setIsConnected(true);
      });

      rosInstance.on("error", () => {
        console.warn("[ROS] Bridge error");
        isConnectedRef.current = false;
        setIsConnected(false);
      });

      rosInstance.on("close", () => {
        console.warn("[ROS] Bridge closed — reconnecting in 5s");
        isConnectedRef.current = false;
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
        const cal = calibrationRef.current;
        if (m.position) {
          const calibratedJoints = m.position
            .slice(0, 6)
            .map((raw: number, i: number) => applyForward(raw, i, cal));
          setJointStates(calibratedJoints);
          if (m.position[6] !== undefined)
            setRailPos(applyForward(m.position[6], 6, cal));
          if (m.position[7] !== undefined)
            setGripperPos(applyForward(m.position[7], 7, cal));
        }
        if (m.velocity && m.velocity.length >= 6) {
          setJointVelocities(m.velocity.slice(0, 6));
        }
      });

      // End-effector pose subscriber (XYZ mm + RPY degrees)
      const poseSub = new ROSLIB.Topic({
        ros: rosInstance,
        name: "/end_effector_pose",
        messageType: "std_msgs/String",
      });
      poseSub.subscribe((m: any) => {
        try {
          const p = JSON.parse(m.data);
          setEffectorPose({
            x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0,
            roll: p.roll ?? 0, pitch: p.pitch ?? 0, yaw: p.yaw ?? 0,
          });
        } catch {}
      });

      // Safety status subscriber
      const safetySub = new ROSLIB.Topic({
        ros: rosInstance,
        name: "/safety_status",
        messageType: "std_msgs/Int8",
      });
      safetySub.subscribe((m: any) => setSafetyStatus(m.data));

      // Robot execution status subscriber
      const robotStatusSub = new ROSLIB.Topic({
        ros: rosInstance,
        name: "/robot_status",
        messageType: "std_msgs/Int8",
      });
      robotStatusSub.subscribe((m: any) => {
        setRobotStatus(m.data);
        if (m.data === 0) {
          setIsExecuting(false);
          setIsPaused(false);
        } else if (m.data === 1) {
          setIsPaused(false);
        } else if (m.data === 2) {
          setIsPaused(true);
        }
      });

      // Machine state subscriber
      // 0 = idle/normal, 2 = reached target, 3 = singularity (effector mode failed)
      const machineStateSub = new ROSLIB.Topic({
        ros: rosInstance,
        name: "/machine_state",
        messageType: "std_msgs/Int8",
      });
      machineStateSub.subscribe((m: any) => setMachineState(m.data));

      // Store instance in ref (ros is live from this point; isConnectedRef becomes true on "connection")
      rosRef.current = rosInstance;
    };

    connectRos();
    return () => rosRef.current?.close();
  }, []);

  // Effective TCP offset after applying per-axis flip signs
  const effectiveTcpOffset = {
    x: (calibration.tcpFlips?.x ? -1 : 1) * calibration.tcpOffset.x,
    y: (calibration.tcpFlips?.y ? -1 : 1) * calibration.tcpOffset.y,
    z: (calibration.tcpFlips?.z ? -1 : 1) * calibration.tcpOffset.z,
  };

  // Publish /tool_config whenever TCP offset changes or connection is established
  useEffect(() => {
    if (!rosRef.current || !isConnected) return;
    const payload = {
      tcp_x: calibration.tcpOffset.x,
      tcp_y: calibration.tcpOffset.y,
      tcp_z: calibration.tcpOffset.z,
    };
    console.log("[ROS] publish /tool_config", payload);
    const topic = new ROSLIB.Topic({
      ros: rosRef.current,
      name: "/tool_config",
      messageType: "std_msgs/String",
    });
    topic.publish({ data: JSON.stringify(payload) });
    console.log("[ROS] publish /tool_config done");
  }, [calibration.tcpOffset, isConnected]);

  const sendJob = useCallback(
    (jobData: any) => {
      if (!rosRef.current || !isConnectedRef.current) {
        console.warn("[ROS] sendJob skipped — not connected");
        return;
      }
      const rawTasks = jobData.tasks?.map((task: any) => ({
        ...task,
        j1: applyInverse(task.j1, 0),
        j2: applyInverse(task.j2, 1),
        j3: applyInverse(task.j3, 2),
        j4: applyInverse(task.j4, 3),
        j5: applyInverse(task.j5, 4),
        j6: applyInverse(task.j6, 5),
        rail: applyInverse(task.rail, 6),
        gripper: applyInverse(task.gripper, 7),
      }));
      const payload = { ...jobData, tasks: rawTasks };
      console.log("[ROS] publish /execute_trajectory", payload);
      const topic = new ROSLIB.Topic({
        ros: rosRef.current,
        name: "/execute_trajectory",
        messageType: "std_msgs/String",
      });
      topic.publish({ data: JSON.stringify(payload) });
      console.log("[ROS] publish /execute_trajectory done");
    },
    [applyInverse]
  );

  const sendGotoPosition = useCallback(
    (taskData: any) => {
      if (!rosRef.current || !isConnectedRef.current) {
        console.warn("[ROS] sendGotoPosition skipped — not connected");
        return;
      }
      const cal = calibrationRef.current;
      const rawTask = {
        ...taskData,
        j1: applyInverse(taskData.j1, 0),
        j2: applyInverse(taskData.j2, 1),
        j3: applyInverse(taskData.j3, 2),
        j4: applyInverse(taskData.j4, 3),
        j5: applyInverse(taskData.j5, 4),
        j6: applyInverse(taskData.j6, 5),
        rail: applyInverse(taskData.rail, 6),
        gripper: applyInverse(taskData.gripper, 7),
        // Effector mode: include Cartesian target for robot IK
        ...(taskData.controlMode === "effector" && taskData.x != null && {
          x: taskData.x, y: taskData.y, z: taskData.z,
          roll: taskData.roll, pitch: taskData.pitch, yaw: taskData.yaw,
        }),
        // Always send TCP offset so robot always has latest tool config
        tcp_x: cal.tcpOffset.x,
        tcp_y: cal.tcpOffset.y,
        tcp_z: cal.tcpOffset.z,
      };
      console.log("[ROS] publish /goto_position", rawTask);
      const topic = new ROSLIB.Topic({
        ros: rosRef.current,
        name: "/goto_position",
        messageType: "std_msgs/String",
      });
      topic.publish({ data: JSON.stringify(rawTask) });
      console.log("[ROS] publish /goto_position done");
    },
    [applyInverse]
  );

  const sendJogCommand = useCallback(
    (cmd: any) => {
      if (!rosRef.current || !isConnectedRef.current) {
        console.warn("[ROS] sendJogCommand skipped — not connected");
        return;
      }
      console.log("[ROS] publish /goto_position (jog)", cmd);
      const topic = new ROSLIB.Topic({
        ros: rosRef.current,
        name: "/goto_position",
        messageType: "std_msgs/String",
      });
      topic.publish({ data: JSON.stringify(cmd) });
      console.log("[ROS] publish /goto_position (jog) done");
    },
    []
  );

  const setTeachMode = useCallback(
    (status: boolean) => {
      if (!rosRef.current || !isConnectedRef.current) {
        console.warn("[ROS] setTeachMode skipped — not connected");
        return;
      }
      console.log("[ROS] publish /teach_mode", status);
      const topic = new ROSLIB.Topic({
        ros: rosRef.current,
        name: "/teach_mode",
        messageType: "std_msgs/Bool",
      });
      topic.publish({ data: status });
      console.log("[ROS] publish /teach_mode done");
    },
    []
  );

  const stopExecution = useCallback(() => {
    if (rosRef.current && isConnectedRef.current) {
      console.log("[ROS] publish /stop_execution true");
      const topic = new ROSLIB.Topic({
        ros: rosRef.current,
        name: "/stop_execution",
        messageType: "std_msgs/Bool",
      });
      topic.publish({ data: true });
      console.log("[ROS] publish /stop_execution done");
    } else {
      console.warn("[ROS] stopExecution skipped — not connected");
    }
    setIsExecuting(false);
    setIsPaused(false);
    setExecutionStartTime(null);
    setCurrentTaskIndex(0);
  }, []);

  const pauseExecution = useCallback(() => {
    if (rosRef.current && isConnectedRef.current) {
      console.log("[ROS] publish /pause_execution true");
      const topic = new ROSLIB.Topic({
        ros: rosRef.current,
        name: "/pause_execution",
        messageType: "std_msgs/Bool",
      });
      topic.publish({ data: true });
      console.log("[ROS] publish /pause_execution done");
    } else {
      console.warn("[ROS] pauseExecution skipped — not connected");
    }
    setIsPaused(true);
  }, []);

  const resumeExecution = useCallback(() => {
    if (rosRef.current && isConnectedRef.current) {
      console.log("[ROS] publish /pause_execution false (resume)");
      const topic = new ROSLIB.Topic({
        ros: rosRef.current,
        name: "/pause_execution",
        messageType: "std_msgs/Bool",
      });
      topic.publish({ data: false });
      console.log("[ROS] publish /pause_execution (resume) done");
    } else {
      console.warn("[ROS] resumeExecution skipped — not connected");
    }
    setIsPaused(false);
  }, []);

  const startExecution = useCallback(() => {
    setIsExecuting(true);
    setExecutionStartTime(Date.now());
    setCurrentTaskIndex(0);
  }, []);

  // Publish safety level from UI skeleton detection (0=safe, 1=warn/slow, 2=stop)
  const publishSafetyLevel = useCallback((level: 0 | 1 | 2) => {
    if (!rosRef.current || !isConnectedRef.current) {
      console.warn("[ROS] publishSafetyLevel skipped — not connected");
      return;
    }
    console.log("[ROS] publish /safety_status", level);
    const topic = new ROSLIB.Topic({
      ros: rosRef.current,
      name: "/safety_status",
      messageType: "std_msgs/Int8",
    });
    topic.publish({ data: level });
    console.log("[ROS] publish /safety_status done");
  }, []);

  const updateCurrentTaskIndex = useCallback((index: number) => {
    setCurrentTaskIndex(index);
  }, []);

  return (
    <RosContext.Provider
      value={{
        isConnected,
        jointStates,
        jointVelocities,
        railPos,
        gripperPos,
        safetyStatus,
        robotStatus,
        machineState,
        effectorPose,
        sendJob,
        sendGotoPosition,
        sendJogCommand,
        setTeachMode,
        isExecuting,
        isPaused,
        executionStartTime,
        currentTaskIndex,
        stopExecution,
        pauseExecution,
        resumeExecution,
        startExecution,
        setCurrentTaskIndex: updateCurrentTaskIndex,
        isTestMode,
        setTestMode: setIsTestMode,
        publishSafetyLevel,
        calibration,
        setCalibration,
        effectiveTcpOffset,
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
