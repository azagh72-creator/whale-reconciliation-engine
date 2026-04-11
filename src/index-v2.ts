/**
 * ============================================================
 * WHALE RECONCILIATION ENGINE v2.0.0 — MAIN ENTRY
 * ============================================================
 * Copyright © 2026 Flying Whale (zaghmout.btc | ERC-8004 #54)
 * BTC: bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p
 * STX: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW
 *
 * ALL RIGHTS RESERVED — PROPRIETARY SOFTWARE
 * License: View-Only Output License v1.0
 * On-chain IP: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW.whale-ip-store-v1
 *
 * UNIVERSAL AGENT PAYMENT AUDIT PROTOCOL
 * Supported: Stacks · Solana · Bitcoin
 * ============================================================
 */

import { reconcileNetwork } from './core/engine.js';
import { aibtcNewsSource, stacksVerifier } from './networks/aibtc.js';
import { solanaVerifier } from './networks/solana-demo.js';

const OUTPUT_DIR = 'output';

// ── CLI args ─────────────────────────────────────────────────
const args    = process.argv.slice(2);
const network = args[0] ?? 'aibtc';    // aibtc | solana | all
const verbose = !args.includes('--quiet');

async function main() {
  if (network === 'aibtc' || network === 'all') {
    await reconcileNetwork(aibtcNewsSource, stacksVerifier, {
      outDir:  OUTPUT_DIR,
      verbose,
    });
  }

  if (network === 'solana') {
    console.log('\n⚠️  Solana network adapter requires a live Solana agent network API.');
    console.log('    Configure src/networks/solana-demo.ts with your network details.');
    console.log('    The Solana chain verifier (verifySolanaTx) is fully operational.\n');
  }

  if (network === 'all') {
    console.log('\n✅ All configured networks reconciled.');
  }
}

main().catch(console.error);
