import { spawn } from 'child_process';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const REPORTS_DIR = './reports';

/**
 * Run a command and capture output
 */
function runCommand(cmd, args, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout });
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Validate target - basic checks
 */
export function validateTarget(target) {
  // Remove protocol if present
  target = target.replace(/^https?:\/\//, '').split('/')[0];
  
  // Basic validation
  if (!target || target.length < 3) {
    return { valid: false, error: 'Target too short' };
  }
  
  // No internal IPs
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost)/i.test(target)) {
    return { valid: false, error: 'Internal targets not allowed' };
  }
  
  // Basic domain/IP pattern
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
  const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  
  if (!domainPattern.test(target) && !ipPattern.test(target)) {
    return { valid: false, error: 'Invalid target format' };
  }
  
  return { valid: true, target };
}

/**
 * Run port scan with nmap
 */
async function runPortScan(target, outputDir) {
  console.log(`[nmap] Scanning ${target}...`);
  
  const nmapFile = join(outputDir, 'nmap.txt');
  const result = await runCommand('nmap', [
    '-sV',
    '--top-ports', '1000',
    '-T4',
    '--open',
    '-oN', nmapFile,
    target
  ], 180000); // 3 min timeout
  
  let output = '';
  try {
    output = await readFile(nmapFile, 'utf-8');
  } catch (e) {
    output = result.stdout || 'Scan failed';
  }
  
  return {
    success: result.code === 0,
    output,
    openPorts: (output.match(/\d+\/tcp\s+open/g) || []).length
  };
}

/**
 * Run vulnerability scan with nuclei
 */
async function runNucleiScan(target, outputDir) {
  console.log(`[nuclei] Scanning ${target}...`);
  
  const nucleiFile = join(outputDir, 'nuclei.txt');
  const result = await runCommand('nuclei', [
    '-u', target,
    '-severity', 'low,medium,high,critical',
    '-silent',
    '-o', nucleiFile
  ], 300000); // 5 min timeout
  
  let output = '';
  try {
    output = await readFile(nucleiFile, 'utf-8');
  } catch (e) {
    output = '';
  }
  
  const findings = output.trim().split('\n').filter(l => l.length > 0);
  
  return {
    success: result.code === 0,
    output,
    findingsCount: findings.length,
    findings
  };
}

/**
 * Generate markdown report
 */
function generateReport(target, scanId, portScan, nucleiScan) {
  const timestamp = new Date().toISOString();
  
  let severitySummary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  nucleiScan.findings.forEach(f => {
    if (f.includes('[critical]')) severitySummary.critical++;
    else if (f.includes('[high]')) severitySummary.high++;
    else if (f.includes('[medium]')) severitySummary.medium++;
    else if (f.includes('[low]')) severitySummary.low++;
    else severitySummary.info++;
  });
  
  return `# Security Scan Report 🔒

**Scan ID:** \`${scanId}\`  
**Target:** \`${target}\`  
**Date:** ${timestamp}  
**Scanner:** secops-bot by SecurityforTech

---

## Summary

| Metric | Value |
|--------|-------|
| Open Ports | ${portScan.openPorts} |
| Vulnerabilities | ${nucleiScan.findingsCount} |
| Critical | ${severitySummary.critical} |
| High | ${severitySummary.high} |
| Medium | ${severitySummary.medium} |
| Low | ${severitySummary.low} |

---

## Port Scan Results

\`\`\`
${portScan.output.slice(0, 3000) || 'No open ports found'}
\`\`\`

---

## Vulnerability Findings

${nucleiScan.findingsCount > 0 ? nucleiScan.findings.map(f => `- \`${f}\``).join('\n') : '_No vulnerabilities detected_'}

---

## Recommendations

${severitySummary.critical > 0 ? '⚠️ **CRITICAL findings require immediate attention!**\n' : ''}
${severitySummary.high > 0 ? '🔴 Review and remediate HIGH severity issues promptly.\n' : ''}
${nucleiScan.findingsCount === 0 && portScan.openPorts < 5 ? '✅ Target appears to have a minimal attack surface. Good work!' : ''}

---

*Scanned by CyberWaifu 🖤*  
*[SecurityforTech](https://securityfortech.com)*
`;
}

/**
 * Main scan function
 */
export async function runScan(target) {
  const validation = validateTarget(target);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  target = validation.target;
  const scanId = uuidv4();
  const outputDir = join(REPORTS_DIR, scanId);
  
  await mkdir(outputDir, { recursive: true });
  
  console.log(`[secops-bot] Starting scan ${scanId} for ${target}`);
  
  // Run scans in parallel
  const [portScan, nucleiScan] = await Promise.all([
    runPortScan(target, outputDir).catch(e => ({ success: false, output: e.message, openPorts: 0 })),
    runNucleiScan(target, outputDir).catch(e => ({ success: false, output: e.message, findingsCount: 0, findings: [] }))
  ]);
  
  // Generate report
  const report = generateReport(target, scanId, portScan, nucleiScan);
  const reportPath = join(outputDir, 'REPORT.md');
  await writeFile(reportPath, report);
  
  console.log(`[secops-bot] Scan ${scanId} complete`);
  
  return {
    success: true,
    scanId,
    target,
    summary: {
      openPorts: portScan.openPorts,
      vulnerabilities: nucleiScan.findingsCount
    },
    report,
    reportPath
  };
}
