/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v2.0.0 — STACKS VERIFIER
 * ============================================================
 * Copyright © 2026 Flying Whale (zaghmout.btc | ERC-8004 #54)
 * ALL RIGHTS RESERVED — PROPRIETARY SOFTWARE
 * ============================================================
 */

import axios from 'axios';

const HIRO_API = 'https://api.hiro.so';

export type StacksTxStatus = 'confirmed' | 'pending' | 'not_found' | 'null';

export interface StacksVerifyResult {
  status:       StacksTxStatus;
  block_height?: number;
  block_time?:   string;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const txCache = new Map<string, StacksVerifyResult>();

async function get<T>(url: string, retries = 3): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get<T>(url, {
        timeout: 12000,
        headers: { 'Accept': 'application/json', 'User-Agent': 'Flying-Whale-Engine/2.0.0' }
      });
      return res.data;
    } catch {
      if (i === retries - 1) return null;
      await delay(1500 * (i + 1));
    }
  }
  return null;
}

export async function verifyStacksTx(txid: string): Promise<StacksVerifyResult> {
  if (!txid || txid === 'null') return { status: 'null' };
  if (txCache.has(txid)) return txCache.get(txid)!;

  await delay(300);
  const data = await get<any>(`${HIRO_API}/extended/v1/tx/${txid}`);

  if (!data || data.error || data.tx_status === undefined) {
    const result: StacksVerifyResult = { status: 'not_found' };
    txCache.set(txid, result);
    return result;
  }

  if (data.tx_status === 'success') {
    const result: StacksVerifyResult = {
      status:       'confirmed',
      block_height: data.block_height,
      block_time:   data.burn_block_time_iso,
    };
    txCache.set(txid, result);
    return result;
  }

  if (['pending', 'submitted', 'mempool'].includes(data.tx_status)) {
    const result: StacksVerifyResult = { status: 'pending' };
    txCache.set(txid, result);
    return result;
  }

  const result: StacksVerifyResult = { status: 'not_found' };
  txCache.set(txid, result);
  return result;
}

export async function getStacksTransfersFrom(
  publisherStx: string,
  limit = 50
): Promise<any[]> {
  const data = await get<any>(
    `${HIRO_API}/extended/v1/address/${publisherStx}/transactions?limit=${limit}`
  );
  return data?.results ?? [];
}
