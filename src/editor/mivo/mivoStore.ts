import { create } from "zustand";
import {
  exchangeMivoToken,
  readStoredMivoCredentials,
  writeStoredMivoCredentials,
} from "./mivoClient";

export type MivoConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface MivoState {
  apiKey: string;
  session: string | null;
  status: MivoConnectionStatus;
  error: string | null;
  connect: (apiKey: string) => Promise<boolean>;
  disconnect: () => void;
  getSession: () => string | null;
}

const storedCredentials = readStoredMivoCredentials();

export const useMivoStore = create<MivoState>((set, get) => ({
  apiKey: storedCredentials?.apiKey ?? "",
  session: storedCredentials?.session ?? null,
  status: storedCredentials?.session ? "connected" : "disconnected",
  error: null,
  connect: async (apiKey) => {
    const trimmed = apiKey.trim();

    if (!trimmed) {
      set({ status: "error", error: "请输入 Mivo API Key" });
      return false;
    }

    set({ status: "connecting", error: null });

    try {
      const { session, expiresAt } = await exchangeMivoToken(trimmed);

      writeStoredMivoCredentials({ apiKey: trimmed, session, expiresAt });
      set({ apiKey: trimmed, session, status: "connected", error: null });
      return true;
    } catch (error) {
      const message = error instanceof TypeError ? "无法连接 Mivo（网络或跨域受限）" : (error as Error).message;

      writeStoredMivoCredentials(null);
      set({ session: null, status: "error", error: message });
      return false;
    }
  },
  disconnect: () => {
    writeStoredMivoCredentials(null);
    set({ session: null, status: "disconnected", error: null });
  },
  getSession: () => get().session,
}));
