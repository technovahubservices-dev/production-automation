// Dedicated persistent development replica set. Never reads project .env settings.
const path = require('node:path');
const fs = require('node:fs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
async function main() {
  const data = path.resolve(__dirname, '../.local-mongo');
  fs.mkdirSync(data, { recursive: true });
  const replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.17', downloadDir: path.resolve(__dirname, '../../.test-mongodb') },
    replSet: { count: 1, name: 'starlit-local', storageEngine: 'wiredTiger', ip: '127.0.0.1' },
    instanceOpts: [{ port: 27018, dbPath: data, ip: '127.0.0.1' }],
  });
  // Do not silently choose another port when a service already occupies 27018.
  if (!replica.getUri().includes(':27018/')) { await replica.stop({ doCleanup: false }); throw new Error('Port 27018 is occupied. Stop the conflicting local process first.'); }
  console.log('Local MongoDB ready on 127.0.0.1:27018 (replica set starlit-local). Ctrl+C stops it; data persists in backend/.local-mongo.');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await replica.stop({ doCleanup: false }); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return replica;
}
module.exports = { main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
