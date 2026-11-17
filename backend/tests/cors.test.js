const { test } = require('node:test');
const assert = require('node:assert/strict');
const { corsOptions } = require('../config/cors');

test('Starlit CORS accepts exact production origins and originless service calls', () => {
  const options = corsOptions({ NODE_ENV: 'production' });
  for (const origin of [undefined, 'https://technovahub.in', 'https://www.technovahub.in', 'https://frontend-seven-silk-lcv373ygdo.vercel.app']) {
    options.origin(origin, (error, allowed) => { assert.equal(error, null); assert.equal(allowed, true); });
  }
  for (const origin of ['http://localhost:5173', 'http://localhost:5174', 'https://technovahub.in.evil.test', 'https://frontend-seven-silk-lcv373ygdo.vercel.app.evil.test', 'https://other.vercel.app', 'https://evil.test', 'null']) {
    options.origin(origin, error => assert.equal(error.status, 403));
  }
  for (const origin of ['http://localhost:5173', 'http://localhost:5174']) {
    corsOptions({}).origin(origin, (error, allowed) => { assert.equal(error, null); assert.equal(allowed, true); });
  }
});

test('production HTTP stack: CORS, preflight, MongoDB login and JWT permissions', { timeout: 120000 }, async t => {
  const path = require('node:path');
  const mongoose = require('mongoose');
  const jwt = require('jsonwebtoken');
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  const User = require('../models/User');
  const emailService = require('../utils/emailService');
  // No .env, external database or real email delivery. Fixtures exist only in this temporary DB.
  t.mock.method(emailService, 'sendLoginNotification', async () => {});
  const { createApp } = require('../app');
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-cors-test-jwt-secret';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const repl = await MongoMemoryReplSet.create({
    binary: { version: '8.0.17', downloadDir: path.resolve(__dirname, '../../.test-mongodb') },
    replSet: { count: 1 }, instanceOpts: [{ ip: '127.0.0.1' }],
  });
  t.after(() => repl.stop());
  await mongoose.connect(repl.getUri('cors_login_test'));
  t.after(() => mongoose.disconnect());
  await User.init();
  const users = await User.create(['admin', 'superadmin'].map(role => ({
    name: `CORS ${role}`, username: `cors-${role}`, role, password: 'isolated-test-password',
  })));
  const originalRows = JSON.stringify(await User.find().sort({ username: 1 }).lean());
  const server = createApp({ NODE_ENV: 'production' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const origins = ['https://technovahub.in', 'https://www.technovahub.in', 'https://frontend-seven-silk-lcv373ygdo.vercel.app'];
  function checkCors(response, origin) {
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.match(response.headers.get('vary'), /Origin/);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
  }
  function login(origin, body) {
    return fetch(base + '/api/auth/login', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  await t.test('all exact production origins preflight and expose validation/auth errors', async () => {
    for (const origin of origins) {
      const preflight = await fetch(base + '/api/auth/login', {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization' },
      });
      assert.equal(preflight.status, 204);
      checkCors(preflight, origin);
      assert.deepEqual(preflight.headers.get('access-control-allow-methods').split(','), ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
      assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type,Authorization');
      for (const [body, status] of [[{}, 400], [{ username: 'no-such-user', password: 'wrong' }, 401],
        [{ username: users[0].username, password: 'wrong' }, 401]]) {
        const response = await login(origin, body);
        assert.equal(response.status, status);
        checkCors(response, origin);
        assert.equal((await response.json()).success, false);
      }
      const malformed = await fetch(base + '/api/auth/login', {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{',
      });
      assert.equal(malformed.status, 400);
      checkCors(malformed, origin);
    }
  });
  await t.test('disallowed origins are rejected before preflight or login reaches the database', async () => {
    const find = t.mock.method(User, 'findOne', () => { throw new Error('Disallowed request reached login'); });
    try {
      for (const origin of ['https://evil.test', 'https://other.vercel.app', 'null', 'http://localhost:5173']) {
        for (const method of ['OPTIONS', 'POST']) {
          const response = await fetch(base + '/api/auth/login', {
            method, headers: { Origin: origin, 'Content-Type': 'application/json', 'Access-Control-Request-Method': 'POST' },
            ...(method === 'POST' ? { body: '{"username":"cors-admin","password":"wrong"}' } : {}),
          });
          assert.equal(response.status, 403);
          assert.equal(response.headers.get('access-control-allow-origin'), null);
          assert.equal((await response.json()).message, 'Origin is not permitted.');
        }
      }
      assert.equal(find.mock.callCount(), 0);
    } finally { find.mock.restore(); }
  });
  await t.test('existing password hashes authenticate both roles and preserve permission checks', async () => {
    for (const user of users) {
      const origin = origins[2];
      const response = await login(origin, { username: ` ${user.username.toUpperCase()} `, password: 'isolated-test-password' });
      assert.equal(response.status, 200);
      checkCors(response, origin);
      const data = await response.json();
      assert.equal(data.user.role, user.role);
      assert.equal(data.user.password, undefined);
      const claims = jwt.verify(data.token, process.env.JWT_SECRET);
      assert.equal(claims.id, String(user._id));
      assert.equal(claims.role, user.role);
      assert.equal(claims.exp - claims.iat, 12 * 60 * 60);
      const protectedResponse = await fetch(base + '/api/auth/users', {
        headers: { Origin: origin, Authorization: `Bearer ${data.token}` },
      });
      assert.equal(protectedResponse.status, user.role === 'superadmin' ? 200 : 403);
      checkCors(protectedResponse, origin);
    }
    const response = await fetch(base + '/api/auth/users', { headers: { Origin: origins[2] } });
    assert.equal(response.status, 401);
    checkCors(response, origins[2]);
    assert.equal(JSON.stringify(await User.find().sort({ username: 1 }).lean()), originalRows);
  });
});
