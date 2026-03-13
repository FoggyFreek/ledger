/**
 * Tests for swap transaction interpretation logic.
 *
 * Covers:
 *  - isSolMint: must recognise native SOL (So...111) AND WSOL (So...112)
 *  - interpretTransaction: both SOL mints must be unified under the 'SOL' key
 *  - parseWalletHistoryTx: wallet-only filtering, Seeker staking detection
 */

import { describe, it, expect } from 'vitest';
import {
  isSolMint,
  interpretTransaction,
  parseWalletHistoryTx,
} from '../../src/lib/taxCategorizer';
import type { BalanceChange } from '../../src/types/transaction';
import type { HeliusWalletHistoryTx } from '../../src/types/api';

// ─── Mint addresses ──────────────────────────────────────────────────────────

const NATIVE_SOL = 'So11111111111111111111111111111111111111111';
const WSOL       = 'So11111111111111111111111111111111111111112';
const USDC       = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SKR        = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
const SPEAR_COIN = 'FYMByk8qRbW6gouy9V52wzWTrW1RuWPFUh75m2n3pump';

// ─── Raw balance changes per test case ───────────────────────────────────────

/**
 * TC1: Swap SOL → USDC
 * Fee: 148904 lamports = 0.000148904 SOL
 */
const tc1: BalanceChange[] = [
  { mint: WSOL,        amount: -0.09998,     decimals: 0, userAccount: '2YDWuxWfRPoJtor69iiTWG5GaJ2QeSZ9G2APxaxvuKaC' },
  { mint: USDC,        amount:  8.612385,    decimals: 0 },
  { mint: WSOL,        amount: -0.00002,     decimals: 0, userAccount: '2YDWuxWfRPoJtor69iiTWG5GaJ2QeSZ9G2APxaxvuKaC' },
  { mint: NATIVE_SOL,  amount: -0.10203928,  decimals: 9 },
  { mint: NATIVE_SOL,  amount: -0.00203928,  decimals: 9 },
  { mint: NATIVE_SOL,  amount:  0.00203928,  decimals: 9 },
];
/**
 * TC2: Swap SKR → SOL
 */
const tc2: BalanceChange[] = [
  { mint: SKR,         amount: -100,          decimals: 0 },
  { mint: WSOL,        amount:  0.026630934,  decimals: 0, userAccount: '2YDWuxWfRPoJtor69iiTWG5GaJ2QeSZ9G2APxaxvuKaC' },
  { mint: NATIVE_SOL,  amount: -0.00203928,   decimals: 9 },
  { mint: NATIVE_SOL,  amount:  0.028670214,  decimals: 9 },
];
/**
 * TC3: Swap SOL → SKR (routed through USDC, which nets to zero)
 */
const tc3: BalanceChange[] = [
  { mint: WSOL,        amount: -0.0999,       decimals: 0, userAccount: '2YDWuxWfRPoJtor69iiTWG5GaJ2QeSZ9G2APxaxvuKaC' },
  { mint: USDC,        amount:  8.606219,     decimals: 0 },
  { mint: USDC,        amount: -8.606219,     decimals: 0 },
  { mint: SKR,         amount:  372.434772,   decimals: 0 },
  { mint: WSOL,        amount: -0.0001,       decimals: 0, userAccount: '2YDWuxWfRPoJtor69iiTWG5GaJ2QeSZ9G2APxaxvuKaC' },
  { mint: NATIVE_SOL,  amount: -0.00203928,   decimals: 9 },
  { mint: NATIVE_SOL,  amount: -0.1,          decimals: 9 },
  { mint: NATIVE_SOL,  amount: -0.00203928,   decimals: 9 },
  { mint: NATIVE_SOL,  amount:  0.00203928,   decimals: 9 },
];
/**
 * TC4: Swap SOL → Spear Coin (no WSOL entries)
 */
const tc4: BalanceChange[] = [
  { mint: SPEAR_COIN,  amount:  571413.365957, decimals: 0 },
  { mint: NATIVE_SOL,  amount: -0.004,         decimals: 9 },
  { mint: NATIVE_SOL,  amount: -0.000165864,   decimals: 9 },
  { mint: NATIVE_SOL,  amount: -0.055287953,   decimals: 9 },
  { mint: NATIVE_SOL,  amount: -0.000525236,   decimals: 9 },
];
// ─── isSolMint ───────────────────────────────────────────────────────────────

describe('isSolMint', () => {
  it('recognises native SOL address (So...111)', () => {
    expect(isSolMint(NATIVE_SOL)).toBe(true);
  });

  it('recognises WSOL address (So...112)', () => {
    expect(isSolMint(WSOL)).toBe(true);
  });

  it('recognises the plain string "SOL"', () => {
    expect(isSolMint('SOL')).toBe(true);
  });

  it('does not recognise USDC', () => {
    expect(isSolMint(USDC)).toBe(false);
  });

  it('does not recognise SKR', () => {
    expect(isSolMint(SKR)).toBe(false);
  });
});

// ─── interpretTransaction ────────────────────────────────────────────────────

describe('interpretTransaction — SOL/WSOL unification', () => {
  it('TC1: no raw SOL mint addresses remain in netChanges — both unified to "SOL"', () => {
    const { netChanges } = interpretTransaction(tc1);
    expect(netChanges.some(c => c.mint === NATIVE_SOL)).toBe(false);
    expect(netChanges.some(c => c.mint === WSOL)).toBe(false);
    expect(netChanges.some(c => c.mint === 'SOL')).toBe(true);
  });

  it('TC1: USDC appears in netChanges at +8.612385', () => {
    const { netChanges } = interpretTransaction(tc1);
    const usdc = netChanges.find(c => c.mint === USDC);
    expect(usdc).toBeDefined();
    expect(usdc!.amount).toBeCloseTo(8.612385, 6);
  });

  it('TC2: no raw SOL mint addresses remain in netChanges', () => {
    const { netChanges } = interpretTransaction(tc2);
    expect(netChanges.some(c => c.mint === NATIVE_SOL)).toBe(false);
    expect(netChanges.some(c => c.mint === WSOL)).toBe(false);
  });

  it('TC2: SKR appears in netChanges at -100', () => {
    const { netChanges } = interpretTransaction(tc2);
    const skr = netChanges.find(c => c.mint === SKR);
    expect(skr).toBeDefined();
    expect(skr!.amount).toBeCloseTo(-100, 6);
  });

  it('TC3: USDC nets to zero and is excluded from netChanges', () => {
    const { netChanges } = interpretTransaction(tc3);
    expect(netChanges.some(c => c.mint === USDC)).toBe(false);
  });

  it('TC3: SKR appears in netChanges at +372.434772', () => {
    const { netChanges } = interpretTransaction(tc3);
    const skr = netChanges.find(c => c.mint === SKR);
    expect(skr).toBeDefined();
    expect(skr!.amount).toBeCloseTo(372.434772, 6);
  });

  it('TC4: small SOL amounts become rent items; only the large entry stays in netChanges', () => {
    // -0.004, -0.000165864, -0.000525236 are all < 0.005 → moved to rentItems
    // -0.055287953 is > 0.005 → stays in netChanges
    const { netChanges, rentItems } = interpretTransaction(tc4);
    const sol = netChanges.find(c => c.mint === 'SOL');
    expect(sol).toBeDefined();
    expect(sol!.amount).toBeCloseTo(-0.055287953, 9);
    expect(rentItems).toHaveLength(3);
  });

  it('TC4: Spear Coin appears in netChanges at +571413.365957', () => {
    const { netChanges } = interpretTransaction(tc4);
    const spear = netChanges.find(c => c.mint === SPEAR_COIN);
    expect(spear).toBeDefined();
    expect(spear!.amount).toBeCloseTo(571413.365957, 6);
  });
});

// ─── parseWalletHistoryTx ──────────────────────────────────────────────────
//
// Tests that parseWalletHistoryTx only collects balance changes for the
// wallet's own accounts, not intermediary DEX/pool accounts.

const WALLET = '2YDWuxWfRPoJtor69iiTWG5GaJ2QeSZ9G2APxaxvuKaC';
const SEEKER_CONFIG = '4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw';

function makeTx(partial: Partial<HeliusWalletHistoryTx>): HeliusWalletHistoryTx {
  return {
    signature: 'test-sig',
    timestamp: 1700000000,
    slot: 100,
    fee: 5000,
    feePayer: WALLET,
    type: null,
    description: null,
    transactionError: null,
    nativeTransfers: [],
    tokenTransfers: [],
    accountData: [],
    ...partial,
  };
}

describe('parseWalletHistoryTx — wallet-only filtering', () => {
  it('Jupiter multi-hop swap: SKR→SOL categorized as TRADE, not TRANSFER_OUT', () => {
    // Real transaction: wallet swapped 100 SKR → 0.026630934 SOL via Jupiter
    // Route: SKR → USDC → USDT → wSOL → SOL (3 intermediate pools)
    // Without wallet filtering, all intermediary changes cancel out and
    // the tx looks like a tiny SOL loss (just the fee).
    const tx = makeTx({
      signature: '25jrC7YqhHvuWLgPgpcR9HuGskgL2Xnb48FA44qR3wHidEYEEntPkzWEbSxNUox5HE5akVCRh6k3MbxGyhH4uyuJ',
      fee: 58205,
      type: 'SWAP',
      source: 'JUPITER',
      tokenTransfers: [
        // Hop 1: wallet sends 100 SKR
        { fromUserAccount: WALLET, toUserAccount: '7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE', fromTokenAccount: '6b4h', toTokenAccount: '5uZ1', tokenAmount: 100, mint: SKR, tokenStandard: 'Fungible' },
        // Hop 1: pool gives USDC
        { fromUserAccount: 'Fhjz', toUserAccount: '7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE', fromTokenAccount: 'DVUB', toTokenAccount: 'Epda', tokenAmount: 2.296925, mint: USDC, tokenStandard: 'Fungible' },
        // ... intermediary hops omitted for brevity ...
        // Final: wallet receives wSOL (unwrapped to SOL)
        { fromUserAccount: '7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE', toUserAccount: WALLET, fromTokenAccount: '2oL6', toTokenAccount: '9hyb', tokenAmount: 0.026630934, mint: WSOL, tokenStandard: 'Fungible' },
      ],
      accountData: [
        // Wallet's native SOL: net +26,572,729 lamports (swap output - fee - rent)
        { account: WALLET, nativeBalanceChange: 26572729, tokenBalanceChanges: [] },
        // Wallet's SKR token account: -100 SKR
        { account: '6b4hTKFLv9HFZFFzbZQqF3Nvr3PuoAgw9qjyrfWLfifv', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: WALLET, tokenAccount: '6b4h', mint: SKR, rawTokenAmount: { tokenAmount: '-100000000', decimals: 6 } },
        ]},
        // Pool wSOL account (NOT wallet): -26,657,591 lamports + wSOL token change
        { account: '5gTazA5CPKrPZ1vSxXpbmLdmVZrvPYJ9CMnXUfNYoMJZ', nativeBalanceChange: -26657591, tokenBalanceChanges: [
          { userAccount: '4rJggoVMajEUtipev1XhSMjESYk8Zibz6CDHPtUe1mem', tokenAccount: '5gTaz', mint: WSOL, rawTokenAmount: { tokenAmount: '-26657591', decimals: 9 } },
        ]},
        // Intermediate wSOL account (NOT wallet)
        { account: '2oL6my4QDDCfpgJZX1bZV1NgbmuNptKdgcE8wJm6efgk', nativeBalanceChange: 26657, tokenBalanceChanges: [
          { userAccount: '7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE', tokenAccount: '2oL6', mint: WSOL, rawTokenAmount: { tokenAmount: '26657', decimals: 9 } },
        ]},
        // Pool USDC account (NOT wallet)
        { account: 'AioJRQXvcDLRhHMd6DAkTbbMpgVx63qSGQYmRBS2vHYA', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: '7imnGYfCovXjMWKdbQvETFVMe72MQDX4S5zW4GFxMJME', tokenAccount: 'AioJ', mint: USDC, rawTokenAmount: { tokenAmount: '2296925', decimals: 6 } },
        ]},
        // Pool USDC source (NOT wallet)
        { account: 'DVUBW86zKoEgXm6qJDCwMFMnYiXG6qvz7G1Tdvci7xut', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: 'Fhjzcf3JFH3zN6uKoNwwr9WhfdUnFoCY9KZKybx3CoR9', tokenAccount: 'DVUB', mint: USDC, rawTokenAmount: { tokenAmount: '-2296925', decimals: 6 } },
        ]},
        // Pool SKR destination (NOT wallet)
        { account: 'DrmUUH2qoB4wpurb44i4NyZpSmfjVRdUswDakUt9JNpM', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: 'Fhjzcf3JFH3zN6uKoNwwr9WhfdUnFoCY9KZKybx3CoR9', tokenAccount: 'Drm', mint: SKR, rawTokenAmount: { tokenAmount: '100000000', decimals: 6 } },
        ]},
      ],
    });

    const parsed = parseWalletHistoryTx(tx, WALLET);

    // Should be TRADE: wallet lost SKR, gained SOL
    expect(parsed.taxCategory).toBe('TRADE');

    // balanceChanges should only contain wallet-owned entries
    expect(parsed.balanceChanges).toHaveLength(2); // SOL + SKR

    const sol = parsed.balanceChanges.find(bc => bc.mint === 'SOL');
    expect(sol).toBeDefined();
    expect(sol!.amount).toBeCloseTo(0.026572729, 9);
    expect(sol!.userAccount).toBe(WALLET);

    const skr = parsed.balanceChanges.find(bc => bc.mint === SKR);
    expect(skr).toBeDefined();
    expect(skr!.amount).toBeCloseTo(-100, 6);
    expect(skr!.userAccount).toBe(WALLET);

    // No intermediary tokens should leak through
    const mints = new Set(parsed.balanceChanges.map(bc => bc.mint));
    expect(mints.has(USDC)).toBe(false);
    expect(mints.has(WSOL)).toBe(false);
  });

  it('simple SOL transfer in: only wallet native balance collected', () => {
    const sender = 'SenderAddress111111111111111111111111111111';
    const tx = makeTx({
      fee: 5000,
      feePayer: sender,
      nativeTransfers: [
        { fromUserAccount: sender, toUserAccount: WALLET, amount: 1_000_000_000 },
      ],
      accountData: [
        { account: WALLET, nativeBalanceChange: 1_000_000_000, tokenBalanceChanges: [] },
        { account: sender, nativeBalanceChange: -1_000_005_000, tokenBalanceChanges: [] },
      ],
    });

    const parsed = parseWalletHistoryTx(tx, WALLET);

    expect(parsed.taxCategory).toBe('TRANSFER_IN');
    expect(parsed.balanceChanges).toHaveLength(1);
    expect(parsed.balanceChanges[0].amount).toBeCloseTo(1.0, 9);
    expect(parsed.counterparty).toBe(sender);
  });

  it('simple token transfer out: only wallet token balance collected', () => {
    const recipient = 'RecipientAddr1111111111111111111111111111111';
    const tx = makeTx({
      fee: 5000,
      nativeTransfers: [],
      tokenTransfers: [
        { fromUserAccount: WALLET, toUserAccount: recipient, fromTokenAccount: 'walletATA', toTokenAccount: 'recipientATA', tokenAmount: 50, mint: USDC, tokenStandard: 'Fungible' },
      ],
      accountData: [
        // Wallet pays fee
        { account: WALLET, nativeBalanceChange: -5000, tokenBalanceChanges: [] },
        // Wallet's USDC token account
        { account: 'walletATA', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: WALLET, tokenAccount: 'walletATA', mint: USDC, rawTokenAmount: { tokenAmount: '-50000000', decimals: 6 } },
        ]},
        // Recipient's USDC token account (NOT wallet)
        { account: 'recipientATA', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: recipient, tokenAccount: 'recipientATA', mint: USDC, rawTokenAmount: { tokenAmount: '50000000', decimals: 6 } },
        ]},
      ],
    });

    const parsed = parseWalletHistoryTx(tx, WALLET);

    expect(parsed.taxCategory).toBe('TRANSFER_OUT');
    // Should have SOL (fee) + USDC (sent)
    expect(parsed.balanceChanges).toHaveLength(2);

    const usdc = parsed.balanceChanges.find(bc => bc.mint === USDC);
    expect(usdc).toBeDefined();
    expect(usdc!.amount).toBeCloseTo(-50, 6);

    // Recipient's +50 USDC should NOT appear
    const positiveUsdc = parsed.balanceChanges.filter(bc => bc.mint === USDC && bc.amount > 0);
    expect(positiveUsdc).toHaveLength(0);

    expect(parsed.counterparty).toBe(recipient);
  });

  it('Seeker staking: SKR transfer to config is STAKE_DELEGATE', () => {
    const tx = makeTx({
      tokenTransfers: [
        { fromUserAccount: WALLET, toUserAccount: SEEKER_CONFIG, fromTokenAccount: 'walletSKR', toTokenAccount: 'configSKR', tokenAmount: 500, mint: SKR, tokenStandard: 'Fungible' },
      ],
      accountData: [
        { account: WALLET, nativeBalanceChange: -5000, tokenBalanceChanges: [] },
        { account: 'walletSKR', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: WALLET, tokenAccount: 'walletSKR', mint: SKR, rawTokenAmount: { tokenAmount: '-500000000', decimals: 6 } },
        ]},
      ],
    });

    const parsed = parseWalletHistoryTx(tx, WALLET);
    expect(parsed.taxCategory).toBe('STAKE_DELEGATE');
  });

  it('Seeker unstaking: SKR transfer from config is STAKE_WITHDRAW', () => {
    const tx = makeTx({
      tokenTransfers: [
        { fromUserAccount: SEEKER_CONFIG, toUserAccount: WALLET, fromTokenAccount: 'configSKR', toTokenAccount: 'walletSKR', tokenAmount: 500, mint: SKR, tokenStandard: 'Fungible' },
      ],
      accountData: [
        { account: WALLET, nativeBalanceChange: -5000, tokenBalanceChanges: [] },
        { account: 'walletSKR', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: WALLET, tokenAccount: 'walletSKR', mint: SKR, rawTokenAmount: { tokenAmount: '500000000', decimals: 6 } },
        ]},
      ],
    });

    const parsed = parseWalletHistoryTx(tx, WALLET);
    expect(parsed.taxCategory).toBe('STAKE_WITHDRAW');
  });

  it('fee-only transaction (no balance changes for wallet except fee)', () => {
    const tx = makeTx({
      fee: 5000,
      accountData: [
        { account: WALLET, nativeBalanceChange: -5000, tokenBalanceChanges: [] },
      ],
    });

    const parsed = parseWalletHistoryTx(tx, WALLET);
    // Tiny SOL loss = TRANSFER_OUT (fee deducted)
    expect(parsed.balanceChanges).toHaveLength(1);
    expect(parsed.balanceChanges[0].mint).toBe('SOL');
    expect(parsed.balanceChanges[0].amount).toBeCloseTo(-0.000005, 9);
  });

  it('no walletAddress: falls back to collecting all accounts (legacy)', () => {
    const tx = makeTx({
      accountData: [
        { account: WALLET, nativeBalanceChange: 100000, tokenBalanceChanges: [] },
        { account: 'SomeOtherAccount', nativeBalanceChange: -100000, tokenBalanceChanges: [] },
      ],
    });

    const parsed = parseWalletHistoryTx(tx);
    // Both accounts' SOL changes collected (legacy behavior)
    expect(parsed.balanceChanges).toHaveLength(2);
  });

  it('token-to-token swap via Jupiter: only wallet-owned mints appear', () => {
    // Wallet swaps USDC → SKR, routed through SOL internally
    const tx = makeTx({
      type: 'SWAP',
      tokenTransfers: [
        { fromUserAccount: WALLET, toUserAccount: 'pool1', fromTokenAccount: 'walletUSDC', toTokenAccount: 'poolUSDC', tokenAmount: 10, mint: USDC, tokenStandard: 'Fungible' },
        { fromUserAccount: 'pool2', toUserAccount: WALLET, fromTokenAccount: 'poolSKR', toTokenAccount: 'walletSKR', tokenAmount: 430, mint: SKR, tokenStandard: 'Fungible' },
      ],
      accountData: [
        { account: WALLET, nativeBalanceChange: -5000, tokenBalanceChanges: [] },
        // Wallet's USDC ATA
        { account: 'walletUSDC', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: WALLET, tokenAccount: 'walletUSDC', mint: USDC, rawTokenAmount: { tokenAmount: '-10000000', decimals: 6 } },
        ]},
        // Wallet's SKR ATA
        { account: 'walletSKR', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: WALLET, tokenAccount: 'walletSKR', mint: SKR, rawTokenAmount: { tokenAmount: '430000000', decimals: 6 } },
        ]},
        // Pool's USDC (NOT wallet)
        { account: 'poolUSDC', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: 'pool1', tokenAccount: 'poolUSDC', mint: USDC, rawTokenAmount: { tokenAmount: '10000000', decimals: 6 } },
        ]},
        // Pool's SKR (NOT wallet)
        { account: 'poolSKR', nativeBalanceChange: 0, tokenBalanceChanges: [
          { userAccount: 'pool2', tokenAccount: 'poolSKR', mint: SKR, rawTokenAmount: { tokenAmount: '-430000000', decimals: 6 } },
        ]},
        // Intermediate wSOL routing (NOT wallet)
        { account: 'poolWSol', nativeBalanceChange: -500000, tokenBalanceChanges: [
          { userAccount: 'pool3', tokenAccount: 'poolWSol', mint: WSOL, rawTokenAmount: { tokenAmount: '-500000', decimals: 9 } },
        ]},
      ],
    });

    const parsed = parseWalletHistoryTx(tx, WALLET);

    expect(parsed.taxCategory).toBe('TRADE');
    // Only wallet's changes: SOL (fee), USDC (out), SKR (in)
    expect(parsed.balanceChanges).toHaveLength(3);

    const mints = new Set(parsed.balanceChanges.map(bc => bc.mint));
    expect(mints).toEqual(new Set(['SOL', USDC, SKR]));

    // No pool wSOL should leak through
    expect(mints.has(WSOL)).toBe(false);

    // Verify amounts
    const usdc = parsed.balanceChanges.find(bc => bc.mint === USDC);
    expect(usdc!.amount).toBeCloseTo(-10, 6);
    const skrBc = parsed.balanceChanges.find(bc => bc.mint === SKR);
    expect(skrBc!.amount).toBeCloseTo(430, 6);
  });
});
