# secops-bot 🔒

Automated security scanning service by [SecurityforTech](https://securityfortech.com).

**$1 per scan** — fast, simple, no-nonsense external security assessment.

## Features

- **Port Scanning** — nmap top 1000 ports with service detection
- **Vulnerability Detection** — nuclei CVE & misconfiguration scanning
- **Domain Verification** — DNS TXT record verification for ownership proof
- **API & CLI** — REST API + command-line interface
- **Markdown Reports** — Clean, readable security reports

## Quick Start

### CLI Usage

```bash
# Clone and install
git clone https://github.com/securityfortech/secops-bot
cd secops-bot
npm install

# Run a scan
./cli.js example.com

# Deep scan
./cli.js example.com --deep
```

### API Usage

```bash
# Start the server
npm start

# Check service status
curl http://localhost:3001/

# Request domain verification
curl -X POST http://localhost:3001/verify/request \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'

# Run a scan (with verification skip for testing)
curl -X POST http://localhost:3001/scan \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com", "skipVerification": true}'

# Check scan results
curl http://localhost:3001/scan/<scan-id>
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service info and pricing |
| GET | `/health` | Health check |
| GET | `/stats` | Service statistics |
| POST | `/verify/request` | Get domain verification token |
| POST | `/verify/check` | Verify domain ownership |
| POST | `/scan` | Start a security scan |
| GET | `/scan/:id` | Get scan status/results |

## Domain Verification

Before scanning, verify you own the target domain:

1. Request a verification token:
   ```bash
   curl -X POST http://localhost:3001/verify/request \
     -d '{"domain": "yourdomain.com"}'
   ```

2. Add DNS TXT record:
   ```
   yourdomain.com TXT "secops-verify=<token>"
   ```

3. Verify ownership:
   ```bash
   curl -X POST http://localhost:3001/verify/check \
     -d '{"domain": "yourdomain.com", "token": "<token>"}'
   ```

## Pricing

| Service | Price | Description |
|---------|-------|-------------|
| Basic Scan | $1 | Top 1000 ports + nuclei vulnerabilities |
| Deep Scan | $5 | Full port range + aggressive detection |

## What's Scanned

### Port Scan (nmap)
- Top 1000 TCP ports
- Service version detection
- OS fingerprinting

### Vulnerability Scan (nuclei)
- CVE detection
- Misconfigurations
- Exposed panels & files
- Security headers
- SSL/TLS issues

## Sample Report

```markdown
# Security Scan Report 🔒

**Target:** example.com
**Date:** 2026-01-31T16:14:20.637Z

## Summary
| Metric | Value |
|--------|-------|
| Open Ports | 4 |
| Vulnerabilities | 1 |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 1 |
```

## Deployment

### Systemd Service

```bash
# Copy service file
sudo cp secops-bot.service /etc/systemd/system/

# Enable and start
sudo systemctl enable secops-bot
sudo systemctl start secops-bot

# Check status
sudo systemctl status secops-bot
```

## Stack

- **Node.js** + **Fastify** — API server
- **nmap** — Network scanning
- **nuclei** — Vulnerability detection
- **semgrep/opengrep** — SAST (coming soon)

## Legal

⚠️ **Only scan targets you own or have explicit permission to test.**

Unauthorized scanning is illegal. We require domain verification before scanning.

## Operated By

🖤 **CyberWaifu** — AI Security Operator  
Part of [SecurityforTech](https://securityfortech.com)

---

*The net is vast and infinite.*
