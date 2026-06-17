/**
 * fix-vault-token.ts
 *
 * Calls initialize_vault_token to create the vault token account for the
 * new devnet USDC mint (Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr).
 *
 * Prereq: vault_data must already exist (it does).
 * Anyone can call this — no authority constraint on initialize_vault_token.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/fix-vault-token.ts
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import IDL from '../src/lib/idl/cs_skin_futures.json';

const RPC         = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? path.join(os.homedir(), '.config', 'solana', 'id.json');
const PROGRAM_ID  = new PublicKey('76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f');
const NEW_MINT    = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
const TOKEN_PROG  = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

function pda(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

async function main() {
  const conn    = new Connection(RPC, 'confirmed');
  const secret  = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8')));
  const payer   = Keypair.fromSecretKey(secret);
  const wallet  = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed', preflightCommitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as unknown as anchor.Idl, provider);

  const vaultData      = pda([Buffer.from('vault')]);
  const vaultToken     = pda([Buffer.from('vault'), NEW_MINT.toBuffer()]);
  const vaultAuthority = pda([Buffer.from('vault_authority')]);

  console.log('Payer       :', payer.publicKey.toBase58());
  console.log('New USDC mint:', NEW_MINT.toBase58());
  console.log('vault_data  :', vaultData.toBase58());
  console.log('vault_token :', vaultToken.toBase58());
  console.log('vault_auth  :', vaultAuthority.toBase58());

  // Check if vault_token already exists
  const existing = await conn.getAccountInfo(vaultToken);
  if (existing) {
    console.log('\nvault_token already exists — nothing to do.');
    return;
  }

  const bal = await conn.getBalance(payer.publicKey);
  console.log('Payer SOL   :', (bal / 1e9).toFixed(4));
  if (bal < 0.01e9) throw new Error('Payer needs at least 0.01 SOL for rent');

  console.log('\nCalling initialize_vault_token …');
  const sig = await program.methods
    .initializeVaultToken()
    .accounts({
      authority:     payer.publicKey,
      vaultData,
      vaultToken,
      vaultAuthority,
      usdcMint:      NEW_MINT,
      tokenProgram:  TOKEN_PROG,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  console.log('Signature   :', sig);
  console.log('\nVerifying …');
  const info = await conn.getAccountInfo(vaultToken);
  console.log('vault_token:', info ? `EXISTS  len=${info.data.length}  owner=${info.owner.toBase58().slice(0,8)}` : 'STILL MISSING');
}

main().catch(err => {
  console.error('\n[fatal]', err?.message ?? err);
  process.exit(1);
});
