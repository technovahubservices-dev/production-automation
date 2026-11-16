const { test } = require('node:test');
const assert = require('node:assert/strict');
const { transition, summarize, indiaDate, validateEvent } = require('../services/attendanceService');
test('overnight month boundary belongs to the check-in date; multiple sessions sum without rounding', () => {
  const open = { checkIn: '2024-01-31T16:30:00.000Z' };
  const first = transition(open, { action: 'CHECK_OUT', verifiedAt: '2024-02-01T00:30:00.000Z' });
  assert.equal(first.durationMs, 8 * 3600000);
  assert.equal(indiaDate(open.checkIn), '2024-01-31');
  const rows = [
    { workerId: 'w1', employeeId: 'E1', employeeName: 'One', attendanceDate: '2024-01-31', durationMs: first.durationMs, status: 'Checked Out' },
    { workerId: 'w1', employeeId: 'E1', employeeName: 'One', attendanceDate: '2024-01-31', durationMs: 1234567, status: 'Checked Out' },
    { workerId: 'w1', employeeId: 'E1', employeeName: 'One', attendanceDate: '2024-02-01', durationMs: 0, status: 'Checked In' },
  ];
  const [summary] = summarize(rows);
  assert.equal(summary.totalMs, 8 * 3600000 + 1234567);
  assert.equal(summary.attendanceDays, 2);
  assert.equal(summary.incompleteSessions, 1);
  assert.equal(summary.daily['2024-02-01'], 0);
});
test('duplicate and unmatched actions fail closed', () => {
  assert.equal(transition({ checkIn: '2024-01-01' }, { action: 'CHECK_IN' }).code, 'ALREADY_CHECKED_IN');
  assert.equal(transition(null, { action: 'CHECK_OUT' }).code, 'NO_OPEN_SESSION');
  assert.equal(transition({ checkIn: '2024-01-02' }, { action: 'CHECK_OUT', verifiedAt: '2024-01-01' }).code, 'OUT_OF_ORDER');
  assert.equal(transition(null, { action: 'CHECK_IN', verifiedAt: '2024-01-01' }, { checkOut: '2024-01-02' }).code, 'OUT_OF_ORDER');
});
test('untrusted attendance payloads cannot bypass required checks', () => {
  const event = { eventId: require('node:crypto').randomUUID(), workerId: '012345678901234567890123', employeeId: 'EMP001', sequence: 1, action: 'CHECK_IN', verifiedAt: '2024-01-01T00:00:00.000Z', checks: { passkey: true, face: true }, demoMode: false };
  assert.doesNotThrow(() => validateEvent(event));
  for (const bad of [{ demoMode: true }, { sequence: 0 }, { checks: { passkey: false, face: true } }, { verifiedAt: 'bad' }, { action: 'DELETE' }, { workerId: 'wrong' }]) assert.throws(() => validateEvent({ ...event, ...bad }));
});
