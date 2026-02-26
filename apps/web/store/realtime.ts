import { create } from "zustand";
import { io, Socket } from "socket.io-client";

interface PresenceUser {
  userId: string;
  name: string;
  page: string;
  color: string;
}

interface RealtimeState {
  socket: Socket | null;
  connected: boolean;
  presence: PresenceUser[];
  connect: (token: string) => void;
  disconnect: () => void;
  joinRoom: (room: string) => void;
  leaveRoom: (room: string) => void;
  emit: (event: string, data: unknown) => void;
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  socket: null,
  connected: false,
  presence: [],

  connect: (token: string) => {
    const existing = get().socket;
    if (existing?.connected) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8002";
    const socket = io(wsUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => set({ connected: true }));
    socket.on("disconnect", () => set({ connected: false }));

    socket.on("presence:update", (users: PresenceUser[]) => {
      set({ presence: users });
    });

    socket.on("scenario:delta:applied", (data) => {
      // Invalidate react-query cache for this scenario
      window.dispatchEvent(new CustomEvent("dp:scenario:delta", { detail: data }));
    });

    socket.on("forecast:updated", (data) => {
      window.dispatchEvent(new CustomEvent("dp:forecast:updated", { detail: data }));
    });

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, connected: false, presence: [] });
  },

  joinRoom: (room: string) => {
    get().socket?.emit("room:join", { room });
  },

  leaveRoom: (room: string) => {
    get().socket?.emit("room:leave", { room });
  },

  emit: (event: string, data: unknown) => {
    get().socket?.emit(event, data);
  },
}));
