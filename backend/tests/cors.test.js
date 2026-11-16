const { test } = require('node:test');
const assert = require('node:assert/strict');
const { corsOptions } = require('../config/cors');

test('Starlit CORS accepts exact production origins and originless service calls', () => {
  const options = corsOptions({ NODE_ENV: 'production' });
  for (const origin of [undefined, 'https://technovahub.in', 'https://www.technovahub.in']) {
    options.origin(origin, (error, allowed) => { assert.equal(error, null); assert.equal(allowed, true); });
  }
  for (const origin of ['http://localhost:5173', 'https://technovahub.in.evil.test', 'https://evil.test', 'null']) {
    options.origin(origin, error => assert.equal(error.status, 403));
  }
  corsOptions({}).origin('http://localhost:5173', (error, allowed) => { assert.equal(error, null); assert.equal(allowed, true); });
});
