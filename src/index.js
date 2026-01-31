import Fastify from 'fastify';
import { runScan, validateTarget } from './scanner.js';

const fastify = Fastify({ logger: true });

// Store active scans
const activeScans = new Map();
const completedScans = new Map();

// Health check
fastify.get('/', async () => {
  return {
    service: 'secops-bot',
    version: '1.0.0',
    status: 'operational',
    description: 'Automated security scanning by SecurityforTech',
    pricing: {
      basic_scan: '$1',
      deep_scan: '$5'
    },
    endpoints: {
      'POST /scan': 'Start a new scan',
      'GET /scan/:id': 'Get scan status/results',
      'GET /health': 'Health check'
    }
  };
});

// Health check
fastify.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Start a scan
fastify.post('/scan', async (request, reply) => {
  const { target } = request.body || {};
  
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
  
  // TODO: Add x402 payment verification here
  // For now, we run the scan directly
  
  // Start scan asynchronously
  const scanPromise = runScan(target);
  
  // For quick targets, wait a bit to see if it completes fast
  const result = await Promise.race([
    scanPromise,
    new Promise(resolve => setTimeout(() => resolve(null), 5000))
  ]);
  
  if (result) {
    // Scan completed quickly
    if (result.success) {
      completedScans.set(result.scanId, result);
    }
    return result;
  }
  
  // Scan is still running, return pending status
  // Store the promise for later retrieval
  const scanId = `pending-${Date.now()}`;
  activeScans.set(scanId, scanPromise);
  
  scanPromise.then(res => {
    activeScans.delete(scanId);
    if (res.success) {
      completedScans.set(res.scanId, res);
    }
  });
  
  return {
    success: true,
    status: 'scanning',
    message: 'Scan started. This may take a few minutes.',
    checkStatus: `/scan/${scanId}`
  };
});

// Get scan status/results
fastify.get('/scan/:id', async (request, reply) => {
  const { id } = request.params;
  
  // Check completed scans
  if (completedScans.has(id)) {
    return completedScans.get(id);
  }
  
  // Check active scans
  if (activeScans.has(id)) {
    return {
      success: true,
      status: 'scanning',
      message: 'Scan in progress...'
    };
  }
  
  return reply.status(404).send({
    success: false,
    error: 'Scan not found'
  });
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3001;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`🔒 secops-bot running on http://${host}:${port}`);
    console.log('Endpoints:');
    console.log('  GET  /        - Service info');
    console.log('  GET  /health  - Health check');
    console.log('  POST /scan    - Start a scan');
    console.log('  GET  /scan/:id - Get scan results');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
