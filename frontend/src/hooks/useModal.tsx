"use client";
import { createContext, useContext, useState, ReactNode, useCallback } from "react";

type ModalType = "wallet" | "profile" | "deposit" | "fair" | "referral" | "settings" | "win" | "lose" | "detail" | null;

interface ModalContextType {
  modal: ModalType;
  open: (m: ModalType) => void;
  close: () => void;
}

const ModalContext = createContext<ModalContextType | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalType>(null);
  const open = useCallback((m: ModalType) => setModal(m), []);
  const close = useCallback(() => setModal(null), []);

  const value = { modal, open, close };
  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}
