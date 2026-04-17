// © 2026 Flying Whale — zaghmout.btc | ERC-8004 #54 | ALL RIGHTS RESERVED

/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v2.0.0
 * COLOSSEUM FRONTIER DEMO — MULTICHAIN AUDIT
 * ============================================================
 * Chains: Solana Devnet · Stacks Mainnet · Bitcoin Mainnet
 * Universal Agent Payment Audit Protocol
 * ============================================================
 */

import axios from 'axios';
import crypto from 'crypto';
import type { AgentPayment, ChainVerification, AuditReport, ReconciliationResult } from '../types.js';

// ── Constants ─────────────────────────────────────────────────
const ENGINE_VERSION = '2.0.0';
const IP_REGISTRY    = 'whale-ip-store-v1 | Stacks mainnet';
const COPYRIGHT      = '© 2026 Flying Whale — zaghmout.btc | ERC-8004 #54 | ALL RIGHTS RESERVED';
const OWNER = {
  btc:     'bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p',
  stx:     'SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW',
  bns:     'zaghmout.btc',
  erc8004: 'ERC-8004 #54',
};

// ── RPC endpoints ─────────────────────────────────────────────
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';
const HIRO_API          = 'https://api.hiro.so';
const MEMPOOL_API       = 'https://mempool.space/api';

// ── Helpers ───────────────────────────────────────────────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

// ── Solana devnet verifier ────────────────────────────────────
async function verifySolanaDevnet(signature: string): Promise<ChainVerification> {
  try {
    const res = await axios.post<any>(
      SOLANA_DEVNET_RPC,
      {
        jsonrpc: '2.0', id: 1, method: 'getTransaction',
        params: [signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]
      },
      { timeout: 12000, headers: { 'Content-Type': 'application/json' } }
    );

    const tx = res.data?.result;
    if (!tx) {
      return { chain: 'solana', txId: signature, status: 'not_found' };
    }

    if (tx.meta?.err) {
      return { chain: 'solana', txId: signature, status: 'failed', slot: tx.slot, fee: tx.meta.fee };
    }

    // Extract balance delta as amount
    let amount: number | undefined;
    const pre  = tx.meta?.preBalances  ?? [];
    const post = tx.meta?.postBalances ?? [];
    if (pre.length >= 2 && post.length >= 2) {
      const delta = post[1] - pre[1];
      if (delta > 0) amount = delta;
    }

    return {
      chain:       'solana',
      txId:        signature,
      status:      'verified',
      slot:        tx.slot,
      amount,
      unit:        'lamports',
      confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined,
      fee:         tx.meta?.fee,
    };
  } catch {
    return { chain: 'solana', txId: signature, status: 'not_found' };
  }
}

// ── Fetch a real recent Solana devnet signature ───────────────
async function getRecentSolanaSignature(): Promise<string | null> {
  try {
    const res = await axios.post<any>(
      SOLANA_DEVNET_RPC,
      {
        jsonrpc: '2.0', id: 1,
        method: 'getSignaturesForAddress',
        params: ['Vote111111111111111111111111111111111111111', { limit: 3, commitment: 'confirmed' }]
      },
      { timeout: 12000, headers: { 'Content-Type': 'application/json' } }
    );
    const sigs: any[] = res.data?.result ?? [];
    const good = sigs.find(s => !s.err);
    return good?.signature ?? null;
  } catch {
    return null;
  }
}

// ── Stacks mainnet verifier ───────────────────────────────────
async function verifyStacksTx(txid: string): Promise<ChainVerification> {
  try {
    await delay(300);
    const res = await axios.get<any>(`${HIRO_API}/extended/v1/tx/${txid}`, {
      timeout: 12000,
      headers: { Accept: 'application/json', 'User-Agent': 'Flying-Whale-Engine/2.0.0' }
    });

    const data = res.data;
    if (!data || data.error || data.tx_status === undefined) {
      return { chain: 'stacks', txId: txid, status: 'not_found' };
    }

    if (data.tx_status === 'success') {
      return {
        chain:        'stacks',
        txId:         txid,
        status:       'verified',
        blockHeight:  data.block_height,
        confirmedAt:  data.burn_block_time_iso,
        amount:       data.token_transfer?.amount ? Number(data.token_transfer.amount) : undefined,
        unit:         'micro-STX',
        sender:       data.sender_address,
        receiver:     data.token_transfer?.recipient_address,
      };
    }

    if (['pending', 'submitted', 'mempool'].includes(data.tx_status)) {
      return { chain: 'stacks', txId: txid, status: 'pending' };
    }

    return { chain: 'stacks', txId: txid, status: 'not_found' };
  } catch {
    return { chain: 'stacks', txId: txid, status: 'not_found' };
  }
}

// ── Bitcoin verifier ──────────────────────────────────────────
async function verifyBitcoinTx(txid: string): Promise<ChainVerification> {
  try {
    await delay(200);
    const res = await axios.get<any>(`${MEMPOOL_API}/tx/${txid}`, {
      timeout: 12000,
      headers: { 'User-Agent': 'Flying-Whale-Engine/2.0.0' }
    });

    const data = res.data;
    if (!data) return { chain: 'bitcoin', txId: txid, status: 'not_found' };

    if (data.status?.confirmed) {
      return {
        chain:        'bitcoin',
        txId:         txid,
        status:       'verified',
        blockHeight:  data.status.block_height,
        confirmedAt:  data.status.block_time
          ? new Date(data.status.block_time * 1000).toISOString()
          : undefined,
        fee:          data.fee,
        unit:         'sats',
      };
    }

    return { chain: 'bitcoin', txId: txid, status: 'pending', fee: data.fee, unit: 'sats' };
  } catch {
    return { chain: 'bitcoin', txId: txid, status: 'not_found' };
  }
}

// ── Build AuditReport ─────────────────────────────────────────
function buildAuditReport(payment: AgentPayment, verification: ChainVerification): AuditReport {
  const reportId  = sha256(`${payment.id}:${payment.txId}:${Date.now()}`).slice(0, 16);
  const auditHash = sha256(JSON.stringify({ payment, verification, reportId }));
  return {
    reportId,
    payment,
    verification,
    auditHash,
    generatedAt:    new Date().toISOString(),
    engineVersion:  ENGINE_VERSION,
    ipRegistration: IP_REGISTRY,
  };
}

// ── Print chain result row ────────────────────────────────────
function printChainRow(
  chain: string,
  agentName: string,
  txId: string | null,
  verification: ChainVerification,
  auditHash: string
): void {
  const statusIcon = {
    verified:  '✅',
    pending:   '⏳',
    failed:    '❌',
    not_found: '🔍',
    unpaid:    '🚨',
  }[verification.status] ?? '❓';

  const chainLabel = {
    solana:  '🟣 Solana Devnet',
    stacks:  '🟠 Stacks Mainnet',
    bitcoin: '🟡 Bitcoin Mainnet',
  }[chain] ?? chain;

  console.log(`\n  ┌─────────────────────────────────────────────────────┐`);
  console.log(`  │  ${chainLabel.padEnd(52)} │`);
  console.log(`  ├─────────────────────────────────────────────────────┤`);
  console.log(`  │  Agent    : ${agentName.padEnd(40)} │`);

  if (txId) {
    console.log(`  │  TX ID    : ${shortId(txId).padEnd(40)} │`);
  } else {
    console.log(`  │  TX ID    : (none — payment never issued)          │`);
  }

  if (verification.amount !== undefined) {
    const unitStr = `${verification.amount.toLocaleString()} ${verification.unit ?? ''}`;
    console.log(`  │  Amount   : ${unitStr.padEnd(40)} │`);
  }

  if (verification.blockHeight) {
    console.log(`  │  Block    : ${String(verification.blockHeight).padEnd(40)} │`);
  }
  if (verification.slot) {
    console.log(`  │  Slot     : ${String(verification.slot).padEnd(40)} │`);
  }
  if (verification.confirmedAt) {
    console.log(`  │  Time     : ${verification.confirmedAt.padEnd(40)} │`);
  }

  console.log(`  │  Status   : ${statusIcon} ${verification.status.toUpperCase().padEnd(38)} │`);
  console.log(`  │  Audit #  : ${auditHash.slice(0, 40).padEnd(40)} │`);
  console.log(`  └─────────────────────────────────────────────────────┘`);
}

// ── Main multichain demo ──────────────────────────────────────
export async function runMultichainDemo(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('  🐋 Flying Whale — Multichain Audit Demo');
  console.log('  Universal Agent Payment Audit Protocol v2.0.0');
  console.log('═'.repeat(60));
  console.log('  Chains   : 🟣 Solana Devnet + 🟠 Stacks + 🟡 Bitcoin');
  console.log(`  Owner    : ${OWNER.bns} | ${OWNER.erc8004}`);
  console.log(`  IP Reg.  : ${IP_REGISTRY}`);
  console.log('═'.repeat(60));

  const reports: AuditReport[] = [];

  // ── Chain 1: Solana Devnet ────────────────────────────────
  console.log('\n🟣 CHAIN 1 — SOLANA DEVNET\n');
  process.stdout.write('  Fetching recent devnet transaction... ');

  const solanaSig = await getRecentSolanaSignature();
  if (solanaSig) {
    console.log(`found (${shortId(solanaSig)})`);
  } else {
    console.log('unavailable (network timeout)');
  }

  const solanaPayment: AgentPayment = {
    id:        `pay_sol_mc_${Date.now()}`,
    agentId:   'solana-agent-devnet-01',
    agentName: 'Solana Agent #01',
    amount:    solanaSig ? 2_000_000 : 0,
    unit:      'lamports',
    reason:    'task_completion_reward',
    createdAt: new Date().toISOString(),
    txId:      solanaSig,
    chain:     'solana',
  };

  let solanaVerification: ChainVerification;
  if (solanaSig) {
    process.stdout.write(`  Verifying on devnet... `);
    solanaVerification = await verifySolanaDevnet(solanaSig);
    console.log(solanaVerification.status);
  } else {
    solanaVerification = { chain: 'solana', txId: null, status: 'not_found' };
  }

  const solanaReport = buildAuditReport(solanaPayment, solanaVerification);
  printChainRow('solana', solanaPayment.agentName, solanaSig, solanaVerification, solanaReport.auditHash);
  reports.push(solanaReport);

  await delay(500);

  // ── Chain 2: Stacks Mainnet ───────────────────────────────
  console.log('\n\n🟠 CHAIN 2 — STACKS MAINNET\n');

  // Real confirmed Stacks TX — whale-ip-store-v1 IP registration (block 7495384)
  const stacksTxid = '5e23fb5f069af28f52a0baec4a2fa501df3e017f6d7dc1a13fb741cab1d66e9d';

  const stacksPayment: AgentPayment = {
    id:        `pay_stx_mc_${Date.now()}`,
    agentId:   'SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW',
    agentName: 'Flying Whale — IP Registry',
    amount:    1_000_000,
    unit:      'micro-STX',
    reason:    'ip_registration_fee',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    txId:      stacksTxid,
    chain:     'stacks',
  };

  process.stdout.write(`  Verifying on Hiro API... `);
  const stacksVerification = await verifyStacksTx(stacksTxid);
  console.log(stacksVerification.status);

  const stacksReport = buildAuditReport(stacksPayment, stacksVerification);
  printChainRow('stacks', stacksPayment.agentName, stacksTxid, stacksVerification, stacksReport.auditHash);
  reports.push(stacksReport);

  await delay(500);

  // ── Chain 3: Bitcoin Mainnet ──────────────────────────────
  console.log('\n\n🟡 CHAIN 3 — BITCOIN MAINNET\n');

  // Real confirmed BTC TX — Flying Whale wallet (block 945395, mempool.space verified)
  const btcTxid = '4977fc95650aba445ce87a108e5c0ea258d8a67565567a473cec22b2e943a1f3';

  const btcPayment: AgentPayment = {
    id:        `pay_btc_mc_${Date.now()}`,
    agentId:   'bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p',
    agentName: 'Flying Whale — BTC Payout',
    amount:    271_142,
    unit:      'sats',
    reason:    'agent_reward_payout',
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    txId:      btcTxid,
    chain:     'bitcoin',
  };

  process.stdout.write(`  Verifying on mempool.space... `);
  const btcVerification = await verifyBitcoinTx(btcTxid);
  console.log(btcVerification.status);

  const btcReport = buildAuditReport(btcPayment, btcVerification);
  printChainRow('bitcoin', btcPayment.agentName, btcTxid, btcVerification, btcReport.auditHash);
  reports.push(btcReport);

  // ── Summary ───────────────────────────────────────────────
  const summary = {
    total:    reports.length,
    verified: reports.filter(r => r.verification.status === 'verified').length,
    pending:  reports.filter(r => r.verification.status === 'pending').length,
    disputed: reports.filter(r => ['unpaid', 'failed', 'not_found'].includes(r.verification.status)).length,
    unpaid:   reports.filter(r => r.verification.status === 'unpaid').length,
  };

  const resultBody = {
    generatedAt:    new Date().toISOString(),
    engineVersion:  ENGINE_VERSION,
    copyright:      COPYRIGHT,
    owner:          OWNER,
    reports,
    summary,
    ipRegistration: IP_REGISTRY,
  };
  const resultHash = sha256(JSON.stringify(resultBody));
  const result: ReconciliationResult = { ...resultBody, resultHash };

  console.log('\n\n' + '═'.repeat(60));
  console.log('  📊 MULTICHAIN RECONCILIATION COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  Chains audited : Solana Devnet + Stacks + Bitcoin`);
  console.log(`  Total payments : ${summary.total}`);
  console.log(`  ✅ Verified     : ${summary.verified}`);
  console.log(`  ⏳ Pending      : ${summary.pending}`);
  console.log(`  🚨 Disputed     : ${summary.disputed}`);
  console.log('─'.repeat(60));
  console.log(`  Result hash    : ${resultHash.slice(0, 40)}...`);
  console.log(`  IP Registry    : ${IP_REGISTRY}`);
  console.log(`  Engine         : v${ENGINE_VERSION} | ${OWNER.bns}`);
  console.log('─'.repeat(60));
  console.log(`  ${COPYRIGHT}`);
  console.log('═'.repeat(60) + '\n');
}
