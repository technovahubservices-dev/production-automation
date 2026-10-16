import { useState } from "react";
import { useWorkers } from "../hooks/useWorkers";
import { API_URL } from "../config/api";
const emptyForm = { employeeId: "", name: "", phone: "", designation: "Worker", status: "Active" };
export default function EmployeeManagement() {
  const { workers, loading, error, refresh } = useWorkers(true);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function write(method, id, body) {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(API_URL + "/api/workers" + (id ? "/" + id : ""), {
        method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to save employee.");
      setMessage(result.message); setEditing(null); setForm(emptyForm); await refresh();
    } catch (err) { setMessage(err.message); } finally { setSaving(false); }
  }
  return <section className="workersDirectory employeeManagement">
    <div className="workersDirectoryHeader"><div><span>EMPLOYEE MASTER</span><h2>Employee management</h2></div><button type="button" disabled={loading || saving} onClick={refresh}>Refresh employees</button></div>
    <form className="employeeManagementForm" onSubmit={(event) => { event.preventDefault(); write(editing ? "PATCH" : "POST", editing, form); }}>
      {[["employeeId", "Employee ID"], ["name", "Employee Name"], ["phone", "Phone"], ["designation", "Designation"]].map(([field, label]) => <label className="entryField" key={field}><span>{label}</span><input name={field} value={form[field]} required={field === "employeeId" || field === "name"} onChange={(event) => setForm({ ...form, [field]: event.target.value })} disabled={saving} /></label>)}
      {<label className="entryField"><span>Status</span><select value={form.status} disabled={saving} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>}
      <button disabled={saving} type="submit">{saving ? "Saving..." : editing ? "Save employee" : "Add Employee"}</button>
      {editing && <button type="button" disabled={saving} onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</button>}
    </form>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {loading ? <p>Loading employees...</p> : <div className="employeeMasterList">{workers.length === 0 ? <p>No employees added yet.</p> : workers.map((worker) => <div className="employeeMasterRow" key={worker._id}><span><strong>{worker.employeeId} - {worker.name}</strong><small>{worker.designation} / {worker.status}</small></span><button type="button" disabled={saving} onClick={() => { setEditing(worker._id); setForm({ employeeId: worker.employeeId, name: worker.name, phone: worker.phone || "", designation: worker.designation || "", status: worker.status }); }}>Edit</button>{worker.status === "Active" && <button type="button" disabled={saving} onClick={() => write("DELETE", worker._id)}>Deactivate</button>}</div>)}</div>}
  </section>;
}
