import { Commitment, PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey(
  '76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f',
);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  'https://devnet.helius-rpc.com/?api-key=f6fe2699-bbfb-4999-b2e5-e58ebd674f2e';

// USDC mints — swap USDC_MINT to MAINNET after production deployment
export const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC_MINT_DEVNET  = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
export const USDC_MINT         = USDC_MINT_DEVNET;

export const NETWORK: 'devnet' | 'mainnet-beta' = 'devnet';

export const COMMITMENT: Commitment = 'confirmed';

export const EXPLORER_BASE =
  NETWORK === 'devnet'
    ? 'https://explorer.solana.com/tx/{sig}?cluster=devnet'
    : 'https://explorer.solana.com/tx/{sig}';

export function explorerTxUrl(sig: string): string {
  return EXPLORER_BASE.replace('{sig}', sig);
}
