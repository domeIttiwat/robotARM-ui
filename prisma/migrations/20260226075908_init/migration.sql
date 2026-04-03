-- CreateTable
CREATE TABLE "Job" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT,
    "joint_1" REAL NOT NULL,
    "joint_2" REAL NOT NULL,
    "joint_3" REAL NOT NULL,
    "joint_4" REAL NOT NULL,
    "joint_5" REAL NOT NULL,
    "joint_6" REAL NOT NULL,
    "slider_joint" REAL NOT NULL,
    "taskType" TEXT NOT NULL DEFAULT 'move',
    "planningMode" TEXT,
    "speed" INTEGER NOT NULL DEFAULT 50,
    "delay" INTEGER NOT NULL DEFAULT 0,
    "gripper" INTEGER NOT NULL DEFAULT 0,
    "controlMode" TEXT NOT NULL DEFAULT 'joint',
    "x" REAL,
    "y" REAL,
    "z" REAL,
    "roll" REAL,
    "pitch" REAL,
    "yaw" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "joint_1" REAL NOT NULL DEFAULT 0,
    "joint_2" REAL NOT NULL DEFAULT 0,
    "joint_3" REAL NOT NULL DEFAULT 0,
    "joint_4" REAL NOT NULL DEFAULT 0,
    "joint_5" REAL NOT NULL DEFAULT 0,
    "joint_6" REAL NOT NULL DEFAULT 0,
    "slider_joint" REAL NOT NULL DEFAULT 0,
    "gripper" INTEGER NOT NULL DEFAULT 0,
    "controlMode" TEXT NOT NULL DEFAULT 'joint',
    "x" REAL,
    "y" REAL,
    "z" REAL,
    "roll" REAL,
    "pitch" REAL,
    "yaw" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
