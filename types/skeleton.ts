// MediaPipe Pose keypoint indices used for person proximity detection

export interface SkeletonKeypoint {
  x: number;           // world X in meters (Three.js units)
  y: number;           // world Y in meters
  z: number;           // world Z in meters
  visibility?: number; // 0–1 confidence, optional
}

export const SKELETON_KEYPOINT_NAMES: Record<number, string> = {
  0:  "Nose",
  11: "L.Shoulder", 12: "R.Shoulder",
  13: "L.Elbow",    14: "R.Elbow",
  15: "L.Wrist",    16: "R.Wrist",
  23: "L.Hip",      24: "R.Hip",
  27: "L.Ankle",    28: "R.Ankle",
};

export const USED_KEYPOINT_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 27, 28] as const;

// Bone connections between keypoints for drawing the skeleton
export const SKELETON_CONNECTIONS: [number, number][] = [
  [11, 12], // shoulder bar
  [11, 23], [12, 24], // torso sides
  [23, 24], // hip bar
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [23, 27], [24, 28], // legs (simplified hip→ankle)
  [0,  11], [0,  12], // head-to-shoulders (neck approx)
];

export interface SkeletonPerson {
  keypoints: Partial<Record<number, SkeletonKeypoint>>;
  id?: number;
}

// Payload received from the skeleton WebSocket (port 8767 by default)
export interface SkeletonPayload {
  persons:    SkeletonPerson[];
  timestamp?: number;
}

// Robot arm capsule segment labels (index 0-5 corresponds to caspuleRadii[0-5])
export const CAPSULE_SEGMENT_LABELS = [
  "Base → J2",
  "J2 → J3",
  "J3 → J4",
  "J4 → J5",
  "J5 → J6",
  "J6 → TCP",
] as const;
