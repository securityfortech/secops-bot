#!/usr/bin/env node

/**
 * secops-bot CLI
 * Usage: ./cli.js <target> [--deep]
 */

import { runScan, validateTarget } from './src/scanner.js';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
secops-bot CLI 🔒
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:
  ./cli.js <target> [options]

Options:
  --deep    Run deep scan (full port range)
  --help    Show this help

Examples:
  ./cli.js example.com
  ./cli.js 192.168.1.1 --deep

⚠️  Only scan targets you own or have permission to test.
`);
  process.exit(0);
}

const target = args.find(a => !a.startsWith('--'));
const isDeep = args.includes('--deep');

if (!target) {
  console.error('Error: No target specified');
  process.exit(1);
}

// Validate
const validation = validateTarget(target);
if (!validation.valid) {
  console.error(`Error: ${validation.error}`);
  process.exit(1);
}

console.log(`
🔒 secops-bot scan
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: ${validation.target}
Type: ${isDeep ? 'Deep' : 'Basic'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

try {
  const result = await runScan(validation.target);
  
  if (result.success) {
    console.log(result.report);
    console.log(`\n📁 Full report saved to: ${result.reportPath}`);
  } else {
    console.error(`Scan failed: ${result.error}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
