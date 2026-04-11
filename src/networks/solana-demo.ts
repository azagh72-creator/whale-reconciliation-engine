/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v2.0.0
 * Network Adapter: Solana Agent Networks (Generic)
 * ============================================================
 * Copyright © 2026 Flying Whale (zaghmout.btc | ERC-8004 #54)
 * ALL RIGHTS RESERVED — PROPRIETARY SOFTWARE
 * ============================================================
 *
 * This adapter demonstrates how any Solana-based agent network
 * can plug into the Universal Reconciliation Engine.
 *
 * To use with a real Solana agent network:
 *   1. Replace getAgents() with the network's agent registry API
 *   2. Replace getEarnings() with the network's earnings API
 *   3. Pass in the publisher's Solana address for verification
 * ============================================================
 */

import axios from 'axios';
import type { NetworkDataSource, UniversalAgent, UniversalEarning, ChainVerifier } from '../core/engine.js';
import { verifySolanaTx, getSolanaTransfersFrom } from '../chains/solana.js';

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

// ── Generic Solana agent network source ───────────────────────
export function createSolanaNetworkSource(config: {
  name:          string;
  apiBase:       string;
  publisherAddr: string;
  getAgentsPath: string;
  getEarningsPath: (agentId: string) => string;
  mapAgent:      (raw: any) => UniversalAgent;
  mapEarning:    (raw: any, agentId: string) => UniversalEarning;
  filterEarning?: (e: UniversalEarning) => boolean;
}): NetworkDataSource {
  return {
    name:  config.name,
    chain: 'solana',

    async getAgents(): Promise<UniversalAgent[]> {
      process.stdout.write(`Fetching ${config.name} agents... `);
      const data = await get<any>(`${config.apiBase}${config.getAgentsPath}`);
      if (!data) { console.log('0 (API unavailable)'); return []; }
      const list = Array.isArray(data) ? data : data.agents ?? data.correspondents ?? [];
      console.log(`${list.length} found`);
      return list.map(config.mapAgent);
    },

    async getEarnings(agentId: string): Promise<UniversalEarning[]> {
      await delay(200);
      const data = await get<any>(`${config.apiBase}${config.getEarningsPath(agentId)}`);
      if (!data) return [];
      const list = Array.isArray(data) ? data : data.earnings ?? [];
      return list.map((e: any) => config.mapEarning(e, agentId));
    },

    filterEarning: config.filterEarning,
  };
}

// ── Solana verifier ────────────────────────────────────────────
export const solanaVerifier: ChainVerifier = {
  chain:     'solana',
  unit:      'lamports',
  unitScale: 1,
  verifyTx:  verifySolanaTx,
};

// ── Example: aibtc.news on Solana (future) ────────────────────
// When aibtc.news expands to Solana, plug in:
//
// export const aibtcSolanaSource = createSolanaNetworkSource({
//   name:          'aibtc.news (Solana)',
//   apiBase:       'https://solana.aibtc.news/api',
//   publisherAddr: '<solana publisher pubkey>',
//   getAgentsPath: '/correspondents',
//   getEarningsPath: (id) => `/status/${id}`,
//   mapAgent: (c) => ({ id: c.pubkey, display_name: c.name, chain: 'solana' }),
//   mapEarning: (e, agentId) => ({
//     id: e.id, agent_id: agentId, amount: e.amount_lamports,
//     reason: e.reason, created_at: e.created_at,
//     payout_txid: e.payout_signature ?? null, voided_at: e.voided_at ?? null,
//   }),
//   filterEarning: (e) => e.reason === 'brief_inclusion',
// });
