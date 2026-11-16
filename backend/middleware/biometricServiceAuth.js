const crypto = require('node:crypto');
// The signed envelope includes the destination, method, complete path and exact body.
function canonical(method, path, timestamp, body) {
  return ['starlit-attendance-v1', method, path, timestamp, body].join('\n');
}
function biometricServiceAuth(req, res, next) {
  const secret = process.env.BIOMETRIC_SERVICE_SECRET;
  const timestamp = req.get('x-service-timestamp') || '';
  const signature = req.get('x-service-signature') || '';
  if (process.env.BIOMETRIC_INTEGRATION_ENABLED !== 'true' || !secret || secret.length < 32)
    return res.status(503).json({ success: false, message: 'Biometric integration is not configured.' });
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 60_000 || !/^[a-f0-9]{64}$/.test(signature))
    return res.status(401).json({ success: false, message: 'Invalid service authentication.' });
  const expected = crypto.createHmac('sha256', secret).update(canonical(req.method, req.originalUrl, timestamp, req.rawBody || '')).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    return res.status(401).json({ success: false, message: 'Invalid service authentication.' });
  next();
}
module.exports = { biometricServiceAuth, canonical };
