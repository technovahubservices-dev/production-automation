const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planRestoration, correctionOperation } = require('../scripts/restoreOriginalEmployees');
const { originalEmployees } = require('../scripts/auditEmployees');

test('missing original employees are planned for insertion; matching and additional employees remain unchanged', () => {
  const original = originalEmployees();
  const workers = [{ ...original[0], status: 'Active', phone: 'existing phone' }, { employeeId: 'LATER', name: 'Legitimate later employee', status: 'Active' }];
  const before = JSON.stringify(workers);
  const plan = planRestoration(original, workers, [{ _id: 'EMP001', names: [original[0].name], entries: 2 }]);
  assert.equal(plan.missing.length, 6);
  assert.deepEqual(plan.unchanged, ['EMP001']);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(JSON.stringify(workers), before);
  const restored = [...workers, ...plan.missing.map(w => ({ ...w, status: 'Active' }))];
  const rerun = planRestoration(original, restored, []);
  assert.equal(rerun.missing.length, 0);
  assert.equal(rerun.conflicts.length, 0);
  assert.equal(restored.length, 8);
});

test('Test conflict stops even without dependencies because provenance is unknown', () => {
  const original = originalEmployees();
  const worker = { employeeId: 'EMP001', name: 'Test', status: 'Active', createdAt: new Date() };
  for (const historical of [[], [{ _id: 'EMP001', names: ['Test'], entries: 1 }]]) {
    const plan = planRestoration(original, [worker], historical);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].workEntryCount, historical.length);
    assert.equal(worker.name, 'Test');
  }
});

test('duplicate IDs, other identity conflicts, inactive matching workers, and conflicting history stop restoration', () => {
  const original = originalEmployees();
  for (const [workers, historical] of [
    [[{ ...original[1], name: 'Different', status: 'Active' }], []],
    [[{ ...original[1], status: 'Inactive' }], []],
    [[{ ...original[1], status: 'Active' }, { ...original[1], status: 'Active' }], []],
    [[], [{ _id: original[2].employeeId, names: ['Different'], entries: 3 }]],
  ]) assert.ok(planRestoration(original, workers, historical).conflicts.length > 0);
});


test('explicit confirmed EMP001 correction preserves its ID and fields, restores six missing employees, and is idempotent', () => {
  const original = originalEmployees();
  const worker = { _id: 'existing-mongo-id', employeeId: 'EMP001', name: 'Test', status: 'Inactive', phone: 'preserved phone', designation: 'preserved designation', createdAt: 'preserved date', updatedAt: 'preserved date' };
  const additional = { _id: 'later-id', employeeId: 'EMP014', name: 'Later employee', status: 'Active' };
  const historical = [{ _id: 'EMP001', names: ['Abinesh'], entries: 8 }];
  const before = JSON.stringify({ worker, additional, historical });
  const plan = planRestoration(original, [worker, additional], historical, { resolveEmp001Test: true });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.corrections.length, 1);
  assert.equal(plan.missing.length, 6);
  assert.equal(plan.corrections[0].workEntryCount, 8);
  const operation = correctionOperation(plan.corrections[0]);
  assert.deepEqual(operation.filter, { _id: worker._id, employeeId: 'EMP001', name: 'Test' });
  assert.deepEqual(operation.update, { $set: { employeeId: 'EMP001', name: 'Abinesh', status: 'Active' } });
  const corrected = { ...worker, ...operation.update.$set };
  assert.equal(corrected._id, worker._id);
  assert.equal(corrected.phone, worker.phone);
  assert.equal(corrected.updatedAt, worker.updatedAt);
  const restored = [corrected, additional, ...plan.missing.map(item => ({ ...item, status: 'Active' }))];
  const rerun = planRestoration(original, restored, historical, { resolveEmp001Test: true });
  assert.equal(rerun.corrections.length, 0);
  assert.equal(rerun.missing.length, 0);
  assert.equal(rerun.conflicts.length, 0);
  assert.equal(JSON.stringify({ worker, additional, historical }), before);
});

test('explicit flag cannot correct other names/IDs or bypass contradictory historical identities', () => {
  const original = originalEmployees();
  for (const [worker, history] of [
    [{ _id: '1', employeeId: 'EMP001', name: 'Test' }, []],
    [{ _id: '1', employeeId: 'EMP001', name: 'Test' }, [{ _id: 'EMP001', names: ['Abinesh', 'Test'], entries: 8 }]],
    [{ _id: '1', employeeId: 'EMP001', name: 'Other name' }, [{ _id: 'EMP001', names: ['Abinesh'], entries: 8 }]],
    [{ _id: '2', employeeId: 'EMP002', name: 'Test' }, []],
  ]) {
    const plan = planRestoration(original, [worker], history, { resolveEmp001Test: true });
    assert.equal(plan.corrections.length, 0);
    assert.ok(plan.conflicts.length > 0);
  }
  assert.throws(() => correctionOperation({ _id: '2', employeeId: 'EMP002', fromName: 'Test', name: 'Kumar', status: 'Active' }), /Unapproved/);
});
