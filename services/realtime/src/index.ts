import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { Redis } from "ioredis";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const REDIS_URL  = process.env.REDIS_URL  || "redis://:dpredis@localhost:6379/3";
const PORT       = parseInt(process.env.PORT || "8002");

// ─── Redis (pub/sub for scaling across multiple instances) ────────────
const pub = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

// ─── Express + Socket.IO ─────────────────────────────────────────────
const app    = express();
const server = createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ─── In-memory presence (use Redis in production for multi-instance) ──
interface PresenceEntry {
  userId: string;
  name: string;
  tenantId: string;
  socketId: string;
  page: string;
  color: string;
}

const presenceMap = new Map<string, PresenceEntry>();
const USER_COLORS = ["#0c90e7","#10b981","#f59e0b","#8b5cf6","#ef4444","#ec4899","#06b6d4","#84cc16"];

// ─── Auth Middleware ──────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    socket.data.userId   = payload.sub;
    socket.data.tenantId = payload.tenant_id;
    socket.data.role     = payload.role;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

// ─── Socket.IO Events ─────────────────────────────────────────────────
io.on("connection", (socket: Socket) => {
  const { userId, tenantId } = socket.data;
  const tenantRoom = `tenant:${tenantId}`;

  // Always join tenant room (all events scoped to tenant)
  socket.join(tenantRoom);

  // Add to presence
  const colorIdx = presenceMap.size % USER_COLORS.length;
  const entry: PresenceEntry = {
    userId,
    name: socket.handshake.query.name as string || userId,
    tenantId,
    socketId: socket.id,
    page: "/dashboard/overview",
    color: USER_COLORS[colorIdx],
  };
  presenceMap.set(socket.id, entry);
  _broadcastPresence(tenantId);

  // ── Room management (scenario workspaces, etc.) ────────────────────
  socket.on("room:join", ({ room }: { room: string }) => {
    if (!room.startsWith(`tenant:${tenantId}`)) {
      socket.emit("error", { message: "Cannot join rooms outside your tenant" });
      return;
    }
    socket.join(room);
    console.log(`[${userId}] joined room: ${room}`);
  });

  socket.on("room:leave", ({ room }: { room: string }) => {
    socket.leave(room);
  });

  // ── Page tracking ──────────────────────────────────────────────────
  socket.on("presence:page", ({ page }: { page: string }) => {
    const entry = presenceMap.get(socket.id);
    if (entry) {
      entry.page = page;
      presenceMap.set(socket.id, entry);
      _broadcastPresence(tenantId);
    }
  });

  // ── Scenario collaboration events ──────────────────────────────────
  socket.on("scenario:delta:apply", (data: {
    scenarioId: string;
    skuId: string;
    period: string;
    value: number;
    comment: string;
    authorName: string;
  }) => {
    // Broadcast to all in the scenario room (others see the change live)
    const room = `tenant:${tenantId}:scenario:${data.scenarioId}`;
    socket.to(room).emit("scenario:delta:applied", {
      ...data,
      appliedAt: new Date().toISOString(),
    });

    // Also broadcast notification to tenant room
    io.to(tenantRoom).emit("notification", {
      type: "scenario_update",
      message: `${data.authorName} updated ${data.skuId} in scenario`,
      scenarioId: data.scenarioId,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on("scenario:cell:lock", ({ scenarioId, skuId, period }: any) => {
    const room = `tenant:${tenantId}:scenario:${scenarioId}`;
    socket.to(room).emit("scenario:cell:locked", {
      skuId,
      period,
      lockedBy: { userId, name: entry.name, color: entry.color },
    });
  });

  socket.on("scenario:cell:unlock", ({ scenarioId, skuId, period }: any) => {
    const room = `tenant:${tenantId}:scenario:${scenarioId}`;
    socket.to(room).emit("scenario:cell:unlocked", { skuId, period });
  });

  // ── Forecast completion notifications ─────────────────────────────
  socket.on("subscribe:forecast", ({ tenantId: tid }: { tenantId: string }) => {
    if (tid === tenantId) {
      socket.join(`forecast:${tenantId}`);
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    presenceMap.delete(socket.id);
    _broadcastPresence(tenantId);
    console.log(`[${userId}] disconnected`);
  });
});

// ─── Redis pub/sub (receive events from other services) ───────────────
sub.subscribe("forecast:completed", "plan:locked", (err) => {
  if (err) console.error("Redis subscribe error:", err);
});

sub.on("message", (channel: string, message: string) => {
  try {
    const data = JSON.parse(message);
    const tenantRoom = `tenant:${data.tenant_id}`;

    if (channel === "forecast:completed") {
      io.to(tenantRoom).emit("forecast:updated", {
        message: `Forecast complete: ${data.skus_processed} SKUs processed`,
        ...data,
      });
    }

    if (channel === "plan:locked") {
      io.to(tenantRoom).emit("plan:locked", data);
    }
  } catch (e) {
    console.error("Failed to parse Redis message:", e);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────
function _broadcastPresence(tenantId: string) {
  const tenantUsers = Array.from(presenceMap.values())
    .filter((e) => e.tenantId === tenantId)
    .map(({ userId, name, page, color }) => ({ userId, name, page, color }));

  io.to(`tenant:${tenantId}`).emit("presence:update", tenantUsers);
}

// ─── Start ────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[realtime] WebSocket server listening on :${PORT}`);
});
