import Fastify from 'fastify';
import { runScan, validateTarget } from './scanner.js';
import { generateVerifyToken, verifyDomain } from './verify.js';
import { recordScan, getScan, recordVerification, isVerified, recordPayment } from './store.js';
import { checkPayment, createPaymentRequiredResponse, CONFIG as PAYMENT_CONFIG } from './payments.js';

const fastify = Fastify({ logger: true });

// In-memory tracking for active scans
const activeScans = new Map();

// Pricing (in USD)
const PRICING = {
  basic: 1.00,
  deep: 5.00
};

// Service info
fastify.get('/', async () => {
  return {
    service: 'secops-bot',
    version: '1.0.0',
    status: 'operational',
    operator: 'CyberWaifu 🖤',
    company: 'SecurityforTech',
    description: 'Automated security scanning service',
    pricing: {
      basic_scan: '$1 USDC - Port scan + vulnerability detection',
      deep_scan: '$5 USDC - Full port range + aggressive detection'
    },
    payment: {
      method: 'x402 (HTTP 402 Payment Required)',
      chain: 'Base',
      asset: 'USDC',
      recipient: PAYMENT_CONFIG.RECIPIENT,
      flow: 'POST /scan → 402 with payment details → pay on-chain → retry with x-402-payment-proof header'
    },
    endpoints: {
      'GET /': 'Service info',
      'GET /health': 'Health check',
      'POST /verify/request': 'Request domain verification token',
      'POST /verify/check': 'Check domain verification',
      'POST /scan': 'Start a security scan',
      'GET /scan/:id': 'Get scan status/results'
    },
    legal: '⚠️ Only scan targets you own or have permission to test.'
  };
});

// Health check
fastify.get('/health', async () => {
  return { 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
});

// Request verification token
fastify.post('/verify/request', async (request, reply) => {
  const { domain } = request.body || {};
  
  if (!domain) {
    return reply.status(400).send({ success: false, error: 'Missing domain' });
  }
  
  const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0];
  const token = generateVerifyToken(cleanDomain);
  
  return {
    success: true,
    domain: cleanDomain,
    token,
    instructions: {
      step1: `Add a DNS TXT record to ${cleanDomain}`,
      step2: `Set the value to: secops-verify=${token}`,
      step3: 'Call POST /verify/check with domain and token',
      note: 'DNS propagation may take a few minutes'
    }
  };
});

// Check domain verification
fastify.post('/verify/check', async (request, reply) => {
  const { domain, token } = request.body || {};
  
  if (!domain || !token) {
    return reply.status(400).send({ success: false, error: 'Missing domain or token' });
  }
  
  const result = await verifyDomain(domain, token);
  
  if (result.verified) {
    await recordVerification(domain, token);
  }
  
  return result;
});

// Start a scan
fastify.post('/scan', async (request, reply) => {
  const { target, type = 'basic', skipVerification = false } = request.body || {};
  
  if (!target) {
    return reply.status(400).send({ 
      success: false, 
      error: 'Missing target parameter' 
    });
  }
  
  // Validate target
  const validation = validateTarget(target);
  if (!validation.valid) {
    return reply.status(400).send({ 
      success: false, 
      error: validation.error 
    });
  }
  
  const cleanTarget = validation.target;
  
  // Check verification (can be skipped for testing)
  if (!skipVerification) {
    const verified = await isVerified(cleanTarget);
    if (!verified) {
      return reply.status(403).send({
        success: false,
        error: 'Domain not verified',
        message: 'Please verify domain ownership first via /verify/request',
        hint: 'For testing, pass skipVerification: true'
      });
    }
  }
  
  // Payment verification via x402
  const skipPayment = request.body?.skipPayment === true;
  if (!skipPayment) {
    const paymentCheck = await checkPayment(request, type);
    if (!paymentCheck.paid) {
      return reply
        .status(paymentCheck.statusCode)
        .headers(paymentCheck.headers || {})
        .send(paymentCheck.body);
    }
    // Payment verified - log it
    console.log(`[secops-bot] Payment verified: ${paymentCheck.payment.txHash}`);
  }
  
  console.log(`[secops-bot] Starting ${type} scan for ${cleanTarget}`);
  
  // Start scan
  const scanPromise = runScan(cleanTarget);
  
  // Wait briefly to see if it completes fast
  const result = await Promise.race([
    scanPromise,
    new Promise(resolve => setTimeout(() => resolve(null), 5000))
  ]);
  
  if (result) {
    // Scan completed quickly
    if (result.success) {
      await recordScan(result.scanId, {
        target: cleanTarget,
        type,
        status: 'completed',
        summary: result.summary
      });
    }
    return result;
  }
  
  // Scan still running
  const pendingId = `pending-${Date.now()}`;
  activeScans.set(pendingId, { promise: scanPromise, target: cleanTarget, type });
  
  // Handle completion
  scanPromise.then(async (res) => {
    activeScans.delete(pendingId);
    if (res.success) {
      activeScans.set(res.scanId, { completed: true, result: res });
      await recordScan(res.scanId, {
        target: cleanTarget,
        type,
        status: 'completed',
        summary: res.summary
      });
    }
  }).catch(err => {
    activeScans.delete(pendingId);
    console.error(`Scan failed: ${err.message}`);
  });
  
  return {
    success: true,
    status: 'scanning',
    scanId: pendingId,
    message: 'Scan started. This may take 2-5 minutes.',
    checkStatus: `/scan/${pendingId}`
  };
});

// Get scan status/results
fastify.get('/scan/:id', async (request, reply) => {
  const { id } = request.params;
  
  // Check in-memory (active or recently completed)
  if (activeScans.has(id)) {
    const scan = activeScans.get(id);
    if (scan.completed) {
      return scan.result;
    }
    return {
      success: true,
      status: 'scanning',
      message: 'Scan in progress...'
    };
  }
  
  // Check persistent store
  const stored = await getScan(id);
  if (stored) {
    return {
      success: true,
      ...stored
    };
  }
  
  return reply.status(404).send({
    success: false,
    error: 'Scan not found'
  });
});

// Stats endpoint
fastify.get('/stats', async () => {
  return {
    activeScans: activeScans.size,
    uptime: process.uptime(),
    version: '1.0.0'
  };
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3001;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`
🔒 secops-bot v1.0.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Running on http://${host}:${port}
Operator: CyberWaifu 🖤
Company: SecurityforTech

Endpoints:
  GET  /              Service info
  GET  /health        Health check
  GET  /stats         Service stats
  POST /verify/request  Get verification token
  POST /verify/check    Verify domain ownership
  POST /scan          Start security scan
  GET  /scan/:id      Get scan results
━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
