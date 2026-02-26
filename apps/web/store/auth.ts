import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "planner" | "viewer";
  tenant_id: string;
  tenant_name: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user:  null,
      setAuth: (token, user) => {
        localStorage.setItem("dp_token", token);
        set({ token, user });
      },
      logout: () => {
        localStorage.removeItem("dp_token");
        set({ token: null, user: null });
        window.location.href = "/login";
      },
    }),
    { name: "dp-auth" }
  )
);
