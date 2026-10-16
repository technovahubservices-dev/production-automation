import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { SettingsProvider } = await server.ssrLoadModule('/src/context/SettingsContext.jsx');
  const { mergeWorkerDirectory } = await server.ssrLoadModule('/src/utils/workerDirectory.js');
  const employees = [{ employeeId: 'EMP001', name: 'Existing Worker' }, { employeeId: 'EMP014', name: 'New Worker' }];
  const activity = [{ employeeId: 'EMP001', employeeName: 'Historical name', totalMinutes: 60, activities: [{ department: 'CNC' }] }];
  const before = JSON.stringify({ employees, activity });
  const directory = mergeWorkerDirectory(employees, activity);
  assert.equal(directory.length, 2);
  assert.equal(directory[1].employeeId, 'EMP014');
  assert.equal(directory[1].totalMinutes, 0);
  assert.equal(directory[0].employeeName, 'Existing Worker');
  assert.equal(JSON.stringify({ employees, activity }), before);
  const { getLocalDate } = await server.ssrLoadModule('/src/utils/attendance.js');
  const { useAccessDate, formatToday } = await server.ssrLoadModule('/src/hooks/useAccessDate.js');
  assert.equal(getLocalDate(new Date(2026, 9, 16, 0, 1)), '2026-10-16');
  assert.equal(getLocalDate(new Date(2026, 9, 16, 23, 59)), '2026-10-16');
  // Only Admin setter is invoked during render to verify it cannot alter the effective date.
  function AdminProbe() { const [date, setDate] = useAccessDate({ role: 'admin' }, '2000-01-01'); setDate('2999-01-01'); return React.createElement('span', null, date); }
  assert.ok(renderToStaticMarkup(React.createElement(AdminProbe)).includes(getLocalDate()));
  for (const name of ['ProductionDashboard', 'Dashboard', 'Department', 'WorkEntry', 'Production', 'Workers', 'Reports']) {
    const { default: Page } = await server.ssrLoadModule('/src/pages/' + name + '.jsx');
    for (const role of ['admin', 'superadmin']) {
      const html = renderToStaticMarkup(React.createElement(SettingsProvider, null, React.createElement(Page, { user: { role }, department: 'CNC' })));
      if (name === 'Workers') assert.equal(html.includes('Add Employee'), role === 'superadmin');
      if (name === 'WorkEntry') { assert.ok(html.includes('Select employee')); assert.ok(!html.includes('Abinesh')); }
      if (role === 'admin') {
        assert.ok(!html.includes('type="date"'), name + ' Admin date picker');
        assert.ok(!html.includes('<select') || name === 'WorkEntry' || name === 'Production', name + ' Admin period selector');
        assert.ok(html.includes(formatToday(getLocalDate())), name + ' Admin today label');
      } else if (name === 'Workers') assert.ok(html.includes('Custom Range'));
      else assert.ok(html.includes('type="date"'), name + ' Super Admin date picker');
    }
    console.log(name + ': both roles passed');
  }
} finally { await server.close(); }
