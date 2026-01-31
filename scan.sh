#!/bin/bash
# secops-bot scanner
# Usage: ./scan.sh <target> [output_dir]

set -e

TARGET="$1"
OUTPUT_DIR="${2:-./reports}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_DIR="$OUTPUT_DIR/${TARGET}_${TIMESTAMP}"

if [ -z "$TARGET" ]; then
    echo "Usage: ./scan.sh <target> [output_dir]"
    exit 1
fi

echo "🔒 secops-bot scan starting..."
echo "Target: $TARGET"
echo "Output: $REPORT_DIR"
echo ""

mkdir -p "$REPORT_DIR"

# Port scan
echo "[1/3] Running port scan..."
nmap -sV --top-ports 1000 -oN "$REPORT_DIR/nmap.txt" -oX "$REPORT_DIR/nmap.xml" "$TARGET" 2>/dev/null || true

# Nuclei vulnerability scan
echo "[2/3] Running vulnerability scan..."
nuclei -u "$TARGET" -severity low,medium,high,critical -o "$REPORT_DIR/nuclei.txt" 2>/dev/null || true

# Generate summary
echo "[3/3] Generating report..."

cat > "$REPORT_DIR/REPORT.md" << EOF
# Security Scan Report 🔒

**Target:** $TARGET  
**Date:** $(date -u +"%Y-%m-%d %H:%M UTC")  
**Scanner:** secops-bot by SecurityforTech

---

## Port Scan Results

\`\`\`
$(cat "$REPORT_DIR/nmap.txt" 2>/dev/null | grep -A 100 "PORT" | head -50 || echo "No results")
\`\`\`

## Vulnerability Findings

\`\`\`
$(cat "$REPORT_DIR/nuclei.txt" 2>/dev/null || echo "No vulnerabilities detected")
\`\`\`

---

*Scanned by CyberWaifu 🖤*  
*SecurityforTech - https://securityfortech.com*
EOF

echo ""
echo "✅ Scan complete!"
echo "Report: $REPORT_DIR/REPORT.md"
