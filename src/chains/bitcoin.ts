/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v2.0.0 — BITCOIN VERIFIER
 * ============================================================
 * Copyright © 2026 Flying Whale (zaghmout.btc | ERC-8004 #54)
 * ALL RIGHTS RESERVED — PROPRIETARY SOFTWARE
 * ============================================================
 */

import axios from 'axios';

const MEMPOOL_API = 'https://mempool.space/api';

export type BitcoinTxStatus = 'confirmed' | 'mempool' | 'not_found' | 'null';

export interface BitcoinVerifyResult {
  status:       BitcoinTxStatus;
  block_height?: number;
  block_time?:   number;
  block_time_iso?: string;
  fee?:          number;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const txCache = new Map<string, BitcoinVerifyResult>();

async function get<T>(url: string, retries = 3): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get<T>(url, {
        timeout: 12000,
        headers: { 'User-Agent': 'Flying-Whale-Engine/2.0.0' }
      });
      return res.data;
    } catch {
      if (i === retries - 1) return null;
      await delay(1500 * (i + 1));
    }
  }
  return null;
}

export async function verifyBitcoinTx(txid: string): Promise<BitcoinVerifyResult> {
  if (!txid || txid === 'null') return { status: 'null' };
  if (txCache.has(txid)) return txCache.get(txid)!;

  await delay(200);
  const data = await get<any>(`${MEMPOOL_API}/tx/${txid}`);

  if (!data) {
    const result: BitcoinVerifyResult = { status: 'not_found' };
    txCache.set(txid, result);
    return result;
  }

  if (data.status?.confirmed) {
    const result: BitcoinVerifyResult = {
      status:          'confirmed',
      block_height:    data.status.block_height,
      block_time:      data.status.block_time,
      block_time_iso:  data.status.block_time
        ? new Date(data.status.block_time * 1000).toISOString()
        : undefined,
      fee:             data.fee,
    };
    txCache.set(txid, result);
    return result;
  }

  const result: BitcoinVerifyResult = { status: 'mempool', fee: data.fee };
  txCache.set(txid, result);
  return result;
}
