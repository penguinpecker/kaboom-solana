"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { ReactNode } from "react";

const solanaConnectors = toSolanaWalletConnectors();
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";

export default function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmn6cx0bf02550dlbbbl8qk5j"}
      config={{
        appearance: { theme: "dark", accentColor: "#f97316" },
        loginMethods: ["email", "wallet", "google"],
        embeddedWallets: { solana: { createOnLogin: "all-users" }, showWalletUIs: false },
        externalWallets: { solana: { connectors: solanaConnectors } },
      }}
    >
      <ConnectionProvider endpoint={RPC}>{children}</ConnectionProvider>
    </PrivyProvider>
  );
}
