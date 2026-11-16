import { useEffect, useState } from 'react';
import { API_URL } from '../config/api';
import './Attendance.css';

const indiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const time = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const hours = ms => `${(Number(ms || 0) / 3600000).toFixed(2)} h`;
const csvCell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
function downloadCsv(name, columns, rows) {
  const text = [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export default function Attendance({ user }) {
  const superadmin = user?.role === 'superadmin';
  const [period, setPeriod] = useState('daily');
  const [date, setDate] = useState(indiaToday);
  const [today, setToday] = useState(indiaToday);
  const [month, setMonth] = useState(() => indiaToday().slice(0, 7));
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const activeDate = superadmin ? date : today;
  const activePeriod = superadmin ? period : 'daily';
  const label = activePeriod === 'monthly' ? month : activeDate;
  useEffect(() => { const timer = setInterval(() => { setNow(Date.now()); setToday(indiaToday()); }, 10000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setError(''); setResult(null);
      if (!label) { setError('Select a report date or month.'); return; }
      try {
        const query = new URLSearchParams(activePeriod === 'monthly' ? { month } : { date: activeDate });
        if (employeeId.trim()) query.set('employeeId', employeeId.trim());
        if (status) query.set('status', status);
        const response = await fetch(`${API_URL}/api/attendance?${query}`, { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Attendance unavailable.');
        if (!controller.signal.aborted) setResult(data);
      } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    };
    void load();
    return () => controller.abort();
  }, [activePeriod, activeDate, month, employeeId, status, reload, label]);
  const summaries = result ? [...result.summary, ...result.employees.filter(e => !result.summary.some(s => String(s.workerId) === String(e._id))).map(e => ({ workerId: e._id, employeeId: e.employeeId, employeeName: e.name, attendanceDays: 0, sessionCount: 0, incompleteSessions: 0, totalMs: 0, daily: {} }))].sort((a, b) => a.employeeId.localeCompare(b.employeeId)) : [];
  const exportSessions = () => downloadCsv(`attendance-sessions-${label}.csv`, ['Employee ID', 'Name', 'Attendance date (IST)', 'Check In (IST)', 'Check Out (IST)', 'Status', 'Completed hours'], result.data.map(r => [r.employeeId, r.employeeName, r.attendanceDate, time(r.checkIn), time(r.checkOut), r.status, (r.durationMs / 3600000).toFixed(6)]));
  const exportSummary = () => downloadCsv(`attendance-summary-${label}.csv`, ['Employee ID', 'Name', 'Recorded days', 'Sessions', 'Incomplete sessions', 'Completed hours'], summaries.map(r => [r.employeeId, r.employeeName, r.attendanceDays, r.sessionCount, r.incompleteSessions, (r.totalMs / 3600000).toFixed(6)]));
  return <main className="attendancePage">
    <h1>Employee attendance</h1>
    <p>Check In / Check Out · India time · Overnight hours belong to the check-in date.</p>
    <div className="attendanceControls">
      {superadmin && <label>Report<select value={period} onChange={e => setPeriod(e.target.value)}><option value="daily">Daily</option><option value="monthly">Monthly</option></select></label>}
      {superadmin ? <label>{period === 'monthly' ? 'Month' : 'Date'}<input type={period === 'monthly' ? 'month' : 'date'} value={period === 'monthly' ? month : date} onChange={e => period === 'monthly' ? setMonth(e.target.value) : setDate(e.target.value)} /></label> : <strong>Today: {today}</strong>}
      <label>Employee ID<input value={employeeId} onChange={e => setEmployeeId(e.target.value.toUpperCase())} placeholder="All employees" /></label>
      <label>Session status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All sessions</option><option>Checked In</option><option>Checked Out</option></select></label>
      <button onClick={() => setReload(v => v + 1)}>Refresh</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!error && !result && <p role="status">Loading attendance…</p>}
    {result && <>
      <p><strong>{label}</strong> · Completed time: <strong>{hours(result.summary.reduce((n, r) => n + r.totalMs, 0))}</strong> · Updated {time(result.generatedAt)}</p>
      <p>Open sessions show elapsed time separately. Final totals exclude open sessions. No automatic break deductions or rounding. Filters apply to both tables.</p>
      <div className="attendanceControls"><button onClick={exportSummary}>Export summary CSV</button><button onClick={exportSessions}>Export sessions CSV</button></div>
      <h2>{activePeriod === 'monthly' ? 'Monthly' : 'Daily'} summary</h2>
      <div className="attendanceTable"><table><thead><tr><th>Employee</th><th>Recorded days</th><th>Sessions</th><th>Incomplete</th><th>Completed hours</th><th>Daily totals</th></tr></thead><tbody>{summaries.map(r => <tr key={r.workerId}><td>{r.employeeId} · {r.employeeName}{r.sessionCount === 0 && <small>{status ? 'No matching attendance records' : 'No attendance recorded'}</small>}</td><td>{r.attendanceDays}</td><td>{r.sessionCount}</td><td>{r.incompleteSessions}</td><td>{hours(r.totalMs)}</td><td>{Object.entries(r.daily).map(([day, ms]) => <small key={day}>{day}: {hours(ms)}</small>)}</td></tr>)}</tbody></table></div>
      <h2>Attendance sessions</h2>
      {result.data.length === 0 && <p>No attendance recorded for this selection.</p>}
      <div className="attendanceTable"><table><thead><tr><th>Employee</th><th>Attendance date</th><th>Check In</th><th>Check Out</th><th>Status</th><th>Completed hours</th><th>Open elapsed</th></tr></thead><tbody>{result.data.map(r => <tr key={r._id}><td>{r.employeeId} · {r.employeeName}</td><td>{r.attendanceDate}</td><td>{time(r.checkIn)}</td><td>{time(r.checkOut)}</td><td>{r.status}</td><td>{hours(r.durationMs)}</td><td>{r.status === 'Checked In' ? hours(Math.max(0, now - new Date(r.checkIn).getTime())) : '—'}</td></tr>)}</tbody></table></div>
      {superadmin && result.openSessions.length > 0 && <><h2>Open sessions requiring checkout</h2><p>Includes sessions opened outside this report period. Review missed checkouts; sessions are never closed automatically.</p><ul>{result.openSessions.map(r => <li key={r._id}>{r.employeeId} · {r.employeeName} · Check In {time(r.checkIn)} · elapsed {hours(Math.max(0, now - new Date(r.checkIn).getTime()))}</li>)}</ul></>}
    </>}
  </main>;
}
