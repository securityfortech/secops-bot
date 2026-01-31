import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const DATA_DIR = './data';
const SCANS_FILE = join(DATA_DIR, 'scans.json');
const VERIFIED_FILE = join(DATA_DIR, 'verified.json');
const PAYMENTS_FILE = join(DATA_DIR, 'payments.json');

/**
 * Simple JSON file store
 */
class Store {
  constructor(file) {
    this.file = file;
    this.data = null;
  }

  async load() {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      const content = await readFile(this.file, 'utf-8');
      this.data = JSON.parse(content);
    } catch (err) {
      this.data = {};
    }
    return this.data;
  }

  async save() {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(this.file, JSON.stringify(this.data, null, 2));
  }

  async get(key) {
    if (!this.data) await this.load();
    return this.data[key];
  }

  async set(key, value) {
    if (!this.data) await this.load();
    this.data[key] = value;
    await this.save();
  }

  async delete(key) {
    if (!this.data) await this.load();
    delete this.data[key];
    await this.save();
  }

  async all() {
    if (!this.data) await this.load();
    return this.data;
  }
}

// Singleton stores
export const scansStore = new Store(SCANS_FILE);
export const verifiedStore = new Store(VERIFIED_FILE);
export const paymentsStore = new Store(PAYMENTS_FILE);

/**
 * Record a scan
 */
export async function recordScan(scanId, data) {
  await scansStore.set(scanId, {
    ...data,
    createdAt: new Date().toISOString()
  });
}

/**
 * Get scan by ID
 */
export async function getScan(scanId) {
  return scansStore.get(scanId);
}

/**
 * Record domain verification
 */
export async function recordVerification(domain, token) {
  await verifiedStore.set(domain, {
    token,
    verifiedAt: new Date().toISOString()
  });
}

/**
 * Check if domain is verified
 */
export async function isVerified(domain) {
  const record = await verifiedStore.get(domain);
  return !!record;
}

/**
 * Record a payment
 */
export async function recordPayment(paymentId, data) {
  await paymentsStore.set(paymentId, {
    ...data,
    createdAt: new Date().toISOString()
  });
}

/**
 * Get payment by ID
 */
export async function getPayment(paymentId) {
  return paymentsStore.get(paymentId);
}
