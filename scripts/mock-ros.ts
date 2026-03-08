/**
 * Mock ROS Bridge Relay Server
 *
 * Implements a subset of rosbridge v2 WebSocket protocol.
 * Acts as a broker between the Next.js UI and the IK simulator
 * (or any rosbridge-compatible client).
 *
 * Run:  npm run mock-ros
 * URL:  ws://localhost:9090
 *
 * Protocol (rosbridge v2):
 *   Subscribe: { "op": "subscribe", "topic": "/foo", "type": "..." }
 *   Publish:   { "op": "publish",   "topic": "/foo", "msg": {...} }
 */

import { WebSocketServer, WebSocket } from "ws";

const PORT = 9090;

// Map of topic → Set of subscriber WebSockets
const subscribers = new Map<string, Set<WebSocket>>();

// Track clients for logging
let clientCounter = 0;
const clientIds = new WeakMap<WebSocket, number>();

// Whether any client is publishing /joint_states (real simulator connected)
let hasJointPublisher = false;
let jointPublisherWs: WebSocket | null = null; // track exact client so we only reset on its disconnect
let autoPublishTimer: NodeJS.Timeout | null = null;

// Simulate machine_state + robot_status after a /goto_position command
// (only used when no real publisher is connected)
let machineStateTimer: NodeJS.Timeout | null = null;
let robotStatusTimer: NodeJS.Timeout | null = null;

// Mock joint positions — updated by Jog/goto commands when no real sim
let mockJointPositions = [0, 0, 0, 0, 0, 0, 0, 0]; // j1-j6 (deg), rail (mm), gripper (%)
let jogInactivityTimer: NodeJS.Timeout | null = null;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function publishTopic(topic: string, data: number) {
  const subs = subscribers.get(topic);
  if (!subs || subs.size === 0) return;
  const payload = JSON.stringify({ op: "publish", topic, msg: { data } });
  subs.forEach((sub) => { if (sub.readyState === 1) sub.send(payload); });
  console.log(`[AUTO] ${topic} → ${data}`);
}

function publishJointStates(positions: number[]) {
  const subs = subscribers.get("/joint_states");
  if (!subs || subs.size === 0) return;
  const payload = JSON.stringify({
    op: "publish",
    topic: "/joint_states",
    msg: {
      name: ["j1", "j2", "j3", "j4", "j5", "j6", "rail", "gripper"],
      position: positions,
      velocity: [0, 0, 0, 0, 0, 0],
    },
  });
  subs.forEach((sub) => { if (sub.readyState === WebSocket.OPEN) sub.send(payload); });
}

function publishFakeEEPose(positions: number[]) {
  const eeSubs = subscribers.get("/end_effector_pose");
  if (!eeSubs || eeSubs.size === 0) return;

  const j1Rad = (positions[0] ?? 0) * Math.PI / 180;
  const j2Rad = (positions[1] ?? 0) * Math.PI / 180;
  const j3Rad = (positions[2] ?? 0) * Math.PI / 180;
  const j4Rad = (positions[3] ?? 0) * Math.PI / 180;
  const j5Rad = (positions[4] ?? 0) * Math.PI / 180;
  const L1 = 250, L2 = 220, L3 = 160;
  const reach = L1 * Math.cos(j2Rad) + L2 * Math.cos(j2Rad + j3Rad) + L3;

  const payload = JSON.stringify({
    op: "publish",
    topic: "/end_effector_pose",
    msg: {
      data: JSON.stringify({
        x:     Math.round(reach * Math.cos(j1Rad) * 10) / 10,
        y:     Math.round(reach * Math.sin(j1Rad) * 10) / 10,
        z:     Math.max(0, Math.round((250 + L1 * Math.sin(j2Rad) + L2 * Math.sin(j2Rad + j3Rad)) * 10) / 10),
        roll:  Math.round(j4Rad * 180 / Math.PI * 10) / 10,
        pitch: Math.round(j5Rad * 180 / Math.PI * 10) / 10,
        yaw:   Math.round(j1Rad * 180 / Math.PI * 10) / 10,
      }),
    },
  });

  eeSubs.forEach((sub) => { if (sub.readyState === WebSocket.OPEN) sub.send(payload); });
}

// ─── Simulation helpers ───────────────────────────────────────────────────────

function simulateMachineState() {
  if (machineStateTimer) clearTimeout(machineStateTimer);
  machineStateTimer = setTimeout(() => {
    publishTopic("/machine_state", 2); // reached
    machineStateTimer = setTimeout(() => publishTopic("/machine_state", 0), 200);
  }, 1500);
}

function simulateRobotStatus() {
  if (robotStatusTimer) clearTimeout(robotStatusTimer);
  publishTopic("/robot_status", 1); // moving
  robotStatusTimer = setTimeout(() => publishTopic("/robot_status", 0), 1500); // idle
}

// Handle goto_position when no real sim: move to target joints immediately
function handleGotoPositionMock(taskData: any) {
  stopAutoPublish();
  if (jogInactivityTimer) clearTimeout(jogInactivityTimer);

  mockJointPositions = [
    taskData.j1 ?? 0, taskData.j2 ?? 0, taskData.j3 ?? 0,
    taskData.j4 ?? 0, taskData.j5 ?? 0, taskData.j6 ?? 0,
    taskData.rail ?? 0, taskData.gripper ?? 0,
  ];

  publishJointStates(mockJointPositions);
  publishFakeEEPose(mockJointPositions);

  // Restart oscillation after 2s of inactivity
  jogInactivityTimer = setTimeout(() => startAutoPublish(), 2000);
}

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

console.log(`\n🤖  Mock ROS Bridge ready on ws://localhost:${PORT}`);
console.log(`    Protocol: rosbridge v2`);
console.log(`    Waiting for clients...\n`);

wss.on("connection", (ws: WebSocket) => {
  const id = ++clientCounter;
  clientIds.set(ws, id);
  console.log(`[+] Client #${id} connected  (total: ${wss.clients.size})`);

  ws.on("message", (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn(`[!] Client #${id} sent invalid JSON`);
      return;
    }

    const { op, topic } = msg;

    if (op === "subscribe") {
      if (!subscribers.has(topic)) {
        subscribers.set(topic, new Set());
      }
      subscribers.get(topic)!.add(ws);
      console.log(
        `[SUB] Client #${id} subscribed to ${topic}  ` +
          `(${subscribers.get(topic)!.size} subs)`
      );

      // Once UI subscribes to /joint_states, send a static home position (no oscillation)
      if (topic === "/joint_states" && !hasJointPublisher) {
        setTimeout(() => publishJointStates([0, 0, 0, 0, 0, 0, 0, 0]), 100);
      }
      if (topic === "/end_effector_pose" && !hasJointPublisher) {
        setTimeout(() => publishFakeEEPose([0, 0, 0, 0, 0, 0, 0, 0]), 120);
      }
      // Send initial idle states when UI subscribes
      if (topic === "/machine_state") {
        setTimeout(() => publishTopic("/machine_state", 0), 100);
      }
      if (topic === "/robot_status") {
        setTimeout(() => publishTopic("/robot_status", 0), 100);
      }
      if (topic === "/safety_status") {
        setTimeout(() => publishTopic("/safety_status", 0), 100);
      }
    } else if (op === "publish") {
      const subs = subscribers.get(topic);
      const count = subs ? subs.size : 0;
      console.log(`[PUB] Client #${id} → ${topic}  (${count} receivers)`);

      // If real simulator is publishing joint states, track it and stop auto-publish
      if (topic === "/joint_states") {
        if (!hasJointPublisher) {
          hasJointPublisher = true;
          jointPublisherWs = ws;
          stopAutoPublish();
          console.log(`[SIM] Real joint publisher detected (Client #${clientIds.get(ws)})`);
        }
      }

      // Handle goto_position: move joints immediately when no real sim connected
      if (topic === "/goto_position" && !hasJointPublisher) {
        try {
          const taskData = JSON.parse(msg.msg.data);
          handleGotoPositionMock(taskData);
          // Only simulate execution status for non-jog tasks
          if (taskData.label !== "jog") {
            simulateMachineState();
            simulateRobotStatus();
          }
        } catch {
          // fallback: legacy simulate behavior
          simulateMachineState();
          simulateRobotStatus();
        }
      }

      // Relay to all subscribers except the sender
      if (subs && subs.size > 0) {
        const payload = JSON.stringify({
          op: "publish",
          topic,
          msg: msg.msg,
        });
        subs.forEach((sub) => {
          if (sub !== ws && sub.readyState === WebSocket.OPEN) {
            sub.send(payload);
          }
        });
      }

      // When real publisher sends /joint_states, compute fake FK and relay as /end_effector_pose
      if (topic === "/joint_states" && msg.msg?.position) {
        publishFakeEEPose(msg.msg.position as number[]);
      }
    } else if (op === "advertise") {
      // Acknowledged but no action needed
      console.log(`[ADV] Client #${id} advertises ${topic}`);
    } else {
      console.log(`[?] Client #${id} unknown op: ${op}`);
    }
  });

  ws.on("close", () => {
    console.log(`[-] Client #${id} disconnected (total: ${wss.clients.size})`);

    // Remove from all subscriber sets
    subscribers.forEach((subs, topic) => {
      subs.delete(ws);
      if (subs.size === 0) subscribers.delete(topic);
    });

    // Only reset publisher state if THE publisher client disconnected
    if (ws === jointPublisherWs) {
      hasJointPublisher = false;
      jointPublisherWs = null;
      console.log(`[SIM] Real joint publisher disconnected — robot at last known position`);
      // Publish last known position once so UI shows where robot stopped
      publishJointStates(mockJointPositions);
      publishFakeEEPose(mockJointPositions);
    } else if (wss.clients.size === 0) {
      hasJointPublisher = false;
      jointPublisherWs = null;
    }
  });

  ws.on("error", (err: Error) => {
    console.error(`[!] Client #${id} error:`, err.message);
  });
});

// ─── No auto-oscillation — robot stays at home/last-known position ───────────
// startAutoPublish/stopAutoPublish kept as no-ops for backward compat

function startAutoPublish() { /* oscillation removed — robot stays still */ }
function stopAutoPublish()  { if (autoPublishTimer) { clearInterval(autoPublishTimer); autoPublishTimer = null; } }
