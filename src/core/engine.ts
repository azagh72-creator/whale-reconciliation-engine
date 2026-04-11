/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v2.0.0 — UNIVERSAL CORE
 * ============================================================
 * Copyright © 2026 Flying Whale (zaghmout.btc | ERC-8004 #54)
 * BTC: bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p
 * STX: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW
 * SOL: (see wallet config)
 *
 * ALL RIGHTS RESERVED — PROPRIETARY SOFTWARE
 * License: View-Only Output License v1.0
 * On-chain IP: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW.whale-ip-store-v1
 * ============================================================
 *
 * UNIVERSAL AGENT PAYMENT AUDIT PROTOCOL
 * ───────────────────────────────────────
 * Any agent network can plug in:
 *   1. A data source (getAgents, getEarnings)
 *   2. A chain verifier (verifyTx)
 * And get a full cryptographically-verified reconciliation report.
 *
 * Supported chains: Stacks (sBTC/STX) · Solana (SOL/SPL) · Bitcoin (BTC)
 * ============================================================
 */

import crypto from 'crypto';
import fs from 'fs';

// ── Chain types ───────────────────────────────────────────────
export type Chain = 'stacks' | 'solana' | 'bitcoin';
export type TxStatus = 'confirmed' | 'pending' | 'not_found' | 'null' | 'failed' | 'mempool';

// ── Universal earning interface ───────────────────────────────
export interface UniversalEarning {
  id:          string;
  agent_id:    string;           // address or pubkey depending on chain
  amount:      number;           // in base units (sats, lamports, etc)
  reason:      string;
  created_at:  string;
  payout_txid: string | null;
  voided_at:   string | null;
  metadata?:   Record<string, unknown>;
}

export interface UniversalAgent {
  id:           string;          // address / pubkey
  display_name: string;
  chain:        Chain;
  metadata?:    Record<string, unknown>;
}

// ── Verifier interface — plug any chain ───────────────────────
export interface ChainVerifier {
  chain:     Chain;
  verifyTx:  (txid: string) => Promise<{
    status:      TxStatus;
    block_height?: number;
    block_time?:   string | number;
    fee?:          number;
    amount?:       number;
  }>;
  unit:      string;   // 'sats' | 'lamports' | 'sats'
  unitScale: number;   // e.g. 1 for sats, 1 for lamports
}

// ── Data source interface — plug any network ──────────────────
export interface NetworkDataSource {
  name:        string;
  chain:       Chain;
  getAgents:   () => Promise<UniversalAgent[]>;
  getEarnings: (agentId: string) => Promise<UniversalEarning[]>;
  filterEarning?: (e: UniversalEarning) => boolean;
}

// ── Per-agent result ──────────────────────────────────────────
export interface AgentResult {
  agent_id:       string;
  display_name:   string;
  chain:          Chain;
  total_earnings: number;
  confirmed:      number;
  pending:        number;
  unpaid:         number;
  failed:         number;
  earnings_detail: EarningDetail[];
}

export interface EarningDetail {
  earning_id:   string;
  agent_id:     string;
  display_name: string;
  amount:       number;
  created_at:   string;
  payout_txid:  string | null;
  tx_status:    TxStatus;
  block_height?: number;
  block_time?:   string | number;
}

// ── Full report ───────────────────────────────────────────────
export interface ReconciliationReport {
  engine:        string;
  version:       string;
  copyright:     string;
  owner_btc:     string;
  owner_stx:     string;
  generated_at:  string;
  network:       string;
  chain:         Chain;
  summary: {
    total_agents:     number;
    total_earnings:   number;
    total_owed:       number;
    confirmed:        number;
    pending:          number;
    unpaid:           number;
    confirmed_pct:    string;
    pending_pct:      string;
    unpaid_pct:       string;
    unit:             string;
  };
  agents:        AgentResult[];
  sha256:        string;
}

// ── Universal reconciliation engine ──────────────────────────
export async function reconcileNetwork(
  source:   NetworkDataSource,
  verifier: ChainVerifier,
  options: {
    outDir:  string;
    verbose?: boolean;
  }
): Promise<ReconciliationReport> {

  const COPYRIGHT = '© 2026 Flying Whale (zaghmout.btc | ERC-8004 #54) — ALL RIGHTS RESERVED';
  const VERSION   = '2.0.0';
  const log = options.verbose !== false ? console.log : () => {};

  log(`\n${'═'.repeat(60)}`);
  log(` Whale Reconciliation Engine v${VERSION}`);
  log(` Network: ${source.name} | Chain: ${source.chain}`);
  log(` ${COPYRIGHT}`);
  log(`${'═'.repeat(60)}\n`);

  const agents = await source.getAgents();
  const results: AgentResult[] = [];

  let processed = 0;
  for (const agent of agents) {
    processed++;
    process.stdout.write(`[${processed}/${agents.length}] ${agent.id.slice(0, 20)}... `);

    const rawEarnings = await source.getEarnings(agent.id);
    const earnings = rawEarnings.filter(e =>
      !e.voided_at && (source.filterEarning ? source.filterEarning(e) : true)
    );

    if (earnings.length === 0) { log('0 earnings'); continue; }

    const detail: EarningDetail[] = [];
    let confirmed = 0, pending = 0, unpaid = 0, failed = 0;

    for (const e of earnings) {
      let txStatus: TxStatus = 'null';
      let blockHeight: number | undefined;
      let blockTime: string | number | undefined;

      if (e.payout_txid) {
        const v = await verifier.verifyTx(e.payout_txid);
        txStatus   = v.status;
        blockHeight = v.block_height;
        blockTime   = v.block_time;
      }

      if      (txStatus === 'confirmed') confirmed += e.amount;
      else if (txStatus === 'pending')   pending   += e.amount;
      else if (txStatus === 'failed')    failed    += e.amount;
      else                               unpaid    += e.amount;

      detail.push({
        earning_id:   e.id,
        agent_id:     agent.id,
        display_name: agent.display_name,
        amount:       e.amount,
        created_at:   e.created_at,
        payout_txid:  e.payout_txid,
        tx_status:    txStatus,
        block_height: blockHeight,
        block_time:   blockTime,
      });
    }

    log(`✓ ${earnings.length} | confirmed:${confirmed} pending:${pending} unpaid:${unpaid}`);
    results.push({
      agent_id:       agent.id,
      display_name:   agent.display_name,
      chain:          source.chain,
      total_earnings: earnings.length,
      confirmed, pending, unpaid, failed,
      earnings_detail: detail,
    });
  }

  // ── Aggregate ─────────────────────────────────────────────
  const totalOwed     = results.reduce((s, r) => s + r.confirmed + r.pending + r.unpaid + r.failed, 0);
  const confirmedTotal = results.reduce((s, r) => s + r.confirmed, 0);
  const pendingTotal   = results.reduce((s, r) => s + r.pending, 0);
  const unpaidTotal    = results.reduce((s, r) => s + r.unpaid, 0);
  const totalEarnings  = results.reduce((s, r) => s + r.total_earnings, 0);
  const pct = (n: number) => totalOwed > 0 ? ((n / totalOwed) * 100).toFixed(1) + '%' : '0%';

  // ── Build report ──────────────────────────────────────────
  const reportBody = {
    engine:       `Flying Whale Reconciliation Engine v${VERSION}`,
    version:      VERSION,
    copyright:    COPYRIGHT,
    owner_btc:    'bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p',
    owner_stx:    'SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW',
    generated_at: new Date().toISOString(),
    network:      source.name,
    chain:        source.chain,
    summary: {
      total_agents:  results.length,
      total_earnings: totalEarnings,
      total_owed:    totalOwed,
      confirmed:     confirmedTotal,
      pending:       pendingTotal,
      unpaid:        unpaidTotal,
      confirmed_pct: pct(confirmedTotal),
      pending_pct:   pct(pendingTotal),
      unpaid_pct:    pct(unpaidTotal),
      unit:          verifier.unit,
    },
    agents: results.sort((a, b) => (b.unpaid + b.pending) - (a.unpaid + a.pending)),
  };

  const reportStr  = JSON.stringify(reportBody, null, 2);
  const sha256Hash = crypto.createHash('sha256').update(reportStr).digest('hex');
  const report: ReconciliationReport = { ...reportBody, sha256: sha256Hash };

  // ── Write outputs ─────────────────────────────────────────
  const ts     = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const prefix = `${source.name.toLowerCase().replace(/\s+/g, '-')}-${source.chain}`;

  if (!fs.existsSync(options.outDir)) fs.mkdirSync(options.outDir, { recursive: true });

  // JSON
  fs.writeFileSync(`${options.outDir}/${prefix}-${ts}.json`, JSON.stringify(report, null, 2));

  // CSV — per earning
  const csvLines = [
    `# WHALE RECONCILIATION ENGINE v${VERSION} — ${source.name} (${source.chain})`,
    `# ${COPYRIGHT}`,
    `# Generated: ${report.generated_at}`,
    `# SHA-256: ${sha256Hash}`,
    '#',
    `agent_id,display_name,earning_id,created_at,amount_${verifier.unit},tx_status,payout_txid,block_height,block_time`,
  ];
  for (const r of report.agents) {
    for (const e of r.earnings_detail) {
      csvLines.push([
        e.agent_id, e.display_name, e.earning_id, e.created_at,
        e.amount, e.tx_status, e.payout_txid ?? 'null',
        e.block_height ?? '', e.block_time ?? ''
      ].join(','));
    }
  }
  fs.writeFileSync(`${options.outDir}/${prefix}-detail-${ts}.csv`, csvLines.join('\n'));

  // Summary CSV
  const sumLines = [
    `# WHALE RECONCILIATION ENGINE — SUMMARY (${source.name})`,
    `# ${COPYRIGHT}`,
    `# Generated: ${report.generated_at}`,
    `# SHA-256: ${sha256Hash}`,
    '#',
    `agent_id,display_name,total_earnings,confirmed_${verifier.unit},pending_${verifier.unit},unpaid_${verifier.unit},total_outstanding`,
  ];
  for (const r of report.agents.filter(r => r.unpaid + r.pending > 0)) {
    sumLines.push([
      r.agent_id, r.display_name, r.total_earnings,
      r.confirmed, r.pending, r.unpaid,
      r.pending + r.unpaid
    ].join(','));
  }
  fs.writeFileSync(`${options.outDir}/${prefix}-summary-${ts}.csv`, sumLines.join('\n'));

  log(`\n${'═'.repeat(60)}`);
  log(` RECONCILIATION COMPLETE — ${source.name}`);
  log(`${'═'.repeat(60)}`);
  log(` Agents scanned    : ${results.length}`);
  log(` Total earnings    : ${totalEarnings}`);
  log(` Total owed        : ${totalOwed.toLocaleString()} ${verifier.unit}`);
  log(` ✅ Confirmed       : ${confirmedTotal.toLocaleString()} (${pct(confirmedTotal)})`);
  log(` ⏳ Pending         : ${pendingTotal.toLocaleString()} (${pct(pendingTotal)})`);
  log(` ❌ Unpaid          : ${unpaidTotal.toLocaleString()} (${pct(unpaidTotal)})`);
  log(`─────────────────────────────────────────────────────────`);
  log(` SHA-256 : ${sha256Hash}`);
  log(`${'═'.repeat(60)}\n`);

  return report;
}
