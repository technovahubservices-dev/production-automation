const { test } = require('node:test');
const assert = require('node:assert/strict');
const { originalEmployees, reconcile } = require('../scripts/auditEmployees');

test('find the seven confirmed original employees in the existing data file', () => {
  const original = originalEmployees();
  assert.equal(original.length, 7);
  assert.equal(new Set(original.map(w => w.employeeId)).size, 7);
});

test('audit reports conflicts and historical gaps without changing any data', () => {
  const original = [{ employeeId: 'A', name: 'Original' }, { employeeId: 'B', name: 'Missing' }, { employeeId: 'C', name: 'Conflicting history' }];
  const workers = [{ employeeId: 'A', name: 'Test', status: 'Active' }];
  const historical = [{ _id: 'A', names: ['Original'], entries: 3 }, { _id: 'B', names: ['Missing'], entries: 2 }, { _id: 'C', names: ['Different'], entries: 1 }, { _id: 'D', names: ['History only'], entries: 1 }];
  const before = JSON.stringify({ original, workers, historical });
  const report = reconcile(original, workers, historical);
  assert.deepEqual(report.missing, [{ employeeId: 'B', name: 'Missing' }]);
  assert.equal(report.conflicts.length, 2);
  assert.equal(report.historicalPresent.length, 1);
  assert.equal(report.historicalMissing.length, 3);
  assert.equal(JSON.stringify({ original, workers, historical }), before);
});
