/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v2.0.0 — SOLANA VERIFIER
 * ============================================================
 * Copyright © 2026 Flying Whale (zaghmout.btc | ERC-8004 #54)
 * BTC: bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p
 * STX: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW
 *
 * ALL RIGHTS RESERVED — PROPRIETARY SOFTWARE
 * ============================================================
 */

import axios from 'axios';

const SOLANA_RPC     = 'https://api.mainnet-beta.solana.com';
const SOLANA_RPC_ALT = 'https://solana-mainnet.g.alchemy.com/v2/demo';

export type SolanaTxStatus = 'confirmed' | 'pending' | 'failed' | 'not_found' | 'null';

export interface SolanaVerifyResult {
  status:     SolanaTxStatus;
  slot?:      number;
  block_time?: number;
  block_time_iso?: string;
  fee?:       number;
  amount?:    number;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const txCache = new Map<string, SolanaVerifyResult>();

// ── RPC call helper ──────────────────────────────────────────
async function rpc<T>(method: string, params: unknown[], retries = 3): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.post<{ result: T; error?: { message: string } }>(
        SOLANA_RPC,
        { jsonrpc: '2.0', id: 1, method, params },
        { timeout: 12000, headers: { 'Content-Type': 'application/json' } }
      );
      if (res.data.error) return null;
      return res.data.result;
    } catch {
      if (i === retries - 1) return null;
      await delay(1500 * (i + 1));
    }
  }
  return null;
}

// ── Verify a Solana transaction signature ────────────────────
export async function verifySolanaTx(signature: string): Promise<SolanaVerifyResult> {
  if (!signature || signature === 'null') return { status: 'null' };
  if (txCache.has(signature)) return txCache.get(signature)!;

  await delay(300);

  const tx = await rpc<any>('getTransaction', [
    signature,
    { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }
  ]);

  if (!tx) {
    // Check if it's in mempool (getSignatureStatuses)
    const statuses = await rpc<any>('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
    if (statuses?.value?.[0]) {
      const s = statuses.value[0];
      if (s.err) {
        const result: SolanaVerifyResult = { status: 'failed' };
        txCache.set(signature, result);
        return result;
      }
      if (s.confirmationStatus === 'processed' || s.confirmationStatus === 'confirmed') {
        const result: SolanaVerifyResult = { status: 'pending', slot: s.slot };
        txCache.set(signature, result);
        return result;
      }
    }
    const result: SolanaVerifyResult = { status: 'not_found' };
    txCache.set(signature, result);
    return result;
  }

  // Extract SPL token transfer amount if present
  let amount: number | undefined;
  try {
    const instructions = tx.transaction?.message?.instructions ?? [];
    for (const ix of instructions) {
      if (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') {
        amount = Number(ix.parsed.info?.amount ?? ix.parsed.info?.tokenAmount?.amount ?? 0);
        break;
      }
    }
  } catch { /* ignore */ }

  const result: SolanaVerifyResult = {
    status:          tx.meta?.err ? 'failed' : 'confirmed',
    slot:            tx.slot,
    block_time:      tx.blockTime,
    block_time_iso:  tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined,
    fee:             tx.meta?.fee,
    amount,
  };

  txCache.set(signature, result);
  return result;
}

// ── Get all SPL token transfers FROM a sender address ────────
export interface SolanaTransfer {
  signature:  string;
  slot:       number;
  block_time: number;
  block_time_iso: string;
  amount:     number;
  recipient:  string;
  mint:       string;
  memo?:      string;
}

export async function getSolanaTransfersFrom(
  senderAddress: string,
  limit = 1000
): Promise<SolanaTransfer[]> {
  const sigs = await rpc<any[]>('getSignaturesForAddress', [
    senderAddress,
    { limit, commitment: 'confirmed' }
  ]);

  if (!sigs || sigs.length === 0) return [];

  const transfers: SolanaTransfer[] = [];

  for (const sig of sigs) {
    if (sig.err) continue;
    await delay(100);

    const tx = await rpc<any>('getTransaction', [
      sig.signature,
      { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }
    ]);

    if (!tx || tx.meta?.err) continue;

    const instructions = tx.transaction?.message?.instructions ?? [];
    for (const ix of instructions) {
      const t = ix.parsed?.type;
      if (t === 'transfer' || t === 'transferChecked') {
        const info = ix.parsed.info;
        if (!info) continue;

        transfers.push({
          signature:     sig.signature,
          slot:          tx.slot,
          block_time:    tx.blockTime,
          block_time_iso: new Date(tx.blockTime * 1000).toISOString(),
          amount:        Number(info.amount ?? info.tokenAmount?.amount ?? 0),
          recipient:     info.destination ?? info.account ?? '',
          mint:          info.mint ?? '',
          memo:          sig.memo ?? undefined,
        });
      }
    }
  }

  return transfers;
}

// ── Verify a batch of signatures ─────────────────────────────
export async function verifyBatch(
  signatures: string[]
): Promise<Map<string, SolanaVerifyResult>> {
  const results = new Map<string, SolanaVerifyResult>();
  for (const sig of signatures) {
    if (!sig || sig === 'null') {
      results.set(sig, { status: 'null' });
      continue;
    }
    const r = await verifySolanaTx(sig);
    results.set(sig, r);
  }
  return results;
}
