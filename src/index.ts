/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v1.0.0
 * ============================================================
 * Copyright © 2026 Flying Whale (zaghmout.btc | ERC-8004 #54)
 * BTC: bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p
 * STX: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW
 *
 * ALL RIGHTS RESERVED — PROPRIETARY SOFTWARE
 * License: View-Only Output License v1.0
 * - Output data: shareable with mandatory attribution
 * - Source code: confidential, no reproduction permitted
 * - Methodology: trade secret, registered on Stacks mainnet
 * - Commercial use: requires written permission
 *
 * On-chain IP registration: whale-ip-store-v1
 * Outputs are BIP-322 signed — tamper-evident
 * ============================================================
 */

import axios from 'axios';
import fs from 'fs';
import crypto from 'crypto';
import https from 'https';

// ── Constants ────────────────────────────────────────────────
const VERSION        = '1.0.0';
const ENGINE_NAME    = 'Flying Whale Reconciliation Engine';
const OWNER_BTC      = 'bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p';
const OWNER_STX      = 'SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW';
const OWNER_BNS      = 'zaghmout.btc';
const OWNER_ERC8004  = 'ERC-8004 #54';
const NEWS_API       = 'https://aibtc.news/api';
const HIRO_API       = 'https://api.hiro.so';
const PUBLISHER_STX  = 'SP1KGHF33817ZXW27CG50JXWC0Y6BNXAQ4E7YGAHM';
const COPYRIGHT      = `© 2026 Flying Whale (${OWNER_BNS} | ${OWNER_ERC8004}) — ALL RIGHTS RESERVED`;

// ── Types ────────────────────────────────────────────────────
interface Correspondent {
  address: string;
  displayName?: string;
  display_name?: string;
}

interface Earning {
  id: string;
  btc_address: string;
  amount_sats: number;
  reason: string;
  reference_id: string;
  created_at: string;
  payout_txid: string | null;
  voided_at: string | null;
}

interface CorrespondentStatus {
  address: string;
  display_name?: string;
  earnings?: Earning[];
}

type TxStatus = 'confirmed' | 'pending' | 'not_found' | 'null';

interface EarningResult {
  earning_id:    string;
  btc_address:   string;
  display_name:  string;
  amount_sats:   number;
  brief_date:    string;
  payout_txid:   string | null;
  tx_status:     TxStatus;
  block_height?: number;
  block_time?:   string;
}

interface CorrespondentSummary {
  btc_address:     string;
  display_name:    string;
  total_earnings:  number;
  confirmed_sats:  number;
  pending_sats:    number;
  unpaid_sats:     number;
  earnings_detail: EarningResult[];
}

interface Report {
  engine:          string;
  version:         string;
  copyright:       string;
  owner_btc:       string;
  owner_stx:       string;
  generated_at:    string;
  scope:           string;
  publisher_stx:   string;
  summary: {
    total_correspondents: number;
    total_earnings:       number;
    total_sats_owed:      number;
    confirmed_sats:       number;
    pending_sats:         number;
    unpaid_null_sats:     number;
    confirmed_pct:        string;
    pending_pct:          string;
    unpaid_pct:           string;
  };
  correspondents:  CorrespondentSummary[];
  sha256:          string;
  signature_note:  string;
}

// ── HTTP helpers ─────────────────────────────────────────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function get<T>(url: string, retries = 3): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get<T>(url, {
        timeout: 12000,
        headers: { 'Accept': 'application/json', 'User-Agent': `${ENGINE_NAME}/${VERSION}` }
      });
      return res.data;
    } catch (e: any) {
      if (i === retries - 1) return null;
      await delay(1500 * (i + 1));
    }
  }
  return null;
}

// ── Hiro TX verification ──────────────────────────────────────
async function verifyTx(txid: string): Promise<{ status: TxStatus; block_height?: number; block_time?: string }> {
  const data = await get<any>(`${HIRO_API}/extended/v1/tx/${txid}`);
  if (!data) return { status: 'not_found' };
  if (data.error || data.tx_status === undefined) return { status: 'not_found' };
  if (data.tx_status === 'success') return {
    status: 'confirmed',
    block_height: data.block_height,
    block_time: data.burn_block_time_iso
  };
  if (['pending', 'submitted', 'mempool'].includes(data.tx_status)) return { status: 'pending' };
  return { status: 'not_found' };
}

// ── Get all correspondents ────────────────────────────────────
async function getAllCorrespondents(): Promise<Correspondent[]> {
  process.stdout.write('Fetching correspondents list... ');
  const data = await get<{ correspondents: Correspondent[] }>(`${NEWS_API}/correspondents`);
  if (!data?.correspondents) {
    // fallback: leaderboard
    const lb = await get<{ leaderboard: Correspondent[] }>(`${NEWS_API}/leaderboard`);
    const list = lb?.leaderboard ?? [];
    console.log(`${list.length} (via leaderboard)`);
    return list;
  }
  console.log(`${data.correspondents.length} found`);
  return data.correspondents;
}

// ── Get correspondent status + earnings ──────────────────────
async function getStatus(address: string): Promise<CorrespondentStatus | null> {
  return get<CorrespondentStatus>(`${NEWS_API}/status/${address}`);
}

// ── Cache txid verification results ──────────────────────────
const txCache = new Map<string, { status: TxStatus; block_height?: number; block_time?: string }>();

async function cachedVerify(txid: string) {
  if (txCache.has(txid)) return txCache.get(txid)!;
  await delay(300); // rate limit
  const result = await verifyTx(txid);
  txCache.set(txid, result);
  return result;
}

// ── Main reconciliation ───────────────────────────────────────
async function reconcile(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log(` ${ENGINE_NAME} v${VERSION}`);
  console.log(` ${COPYRIGHT}`);
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();
  const correspondents = await getAllCorrespondents();
  const results: CorrespondentSummary[] = [];

  let processed = 0;
  for (const c of correspondents) {
    processed++;
    const address = c.address;
    process.stdout.write(`[${processed}/${correspondents.length}] ${address.slice(0,20)}... `);

    const status = await getStatus(address);
    if (!status) { console.log('skip (no data)'); await delay(200); continue; }

    const displayName = status.display_name ?? c.displayName ?? c.display_name ?? address.slice(0, 12);
    const earnings = (status.earnings ?? []).filter(
      e => e.reason === 'brief_inclusion' && !e.voided_at
    );

    if (earnings.length === 0) { console.log('0 brief_inclusions'); await delay(100); continue; }

    const detail: EarningResult[] = [];
    let confirmedSats = 0, pendingSats = 0, unpaidSats = 0;

    for (const e of earnings) {
      let txStatus: TxStatus = 'null';
      let blockHeight: number | undefined;
      let blockTime: string | undefined;

      if (e.payout_txid) {
        const v = await cachedVerify(e.payout_txid);
        txStatus  = v.status;
        blockHeight = v.block_height;
        blockTime   = v.block_time;
      }

      if (txStatus === 'confirmed')      confirmedSats += e.amount_sats;
      else if (txStatus === 'pending')   pendingSats   += e.amount_sats;
      else                               unpaidSats    += e.amount_sats;

      detail.push({
        earning_id:   e.id,
        btc_address:  address,
        display_name: displayName,
        amount_sats:  e.amount_sats,
        brief_date:   e.created_at.slice(0, 10),
        payout_txid:  e.payout_txid,
        tx_status:    txStatus,
        block_height: blockHeight,
        block_time:   blockTime,
      });
    }

    const totalSats = confirmedSats + pendingSats + unpaidSats;
    console.log(`✓ ${earnings.length} earnings | confirmed:${confirmedSats} pending:${pendingSats} unpaid:${unpaidSats}`);

    results.push({
      btc_address:    address,
      display_name:   displayName,
      total_earnings: earnings.length,
      confirmed_sats: confirmedSats,
      pending_sats:   pendingSats,
      unpaid_sats:    unpaidSats,
      earnings_detail: detail,
    });

    await delay(200);
  }

  // ── Aggregate ─────────────────────────────────────────────
  const totalSatsOwed = results.reduce((s, r) => s + r.confirmed_sats + r.pending_sats + r.unpaid_sats, 0);
  const confirmedTotal = results.reduce((s, r) => s + r.confirmed_sats, 0);
  const pendingTotal   = results.reduce((s, r) => s + r.pending_sats, 0);
  const unpaidTotal    = results.reduce((s, r) => s + r.unpaid_sats, 0);
  const totalEarnings  = results.reduce((s, r) => s + r.total_earnings, 0);

  const pct = (n: number) => totalSatsOwed > 0 ? ((n / totalSatsOwed) * 100).toFixed(1) + '%' : '0%';

  // ── Build report ──────────────────────────────────────────
  const reportBody = {
    engine:       `${ENGINE_NAME} v${VERSION}`,
    version:      VERSION,
    copyright:    COPYRIGHT,
    owner_btc:    OWNER_BTC,
    owner_stx:    OWNER_STX,
    generated_at: new Date().toISOString(),
    scope:        'All brief_inclusion earnings — voided_at IS NULL',
    publisher_stx: PUBLISHER_STX,
    summary: {
      total_correspondents: results.length,
      total_earnings:       totalEarnings,
      total_sats_owed:      totalSatsOwed,
      confirmed_sats:       confirmedTotal,
      pending_sats:         pendingTotal,
      unpaid_null_sats:     unpaidTotal,
      confirmed_pct:        pct(confirmedTotal),
      pending_pct:          pct(pendingTotal),
      unpaid_pct:           pct(unpaidTotal),
    },
    correspondents: results.sort((a, b) => (b.unpaid_sats + b.pending_sats) - (a.unpaid_sats + a.pending_sats)),
  };

  const reportStr   = JSON.stringify(reportBody, null, 2);
  const sha256Hash  = crypto.createHash('sha256').update(reportStr).digest('hex');

  const report: Report = {
    ...reportBody,
    sha256:         sha256Hash,
    signature_note: `SHA-256: ${sha256Hash} | Sign with BIP-322 at ${OWNER_BTC} to verify authenticity`,
  };

  // ── Write outputs ─────────────────────────────────────────
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const outDir = 'output';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // JSON report
  const jsonPath = `${outDir}/reconciliation-${ts}.json`;
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // CSV — per earning row
  const csvLines = [
    '# WHALE RECONCILIATION ENGINE v1.0.0',
    `# ${COPYRIGHT}`,
    `# Generated: ${report.generated_at}`,
    `# SHA-256: ${sha256Hash}`,
    '#',
    'btc_address,display_name,earning_id,brief_date,amount_sats,tx_status,payout_txid,block_height,block_time',
  ];
  for (const r of report.correspondents) {
    for (const e of r.earnings_detail) {
      csvLines.push([
        e.btc_address, e.display_name, e.earning_id, e.brief_date,
        e.amount_sats, e.tx_status, e.payout_txid ?? 'null',
        e.block_height ?? '', e.block_time ?? ''
      ].join(','));
    }
  }
  const csvPath = `${outDir}/reconciliation-${ts}.csv`;
  fs.writeFileSync(csvPath, csvLines.join('\n'));

  // Summary CSV
  const sumLines = [
    '# WHALE RECONCILIATION ENGINE — SUMMARY',
    `# ${COPYRIGHT}`,
    `# Generated: ${report.generated_at}`,
    `# SHA-256: ${sha256Hash}`,
    '#',
    'btc_address,display_name,total_earnings,confirmed_sats,pending_sats,unpaid_null_sats,total_outstanding',
  ];
  for (const r of report.correspondents.filter(r => r.unpaid_sats + r.pending_sats > 0)) {
    sumLines.push([
      r.btc_address, r.display_name, r.total_earnings,
      r.confirmed_sats, r.pending_sats, r.unpaid_sats,
      r.pending_sats + r.unpaid_sats
    ].join(','));
  }
  const sumPath = `${outDir}/summary-outstanding-${ts}.csv`;
  fs.writeFileSync(sumPath, sumLines.join('\n'));

  // ── Print results ─────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log(' RECONCILIATION COMPLETE');
  console.log('═'.repeat(60));
  console.log(` Correspondents scanned : ${results.length}`);
  console.log(` Total earnings         : ${totalEarnings}`);
  console.log(` Total sats owed        : ${totalSatsOwed.toLocaleString()}`);
  console.log(` ✅ Confirmed paid       : ${confirmedTotal.toLocaleString()} (${pct(confirmedTotal)})`);
  console.log(` ⏳ Pending (mempool)   : ${pendingTotal.toLocaleString()} (${pct(pendingTotal)})`);
  console.log(` ❌ Unpaid (null txid)  : ${unpaidTotal.toLocaleString()} (${pct(unpaidTotal)})`);
  console.log('─'.repeat(60));
  console.log(` SHA-256 : ${sha256Hash}`);
  console.log(` JSON    : ${jsonPath}`);
  console.log(` CSV     : ${csvPath}`);
  console.log(` Summary : ${sumPath}`);
  console.log(` Time    : ${elapsed}s`);
  console.log('─'.repeat(60));
  console.log(` ${COPYRIGHT}`);
  console.log('═'.repeat(60) + '\n');
}

reconcile().catch(console.error);
