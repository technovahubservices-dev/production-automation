import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { transformWithOxc } from 'vite';

// Exercise the real submit handler using the same JSX harness as the attendance UI test.
const source = readFileSync(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8')
  .replace(/import[^\n]+\n/g, '').replace('export default Login;', '');
const { code } = await transformWithOxc(source, 'Login.jsx', { jsx: { runtime: 'classic' } });
const api = 'https://configured-backend.example.test';
let response, request, loggedIn, states, stateIndex;
const saved = new Map();
const context = {
  React, API_URL: api, Eye: () => null, EyeOff: () => null, LockKeyhole: () => null, User: () => null,
  useState: () => {
    const index = stateIndex++;
    return [states[index], value => { states[index] = value; }];
  },
  localStorage: { setItem: (key, value) => saved.set(key, value) },
  fetch: async (url, options) => { request = { url, options }; return response; },
};
vm.createContext(context);
vm.runInContext(code + '\nglobalThis.Login = Login;', context);
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
async function submit(nextResponse) {
  states = [' existing-admin ', 'existing-password', false, '', false];
  stateIndex = 0;
  response = nextResponse;
  loggedIn = undefined;
  saved.clear();
  const tree = context.Login({ onLogin: user => { loggedIn = user; } });
  await nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
}
const user = { id: 'test-user', username: 'existing-admin', role: 'superadmin' };
await submit({ ok: true, json: async () => ({ success: true, token: 'test-jwt', user }) });
assert.equal(request.url, api + '/api/auth/login');
assert.equal(request.options.method, 'POST');
assert.equal(request.options.headers['Content-Type'], 'application/json');
assert.equal(request.options.credentials, undefined);
assert.deepEqual(JSON.parse(request.options.body), { username: 'existing-admin', password: 'existing-password' });
assert.equal(saved.get('token'), 'test-jwt');
assert.deepEqual(JSON.parse(saved.get('user')), user);
assert.deepEqual(loggedIn, user);
assert.equal(states[4], false);
await submit({ ok: false, json: async () => ({ success: false, message: 'Invalid username or password.' }) });
assert.equal(states[3], 'Invalid username or password.');
assert.equal(states[4], false);
assert.equal(saved.size, 0);
assert.equal(loggedIn, undefined);
console.log('PASS: login uses configured API URL, sends existing credentials, stores JWT/user, and displays authentication errors.');
