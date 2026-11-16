import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = readFileSync(new URL('../src/pages/Attendance.jsx', import.meta.url), 'utf8')
  .replace(/import[^\n]+\n/g, '').replace('export default function Attendance', 'function Attendance');
const { code } = await transformWithOxc(source, 'Attendance.jsx', { jsx: { runtime: 'classic' } });
const row = { _id: 'session', workerId: 'worker', employeeId: 'EMP001', employeeName: '=Spreadsheet Formula', attendanceDate: '2024-01-31', checkIn: '2024-01-31T16:30:00Z', checkOut: '2024-02-01T00:30:00Z', durationMs: 8 * 3600000, status: 'Checked Out' };
const data = { data: [row], summary: [{ workerId: 'worker', employeeId: 'EMP001', employeeName: row.employeeName, attendanceDays: 1, sessionCount: 1, incompleteSessions: 0, totalMs: row.durationMs, daily: { '2024-01-31': row.durationMs } }], employees: [], openSessions: [], generatedAt: '2024-02-01T01:00:00Z' };
let stateIndex, csvBlob;
const states = ['monthly', '2024-01-31', '2024-02-01', '2024-01', '', '', 0, data, '', Date.parse('2024-02-01T01:00:00Z')];
const context = { React, Date, console, Blob, URL: { createObjectURL: b => { csvBlob = b; return 'blob:test'; }, revokeObjectURL() {} }, document: { createElement: () => ({ click() {} }) }, API_URL: '', useEffect() {}, useState: () => [states[stateIndex++], () => {}] };
vm.createContext(context); vm.runInContext(code + '\nglobalThis.Page=Attendance;', context);
function render(role) { stateIndex = 0; return context.Page({ user: { role } }); }
const superTree = render('superadmin');
const html = renderToStaticMarkup(superTree);
assert.match(html, /Monthly summary/); assert.match(html, /2024-01-31: 8.00 h/); assert.match(html, /Checked Out/); assert.match(html, /type="month"/);
const adminHtml = renderToStaticMarkup(render('admin'));
assert.match(adminHtml, /Daily summary/); assert.doesNotMatch(adminHtml, /type="month"/); assert.match(adminHtml, /Today: 2024-02-01/);
function nodes(node) { if (!node || typeof node !== 'object') return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
nodes(superTree).find(n => n.type === 'button' && n.props.children === 'Export sessions CSV').props.onClick();
const csv = await csvBlob.text();
assert.match(csv, /8.000000/); assert.match(csv, /"'=Spreadsheet Formula"/); assert.match(csv, /Attendance date \(IST\)/);
console.log('PASS: daily/monthly attendance rendering, role visibility, overnight hours, CSV values and spreadsheet formula escaping.');
