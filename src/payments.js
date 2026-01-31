/**
 * x402 Payment Verification for secops-bot
 * 
 * HTTP 402 Payment Required flow:
 * 1. Client requests scan
 * 2. Server returns 402 with payment details
 * 3. Client pays on-chain (USDC on Base)
 * 4. Client retries with x-402-payment-proof header
 * 5. Server verifies tx and provides service
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import crypto from 'crypto';

// Configuration
const CONFIG = {
  // Payment recipient address (SecurityforTech)
  RECIPIENT: process.env.PAYMENT_ADDRESS || '0x78B4B569075b2F0451ec3C66dC4E46dc7dC28675',
  
  // USDC on Base
  USDC_ADDRESS: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  
  // Pricing in USDC (6 decimals)
  PRICES: {
    basic: 1_000_000n,  // $1
    deep: 5_000_000n,   // $5
  },
  
  // Payment validity window (1 hour)
  VALIDITY_SECONDS: 3600,
};

// ERC20 ABI for Transfer event
const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// Base client
const client = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Generate a payment challenge
 */
export function createPaymentChallenge(target, scanType = 'basic') {
  const challengeId = crypto.randomBytes(16).toString('hex');
  const amount = CONFIG.PRICES[scanType] || CONFIG.PRICES.basic;
  const expiresAt = Math.floor(Date.now() / 1000) + CONFIG.VALIDITY_SECONDS;
  
  return {
    challengeId,
    payment: {
      chain: 'base',
      chainId: 8453,
      recipient: CONFIG.RECIPIENT,
      asset: 'USDC',
      assetAddress: CONFIG.USDC_ADDRESS,
      amount: amount.toString(),
      amountFormatted: `$${Number(amount) / 1_000_000}`,
      expiresAt,
    },
    target,
    scanType,
    instructions: `Send ${Number(amount) / 1_000_000} USDC to ${CONFIG.RECIPIENT} on Base network. Include tx hash in x-402-payment-proof header.`,
  };
}

/**
 * Create 402 Payment Required response
 */
export function createPaymentRequiredResponse(target, scanType = 'basic') {
  const challenge = createPaymentChallenge(target, scanType);
  
  return {
    statusCode: 402,
    body: {
      error: 'Payment Required',
      code: 'PAYMENT_REQUIRED',
      ...challenge,
    },
    headers: {
      'X-402-Challenge': challenge.challengeId,
      'X-402-Amount': challenge.payment.amountFormatted,
      'X-402-Recipient': challenge.payment.recipient,
      'X-402-Chain': challenge.payment.chain,
    },
  };
}

/**
 * Verify a payment proof (transaction hash)
 */
export async function verifyPayment(txHash, expectedAmount, maxAgeSeconds = CONFIG.VALIDITY_SECONDS) {
  try {
    // Get transaction receipt
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    
    if (!receipt || receipt.status !== 'success') {
      return { valid: false, error: 'Transaction failed or not found' };
    }
    
    // Get block timestamp
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const txTime = Number(block.timestamp);
    const now = Math.floor(Date.now() / 1000);
    
    // Check age
    if (now - txTime > maxAgeSeconds) {
      return { valid: false, error: 'Payment too old' };
    }
    
    // Look for USDC transfer to our address
    const transferLogs = receipt.logs.filter(
      log => log.address.toLowerCase() === CONFIG.USDC_ADDRESS.toLowerCase()
    );
    
    for (const log of transferLogs) {
      try {
        // Decode transfer event
        const topics = log.topics;
        if (topics.length >= 3) {
          const to = '0x' + topics[2].slice(26);
          const value = BigInt(log.data);
          
          if (to.toLowerCase() === CONFIG.RECIPIENT.toLowerCase() && value >= expectedAmount) {
            return {
              valid: true,
              txHash,
              from: '0x' + topics[1].slice(26),
              to,
              amount: value.toString(),
              blockNumber: receipt.blockNumber,
              timestamp: txTime,
            };
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    return { valid: false, error: 'No valid USDC transfer found to recipient' };
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error.message}` };
  }
}

/**
 * Middleware to check payment for scan requests
 */
export async function checkPayment(request, scanType = 'basic') {
  const paymentProof = request.headers['x-402-payment-proof'];
  
  if (!paymentProof) {
    return { paid: false, ...createPaymentRequiredResponse(request.body?.target, scanType) };
  }
  
  // Verify the transaction
  const expectedAmount = CONFIG.PRICES[scanType] || CONFIG.PRICES.basic;
  const verification = await verifyPayment(paymentProof, expectedAmount);
  
  if (!verification.valid) {
    return {
      paid: false,
      statusCode: 402,
      body: {
        error: 'Payment verification failed',
        reason: verification.error,
        providedTxHash: paymentProof,
      },
    };
  }
  
  return {
    paid: true,
    payment: verification,
  };
}

/**
 * Record a completed payment
 */
export function recordPayment(scanId, paymentData) {
  // In production, store this in a database
  console.log(`[payment] Recorded payment for scan ${scanId}:`, paymentData);
  return true;
}

export default {
  createPaymentChallenge,
  createPaymentRequiredResponse,
  verifyPayment,
  checkPayment,
  recordPayment,
  CONFIG,
};
