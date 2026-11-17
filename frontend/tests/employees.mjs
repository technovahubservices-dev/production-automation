import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const root = new URL('../src/', import.meta.url);
function compile(source, name, globals) {
  const context = { React, ...globals };
  vm.createContext(context);
  vm.runInContext(source + `\nglobalThis.Component = ${name};`, context);
  return context.Component;
}
function clean(source) {
  return source.replace(/import[\s\S]*?from ["'][^"']+["'];?\r?\n/g, '')
    .replace(/import ["'][^"']+["'];?\r?\n/g, '')
    .replace(/export default function/g, 'function').replace(/export default \w+;/g, '')
    .replace(/export (const|function)/g, '$1');
}
let states = [], stateIndex = 0, cleanup, request, rows = [{ employeeId: 'EMP010', name: 'From MongoDB' }], fail = false;
const hookSource = clean(readFileSync(new URL('hooks/useWorkers.js', root), 'utf8'));
const runWorkersHook = compile(hookSource, 'useWorkers', {
  API_URL: 'https://configured-starlit.example.test', AbortController,
  localStorage: { getItem: () => 'test-bearer' },
  useState: value => { const i = stateIndex++; states[i] = value; return [value, next => { states[i] = next; }]; },
  useRef: value => ({ current: value }), useCallback: fn => fn,
  useEffect: fn => { cleanup = fn; },
  window: { addEventListener() {}, removeEventListener() {} },
  fetch: async (url, options) => { request = { url, options }; return { ok: !fail,
    json: async () => fail ? { success: false, message: 'Workers API unavailable' } : { success: true, data: rows } }; },
});
const hook = runWorkersHook();
await hook.refresh();
assert.equal(request.url, 'https://configured-starlit.example.test/api/workers');
assert.equal(request.options.headers.Authorization, 'Bearer test-bearer');
assert.equal(states[0][0].name, 'From MongoDB');
rows = [...rows, { employeeId: 'NEW123', name: 'Newly created employee' }];
await hook.refresh();
assert.equal(states[0].length, 2);
fail = true;
await hook.refresh();
assert.equal(states[0].length, 0);
assert.equal(states[2], 'Workers API unavailable');
assert.equal(states[1], false);
assert.equal(typeof cleanup, 'function');

async function component(filename, name, globals) {
  const { code } = await transformWithOxc(clean(readFileSync(new URL(filename, root), 'utf8')), filename, { jsx: { runtime: 'classic' } });
  return compile(code, name, globals);
}
const icon = () => null;
const dynamic = [{ employeeId: 'DYNAMIC-ID', name: 'Live API Employee' }];
const WorkEntry = await component('pages/WorkEntry.jsx', 'WorkEntry', {
  API_URL: '', useCheckedInWorkers: () => ({ workers: dynamic, loading: false, error: '', refresh() {} }),
  useLocalToday: () => '2026-11-17', formatToday: value => value, getLocalDate: () => '2026-11-17',
  useSettings: () => ({ settings: { shifts: [] }, loading: false, error: '', unitFor: () => '', departments: [] }),
  useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useMemo: fn => fn(),
  CalendarDays: icon, Check: icon, ChevronDown: icon, Clock3: icon, Factory: icon, Plus: icon, UserRound: icon,
});
const html = renderToStaticMarkup(WorkEntry({ user: { role: 'admin' } }));
assert.match(html, /DYNAMIC-ID - Live API Employee/);
assert.doesNotMatch(html, /Abinesh|EMP001/);
const WorkerPanel = await component('components/WorkerPanel.jsx', 'WorkerPanel', { X: icon, Clock3: icon, Layers3: icon, BriefcaseBusiness: icon });
const panelHtml = renderToStaticMarkup(WorkerPanel({ worker: { employeeId: 'DYNAMIC-ID', name: 'Live API Employee' },
  entries: [{ _id: 'live-entry', employeeId: 'DYNAMIC-ID', hours: 2, department: 'LIVE DEPARTMENT' }], onClose() {} }));
assert.match(panelHtml, /LIVE DEPARTMENT/);
assert.match(panelHtml, /2h/);
assert.doesNotMatch(panelHtml, /Abinesh|Azad Nagar/);

// Exercise SecureVerify's existing lookup effect without editing the biometric repository.
const biometricSource = readFileSync(new URL('../../../biometric/frontend/src/App.jsx', import.meta.url), 'utf8');
const effectStart = biometricSource.indexOf("    if (mode !== 'enroll' || !attendanceEnabled) return;");
const effectEnd = biometricSource.indexOf('  }, [mode, attendanceEnabled, employeeId, adminKey]);', effectStart);
assert.ok(effectStart >= 0 && effectEnd > effectStart);
const effectCode = `(function () {\n${biometricSource.slice(effectStart, effectEnd)}\n})()`;
let name, status, pending, lookupRequest;
const context = { mode: 'enroll', attendanceEnabled: true, employeeId: 'EMP001', adminKey: 'isolated-admin-key', encodeURIComponent,
  setEmployeeName: value => { name = value; }, setStatus: value => { status = value; },
  setTimeout: fn => { pending = fn; return 1; }, clearTimeout() {},
  api: async (path, options) => { lookupRequest = { path, options }; return { name: 'Abinesh' }; },
};
vm.createContext(context);
let cancel = vm.runInContext(effectCode, context);
await pending();
assert.equal(name, 'Abinesh');
assert.equal(lookupRequest.path, '/employees/EMP001/lookup');
assert.equal(lookupRequest.options.headers['x-admin-key'], 'isolated-admin-key');
cancel();
context.employeeId = 'EMP002';
cancel = vm.runInContext(effectCode, context);
cancel();
await pending();
assert.equal(name, ''); // Stale responses cannot fill a different employee's name.
context.api = async () => { throw new Error('Active Starlit employee not found.'); };
vm.runInContext(effectCode, context);
await pending();
assert.equal(name, '');
assert.match(status.text, /Employee lookup failed/);

// Recovery fixtures must never become a live fallback again.
function scan(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = new URL(item.name + (item.isDirectory() ? '/' : ''), directory);
    if (item.isDirectory()) scan(file);
    else if (/\.[jt]sx?$/.test(item.name)) assert.doesNotMatch(readFileSync(file, 'utf8'), /(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*data\/workers["']/);
  }
}
scan(root);
console.log('PASS: authenticated dynamic employee loading/refresh/errors, Work Entry API options, fixture-free panel, and SecureVerify name autofill/stale-response protection.');
