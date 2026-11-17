const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dependencyConflicts } = require('../scripts/employeeDependencies');
const { planRestoration } = require('../scripts/restoreOriginalEmployees');
const { reconcile, originalEmployees } = require('../scripts/auditEmployees');

test('all original identities match the confirmed recovery source exactly', () => {
  assert.deepEqual(originalEmployees(), ['Abinesh', 'Kumar', 'Arun', 'Suresh', 'Prakash', 'Vignesh', 'Manoj']
    .map((name, i) => ({ employeeId: `EMP00${i + 1}`, name })));
});

test('missing employees with attendance dependencies cannot receive replacement Worker IDs', () => {
  const original = originalEmployees();
  const dependencies = { attendance: [{ _id: 'EMP001', names: ['Abinesh'], workerIds: ['old-worker-id'], entries: 1 }] };
  const before = JSON.stringify(dependencies);
  assert.ok(planRestoration(original, [], [], { dependencies }).conflicts.length);
  assert.ok(reconcile(original, [], [], dependencies).conflicts.length);
  assert.equal(JSON.stringify(dependencies), before);
});

test('matching mappings remain valid; conflicting names and mappings block restoration', () => {
  const original = originalEmployees();
  const workers = [{ ...original[0], _id: 'preserved', status: 'Active' }];
  const row = { _id: 'EMP001', names: ['Abinesh'], workerIds: ['preserved'], entries: 2 };
  assert.deepEqual(dependencyConflicts(original, workers, { attendance: [row] }), []);
  for (const changed of [{ ...row, names: ['Other person'] }, { ...row, workerIds: ['different'] }]) {
    assert.ok(dependencyConflicts(original, workers, { attendance: [changed] }).length);
  }
  for (const dependencies of [{ events: [{ _id: 'orphan', entries: 1 }] }, { cursors: [{ _id: 'orphan' }] }]) {
    assert.ok(planRestoration(original, workers, [], { dependencies }).conflicts.length);
  }
});

test('read-only audit also rejects duplicates, inactive originals and conflicting work history', () => {
  const original = originalEmployees();
  const worker = { ...original[0], status: 'Active' };
  assert.ok(reconcile(original, [worker, worker], []).conflicts.length);
  assert.ok(reconcile(original, [worker, { ...worker, employeeId: ' emp001 ' }], []).conflicts.length);
  assert.ok(reconcile(original, [{ ...worker, status: 'Inactive' }], []).conflicts.length);
  assert.ok(reconcile(original, [worker], [{ _id: worker.employeeId, names: ['Other person'], entries: 1 }]).conflicts.length);
});
