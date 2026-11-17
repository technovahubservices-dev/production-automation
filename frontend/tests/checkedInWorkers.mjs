import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const root = new URL('../src/', import.meta.url);
const clean = source => source.replace(/import[\s\S]*?from ["'][^"']+["'];?\r?\n/g, '')
  .replace(/export default \w+;/g, '').replace(/export (const|function)/g, '$1');
const states = [], listeners = {}, effects = [];
let index = 0, timer, timerCleared, rows = [], failure = '', request, deferred;
const context = { AbortController, API_URL: 'https://starlit.example.test', localStorage: { getItem: () => 'test-token' },
  useState: value => { const i = index++; states[i] = value; return [value, next => { states[i] = next; }]; },
  useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: fn => effects.push(fn),
  window: { addEventListener: (event, fn) => { listeners[event] = fn; }, removeEventListener: event => { delete listeners[event]; } },
  document: { visibilityState: 'visible', addEventListener: (event, fn) => { listeners[event] = fn; }, removeEventListener: event => { delete listeners[event]; } },
  setInterval: (fn, delay) => { timer = fn; assert.equal(delay, 10000); return 1; }, clearInterval: () => { timerCleared = true; },
  fetch: async (url, options) => {
    request = { url, options };
    if (deferred) return deferred;
    return { ok: !failure, json: async () => failure ? { success: false, message: failure } : { success: true, data: rows } };
  },
};
vm.createContext(context);
vm.runInContext(clean(readFileSync(new URL('hooks/useCheckedInWorkers.js', root), 'utf8')) + '\nglobalThis.hook = useCheckedInWorkers();', context);
const flush = () => new Promise(resolve => setImmediate(resolve));
const cleanup = effects[0]();
await flush();
assert.equal(request.url, 'https://starlit.example.test/api/attendance/checked-in-workers');
assert.equal(request.options.headers.Authorization, 'Bearer test-token');
assert.equal(request.options.cache, 'no-store');
assert.equal(states[0].length, 0); assert.equal(states[1], false);
rows = [{ employeeId: 'EMP009', name: 'MongoDB Nine' }];
timer(); await flush(); assert.equal(states[0].length, 1);
rows = [...rows, { employeeId: 'EMP010', name: 'MongoDB Ten' }];
listeners.focus(); await flush(); assert.equal(states[0].length, 2);
rows = rows.slice(1); // Committed checkout is observed by the next poll.
timer(); await flush(); assert.equal(states[0][0].employeeId, 'EMP010');
failure = 'Attendance API unavailable';
timer(); await flush(); assert.equal(states[0].length, 0); assert.equal(states[2], failure);
failure = ''; rows = [];
listeners.visibilitychange(); await flush(); assert.equal(states[2], '');
let resolveSlow;
deferred = new Promise(resolve => { resolveSlow = resolve; });
const slow = context.hook.refresh();
const signal = request.options.signal;
timer(); assert.equal(signal.aborted, false); // Polling must not starve slow requests.
deferred = undefined;
await context.hook.refresh(); // A newer request wins even if the old response arrives last.
resolveSlow({ ok: true, json: async () => ({ success: true, data: [{ employeeId: 'STALE' }] }) });
await slow; assert.equal(states[0].length, 0);
cleanup(); assert.equal(timerCleared, true); assert.equal(Object.keys(listeners).length, 0);

let eligibility = { workers: [], loading: false, error: '', refresh() {} };
const icon = () => null;
const pageContext = { React, API_URL: '', useCheckedInWorkers: () => eligibility,
  useLocalToday: () => '2026-11-17', formatToday: value => value, getLocalDate: () => '2026-11-17',
  useSettings: () => ({ settings: { shifts: [{ name: 'Day' }] }, loading: false, error: '', unitFor: () => '', departments: [{ name: 'CNC' }] }),
  useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useMemo: fn => fn(),
  CalendarDays: icon, Check: icon, ChevronDown: icon, Clock3: icon, Factory: icon, Plus: icon, UserRound: icon,
};
const { code } = await transformWithOxc(clean(readFileSync(new URL('pages/WorkEntry.jsx', root), 'utf8')), 'WorkEntry.jsx', { jsx: { runtime: 'classic' } });
vm.createContext(pageContext); vm.runInContext(code + '\nglobalThis.Page = WorkEntry;', pageContext);
const render = () => renderToStaticMarkup(pageContext.Page({ user: { role: 'admin' } }));
assert.match(render(), /No employees currently checked in\./);
assert.match(render(), /<select[^>]*disabled/);
eligibility = { ...eligibility, workers: [{ employeeId: 'EMP009', name: 'MongoDB Nine' }] };
let html = render();
assert.match(html, /EMP009 - MongoDB Nine/); assert.doesNotMatch(html, /EMP001|EMP010/);
eligibility = { ...eligibility, workers: [], error: 'Attendance API unavailable' };
html = render(); assert.match(html, /role="alert">Attendance API unavailable/);
assert.doesNotMatch(html, /No employees currently checked in|EMP009|EMP001/);
console.log('PASS: checked-in employee options, empty/error states, authenticated polling, focus/revisit refresh, checkout removal, stale response protection, and cleanup.');
