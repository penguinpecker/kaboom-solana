import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("kaboom vault init", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const PROGRAM_ID = new PublicKey("2EaLenCErRF3oKnDB1X6zFzo489JHKBMkFPoSRFcYYr7");

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("kaboom_vault_v2")],
    PROGRAM_ID
  );

  it("Checks vault PDA", async () => {
    console.log("Vault PDA:", vaultPda.toBase58());
    console.log("Owner:", provider.wallet.publicKey.toBase58());
    const bal = await provider.connection.getBalance(provider.wallet.publicKey);
    console.log("Deployer balance:", bal / LAMPORTS_PER_SOL, "SOL");

    const info = await provider.connection.getAccountInfo(vaultPda);
    if (info) {
      console.log("Vault already exists! Size:", info.data.length, "bytes");
    } else {
      console.log("Vault not initialized yet");
    }
  });
});
