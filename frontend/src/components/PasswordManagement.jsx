import { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { API_URL } from "../config/api";
import "./PasswordManagement.css";

export default function PasswordManagement() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAccounts() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_URL}/api/auth/users`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error("Unable to load accounts.");
        setAccounts(result.data);
      } catch {
        if (!controller.signal.aborted) setError("Unable to load accounts. Please retry.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadAccounts();
    return () => controller.abort();
  }, [retry]);

  function clearPasswords() {
    setNewPassword("");
    setConfirmPassword("");
    setShowNew(false);
    setShowConfirm(false);
  }

  async function handleReset(event) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setMessage("");
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return setError("Select an account.");
    if (!newPassword || !confirmPassword) return setError("New password and confirmation are required.");
    if (newPassword.length < 6 || !newPassword.trim()) return setError("New password must contain at least 6 characters and cannot be blank.");
    if (new TextEncoder().encode(newPassword).length > 72) return setError("New password must not exceed 72 UTF-8 bytes.");
    if (newPassword !== confirmPassword) return setError("New password and confirmation do not match.");
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/users/${accountId}/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("Unable to update password.");
      clearPasswords();
      setMessage(`Password updated successfully for ${account.name} (${account.role === "superadmin" ? "Super Admin" : "Admin"}).`);
    } catch {
      setError("Unable to update password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settingsSection settingsSectionWide passwordManagement">
      <div className="settingsSectionHeader">
        <div className="settingsSectionIcon"><LockKeyhole size={19} /></div>
        <div><p>SECURITY / ACCOUNTS</p><h2>PASSWORD MANAGEMENT</h2></div>
      </div>
      <p>Reset login passwords for Admin and Super Admin accounts.</p>
      {error && <div className="settingsMessage settingsMessageError" role="alert">{error}</div>}
      {message && <div className="settingsMessage settingsMessageSuccess" role="status">{message}</div>}
      {loading ? <p role="status">Loading accounts...</p> : accounts.length === 0 ? (
        <div><p>No accounts available.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry accounts</button></div>
      ) : (
        <form onSubmit={handleReset}>
          <label className="settingsField">
            <span>ACCOUNT</span>
            <select required value={accountId} disabled={saving} onChange={(event) => {
              setAccountId(event.target.value); clearPasswords(); setError(""); setMessage("");
            }}>
              <option value="">Select Account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>
                {account.name} — {account.username} — {account.role === "superadmin" ? "Super Admin" : "Admin"}
              </option>)}
            </select>
          </label>
          <div className="settingsFormGrid">
            {[
              { id: "new-password", label: "NEW PASSWORD", value: newPassword, setValue: setNewPassword, show: showNew, setShow: setShowNew },
              { id: "confirm-password", label: "CONFIRM NEW PASSWORD", value: confirmPassword, setValue: setConfirmPassword, show: showConfirm, setShow: setShowConfirm },
            ].map((field) => (
              <div className="settingsField" key={field.id}>
                <label htmlFor={field.id}>{field.label}</label>
                <div className="passwordManagementInput">
                  <LockKeyhole size={16} aria-hidden="true" />
                  <input id={field.id} type={field.show ? "text" : "password"} autoComplete="new-password"
                    required minLength={6} value={field.value} disabled={saving}
                    onChange={(event) => { field.setValue(event.target.value); setMessage(""); }} />
                  <button type="button" disabled={saving} aria-label={`${field.show ? "Hide" : "Show"} ${field.label.toLowerCase()}`}
                    aria-pressed={field.show} onClick={() => field.setShow(!field.show)}>
                    {field.show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="settingsSaveButton" type="submit" disabled={saving || !accountId}>
            {saving ? "RESETTING..." : "RESET PASSWORD"}
          </button>
        </form>
      )}
    </section>
  );
}
