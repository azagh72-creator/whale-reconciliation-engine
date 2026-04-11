/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v2.0.0
 * Network Adapter: aibtc.news (Stacks/sBTC)
 * ============================================================
 * Copyright © 2026 Flying Whale (zaghmout.btc | ERC-8004 #54)
 * ALL RIGHTS RESERVED — PROPRIETARY SOFTWARE
 * ============================================================
 */

import axios from 'axios';
import type { NetworkDataSource, UniversalAgent, UniversalEarning, ChainVerifier } from '../core/engine.js';
import { verifyStacksTx } from '../chains/stacks.js';

const NEWS_API       = 'https://aibtc.news/api';
const PUBLISHER_STX  = 'SP1KGHF33817ZXW27CG50JXWC0Y6BNXAQ4E7YGAHM';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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

// ── aibtc.news data source ────────────────────────────────────
export const aibtcNewsSource: NetworkDataSource = {
  name:  'aibtc.news',
  chain: 'stacks',

  async getAgents(): Promise<UniversalAgent[]> {
    process.stdout.write('Fetching aibtc.news correspondents... ');
    const data = await get<{ correspondents: any[] }>(`${NEWS_API}/correspondents`);
    const list = data?.correspondents ?? [];

    if (list.length === 0) {
      const lb = await get<{ leaderboard: any[] }>(`${NEWS_API}/leaderboard`);
      const fallback = lb?.leaderboard ?? [];
      console.log(`${fallback.length} (via leaderboard)`);
      return fallback.map(c => ({
        id:           c.address,
        display_name: c.displayName ?? c.display_name ?? c.address.slice(0, 12),
        chain:        'stacks' as const,
      }));
    }

    console.log(`${list.length} found`);
    return list.map(c => ({
      id:           c.address,
      display_name: c.displayName ?? c.display_name ?? c.address.slice(0, 12),
      chain:        'stacks' as const,
    }));
  },

  async getEarnings(agentId: string): Promise<UniversalEarning[]> {
    const status = await get<any>(`${NEWS_API}/status/${agentId}`);
    if (!status?.earnings) return [];

    return (status.earnings as any[]).map(e => ({
      id:          e.id,
      agent_id:    agentId,
      amount:      e.amount_sats ?? 0,
      reason:      e.reason ?? '',
      created_at:  e.created_at ?? '',
      payout_txid: e.payout_txid ?? null,
      voided_at:   e.voided_at ?? null,
    }));
  },

  filterEarning: (e) => e.reason === 'brief_inclusion',
};

// ── Stacks/sBTC verifier for aibtc.news ──────────────────────
export const stacksVerifier: ChainVerifier = {
  chain:     'stacks',
  unit:      'sats',
  unitScale: 1,
  verifyTx:  verifyStacksTx,
};
