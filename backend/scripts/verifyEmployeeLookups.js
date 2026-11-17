const crypto = require('node:crypto');

async function verifyLookups({ baseUrl, secret, adminKey, secureverify = false }) {
  const base = new URL(baseUrl);
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password ||
      (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))))
    throw new Error('Use an HTTPS origin or localhost HTTP, without credentials or an API path.');
  if (secureverify ? !adminKey || adminKey.length < 32 : !secret || secret.length < 32)
    throw new Error('Required service authentication is not configured.');
  const names = ['Abinesh', 'Kumar', 'Arun', 'Suresh', 'Prakash', 'Vignesh', 'Manoj'];
  const results = [];
  for (let n = 1; n <= 10; n++) {
    const employeeId = `EMP${String(n).padStart(3, '0')}`;
    const path = secureverify ? `/api/employees/${employeeId}/lookup` : `/api/attendance/employees/${employeeId}`;
    const timestamp = String(Date.now());
    const headers = secureverify ? { 'x-admin-key': adminKey } : {
      'x-service-timestamp': timestamp,
      'x-service-signature': crypto.createHmac('sha256', secret).update(['starlit-attendance-v1', 'GET', path, timestamp, ''].join('\n')).digest('hex'),
    };
    try {
      const response = await fetch(new URL(path, base), { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      const employee = secureverify ? body : body.data;
      const ok = response.ok && (secureverify ? body.ok : body.success) && employee?.employeeId === employeeId &&
        typeof employee.name === 'string' && !!employee.name.trim() && (n > 7 || employee.name === names[n - 1]);
      results.push({ employeeId, status: response.status, ok: Boolean(ok),
        ...(response.ok && employee ? { name: employee.name, workerId: employee.workerId } : {}),
        ...(n <= 7 ? { expectedName: names[n - 1] } : {}) });
    } catch (error) {
      // Do not print URLs, headers, shared secrets or server exception messages.
      results.push({ employeeId, ok: false, error: error.name });
    }
  }
  return results;
}

async function main() {
  require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
  const args = process.argv.slice(2);
  const secureverify = args.includes('--secureverify');
  const rest = args.filter(arg => arg !== '--secureverify');
  if (rest.length !== 2 || rest[0] !== '--base-url') throw new Error('Usage: node scripts/verifyEmployeeLookups.js --base-url <origin> [--secureverify]');
  const results = await verifyLookups({ baseUrl: rest[1], secureverify, secret: process.env.BIOMETRIC_SERVICE_SECRET, adminKey: process.env.ADMIN_ENROLL_KEY });
  console.log(JSON.stringify({ mode: secureverify ? 'secureverify' : 'starlit', readOnly: true, results }, null, 2));
  if (results.some(row => !row.ok)) process.exitCode = 1;
}
module.exports = { verifyLookups };
if (require.main === module) main().catch(() => { console.error('Lookup verification failed. Check arguments and configured service authentication; no records changed.'); process.exitCode = 1; });
