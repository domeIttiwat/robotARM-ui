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

// Whether any client is publishing /joint_states (IK simulator connected)
let hasJointPublisher = false;
let autoPublishTimer: NodeJS.Timeout | null = null;

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

      // Once UI subscribes to /joint_states, start auto-publish if no IK sim
      if (topic === "/joint_states") {
        startAutoPublish();
      }
    } else if (op === "publish") {
      const subs = subscribers.get(topic);
      const count = subs ? subs.size : 0;
      console.log(`[PUB] Client #${id} → ${topic}  (${count} receivers)`);

      // If IK simulator is publishing joint states, stop auto-publish
      if (topic === "/joint_states") {
        hasJointPublisher = true;
        stopAutoPublish();
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

    // If no clients left, stop auto-publish and reset publisher flag
    if (wss.clients.size === 0) {
      hasJointPublisher = false;
      stopAutoPublish();
    } else if (hasJointPublisher) {
      // Check if any remaining client was the joint publisher (heuristic: restart auto if needed)
      hasJointPublisher = false;
      startAutoPublish();
    }
  });

  ws.on("error", (err: Error) => {
    console.error(`[!] Client #${id} error:`, err.message);
  });
});

// ─── Auto-publish joint oscillation when IK simulator is not connected ────────

let oscillationT = 0;

function startAutoPublish() {
  if (autoPublishTimer || hasJointPublisher) return;
  console.log("[AUTO] Starting joint oscillation loop (IK simulator not connected)");

  autoPublishTimer = setInterval(() => {
    const subs = subscribers.get("/joint_states");
    if (!subs || subs.size === 0) return;
    if (hasJointPublisher) {
      stopAutoPublish();
      return;
    }

    oscillationT += 0.1;
    const s = Math.sin(oscillationT);
    const c = Math.cos(oscillationT * 0.7);

    const payload = JSON.stringify({
      op: "publish",
      topic: "/joint_states",
      msg: {
        name: ["j1", "j2", "j3", "j4", "j5", "j6", "rail", "gripper"],
        position: [
          s * 45,        // J1  degrees
          c * 30,        // J2  degrees
          s * 20,        // J3  degrees
          c * 60,        // J4  degrees
          s * 15,        // J5  degrees
          c * 90,        // J6  degrees
          Math.abs(s) * 300,  // rail  mm
          (Math.sin(oscillationT * 0.3) + 1) * 50, // gripper 0-100%
        ],
        velocity: [0, 0, 0, 0, 0, 0],
      },
    });

    subs.forEach((sub) => {
      if (sub.readyState === WebSocket.OPEN) sub.send(payload);
    });
  }, 100); // 10 Hz
}

function stopAutoPublish() {
  if (autoPublishTimer) {
    clearInterval(autoPublishTimer);
    autoPublishTimer = null;
    console.log("[AUTO] Stopped joint oscillation loop");
  }
}
