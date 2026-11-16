// Creates configuration only; never connects to a database or overwrites existing files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const bio = path.resolve(root, '../biometric');
const targets = ['backend', 'frontend'].flatMap(folder => [path.join(root, folder, '.env'), path.join(bio, folder, '.env')]);
if (targets.some(file => fs.existsSync(file))) {
  console.error('Configuration was not changed: an .env already exists. Review existing configuration and use .env.example manually.');
  process.exitCode = 1;
} else {
  const serviceSecret = crypto.randomBytes(32).toString('hex');
  const jwt = crypto.randomBytes(32).toString('hex');
  const enroll = crypto.randomBytes(32).toString('hex');
  const password = crypto.randomBytes(18).toString('base64url');
  for (const file of targets) {
    let value = fs.readFileSync(file + '.example', 'utf8')
      .replaceAll('replace-with-the-same-random-service-secret-in-both-apps', serviceSecret)
      .replaceAll('replace-with-a-long-random-login-secret', jwt)
      .replaceAll('replace-with-a-long-random-secret', enroll)
      .replaceAll('127.0.0.1:27017', '127.0.0.1:27018')
      .replaceAll('replicaSet=rs0', 'replicaSet=starlit-local');
    if (file === path.join(root, 'backend', '.env')) value += `\nLOCAL_ADMIN_PASSWORD=${password}\n`;
    fs.writeFileSync(file, value, { flag: 'wx' });
  }
  console.log('Created four local .env files with random secrets and a dedicated localhost:27018 replica set.');
  console.log('Local login: superadmin. Password: LOCAL_ADMIN_PASSWORD in Starlit backend/.env.');
  console.log('Enrollment key: ADMIN_ENROLL_KEY in SecureVerify backend/.env. Secrets were not printed.');
}
