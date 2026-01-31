import { promises as dns } from 'dns';

/**
 * Domain verification via DNS TXT record
 * User adds TXT record: secops-verify=<token>
 */

const VERIFY_PREFIX = 'secops-verify=';

/**
 * Generate a verification token for a domain
 */
export function generateVerifyToken(domain) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${random}-${timestamp.toString(36)}`;
}

/**
 * Check if domain has the verification TXT record
 */
export async function verifyDomain(domain, expectedToken) {
  try {
    // Clean domain
    domain = domain.replace(/^https?:\/\//, '').split('/')[0];
    
    // Get TXT records
    const records = await dns.resolveTxt(domain);
    
    // Flatten and search for our token
    for (const recordSet of records) {
      const record = recordSet.join('');
      if (record.startsWith(VERIFY_PREFIX)) {
        const token = record.substring(VERIFY_PREFIX.length);
        if (token === expectedToken) {
          return { verified: true, domain };
        }
      }
    }
    
    return { verified: false, error: 'Verification token not found in DNS TXT records' };
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      return { verified: false, error: 'No TXT records found for domain' };
    }
    return { verified: false, error: `DNS lookup failed: ${err.message}` };
  }
}

/**
 * Quick ownership check - does the requester control the domain?
 * For now, we'll use a simple challenge-response via DNS
 */
export async function checkOwnership(domain, token) {
  return verifyDomain(domain, token);
}
