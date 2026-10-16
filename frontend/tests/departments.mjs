import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const defaults = require('../../shared/departments.json');
const { resolveDepartments: resolveBackend } = require('../../backend/config/departments.js');
const { getLocalDate } = await import('../src/utils/attendance.js');
const rows = defaults.map(({ name }, i) => ({ _id: String(i), employeeId: 'existing-worker', employeeName: 'Existing employee', date: getLocalDate(), department: name, hours: 1, cuttingWeight: 1000, weight: 2000, rmt: 3 }));
const fixture = { departments: resolveBackend(defaults.slice(0, 5)), shifts: [{ name: 'Day' }], reportPreferences: {} };
assert.equal(fixture.departments.length, 13);
const inactive = resolveBackend([{ name: 'CNC', active: false, unit: 'KG' }, { name: 'CUSTOM', active: true, unit: '' }]);
assert.equal(inactive.find(d => d.name === 'CNC').active, false);
assert.ok(inactive.some(d => d.name === 'CUSTOM'));
const model = require('../../backend/models/SystemSettings.js');
assert.equal(new model().departments.length, 13);
const subdocs = new model({ departments: [{ name: 'CNC', active: false, unit: 'KG' }] }).departments;
assert.equal(resolveBackend(subdocs).find(d => d.name === 'CNC').active, false);
const settingsController = require('../../backend/controllers/settingsController.js');
const originalFind = model.findOne;
const legacySettings = new model({ departments: defaults.slice(0, 5) });
const beforeSettings = JSON.stringify(legacySettings);
try {
  model.findOne = async () => legacySettings;
  let result, status;
  await settingsController.getSettings({}, { status(code) { status = code; return this; }, json(body) { result = body; return this; } });
  assert.equal(status, 200);
  assert.equal(result.data.departments.length, 13);
  assert.equal(JSON.stringify(legacySettings), beforeSettings);
} finally { model.findOne = originalFind; }

// Supply loaded settings and records for server rendering, without running live API requests.
const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, plugins: [{
  name: 'department-render-fixtures', enforce: 'pre', transform(source, id) {
    if (id.endsWith('/context/SettingsContext.jsx')) return source.replace('useState(null)', `useState(${JSON.stringify(fixture)})`).replace('useState(true)', 'useState(false)');
    if (/\/pages\/(ProductionDashboard|Dashboard|Production|Reports|Department)\.jsx$/.test(id)) return source.replace('const [storedEntries, setEntries] = useState([])', `const [storedEntries, setEntries] = useState(${JSON.stringify(rows)})`).replace('const [loading, setLoading] = useState(true)', 'const [loading, setLoading] = useState(false)');
  }
}] });
try {
  const { SettingsProvider, resolveDepartments } = await server.ssrLoadModule('/src/context/SettingsContext.jsx');
  assert.deepEqual(resolveDepartments(defaults.slice(0, 5)), fixture.departments);
  const units = await server.ssrLoadModule('/src/context/productionUnits.js');
  const totals = units.calculateProductionTotals(rows);
  assert.equal(totals.totalTon, 5);
  assert.equal(totals.totalRmt, 3);
  for (const { name } of defaults.slice(4)) assert.equal(units.formatProduction(totals.departments[name]), '-');
  for (const role of ['admin', 'superadmin']) {
    for (const name of ['ProductionDashboard', 'Dashboard', 'Production', 'Reports', 'WorkEntry']) {
      const { default: Page } = await server.ssrLoadModule('/src/pages/' + name + '.jsx');
      const html = renderToStaticMarkup(React.createElement(SettingsProvider, null, React.createElement(Page, { user: { role }, onDepartmentClick() {} })));
      for (const department of defaults) assert.ok(html.includes(department.name), name + ' missing ' + department.name);
      if (name === 'ProductionDashboard') {
        assert.equal((html.match(/class="departmentCard"/g) || []).length, 13);
        assert.match(html, /13.*DEPARTMENTS/);
      }
      assert.equal(html.includes('type="date"'), role === 'superadmin', name + ' date permission changed');
    }
    const { default: Department } = await server.ssrLoadModule('/src/pages/Department.jsx');
    for (const { name } of defaults) {
      const html = renderToStaticMarkup(React.createElement(SettingsProvider, null, React.createElement(Department, { user: { role }, department: name })));
      assert.ok(html.includes(name));
      assert.ok(html.includes('existing-worker'));
    }
    console.log(role + ': all 13 departments in Overview, Dashboard, Work Entry, Production, Reports and department detail pages passed');
  }
} finally { await server.close(); }
