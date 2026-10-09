import { useSettings } from "../context/SettingsContext";
import PasswordManagement from "../components/PasswordManagement";
import { API_URL } from "../config/api";
import { useEffect, useState } from "react";
import {
  Building2,
  Factory,
  Clock3,
  Ruler,
  FileText,
  Save,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";




function Settings({ user }) {
  const [settings, setSettings] = useState(null);

  const { settings: sharedSettings, loading, error: loadError, updateSettings, refreshSettings } = useSettings();
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { if (sharedSettings) setSettings(sharedSettings); }, [sharedSettings]);

  const handleBasicChange = (event) => {
    const { name, value } = event.target;

    setSettings((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleDepartmentToggle = (index) => {
    setSettings((previous) => ({
      ...previous,

      departments: previous.departments.map((department, departmentIndex) =>
        departmentIndex === index
          ? {
              ...department,
              active: !department.active,
            }
          : department
      ),
    }));
  };

  const handleDepartmentUnit = (index, value) => {
    setSettings((previous) => ({
      ...previous,

      departments: previous.departments.map((department, departmentIndex) =>
        departmentIndex === index
          ? {
              ...department,
              unit: value,
            }
          : department
      ),
    }));
  };

  const handleShiftChange = (index, field, value) => {
    setSettings((previous) => ({
      ...previous,

      shifts: previous.shifts.map((shift, shiftIndex) =>
        shiftIndex === index
          ? {
              ...shift,
              [field]: value,
            }
          : shift
      ),
    }));
  };

  const handleReportChange = (event) => {
    const { name, value, type, checked } = event.target;

    setSettings((previous) => ({
      ...previous,

      reportPreferences: {
        ...previous.reportPreferences,

        [name]: type === "checkbox" ? checked : value,
      },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage("");
      setError("");

      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },

        body: JSON.stringify({
          companyName: settings.companyName,
          plantName: settings.plantName,
          departments: settings.departments,
          shifts: settings.shifts,
          reportPreferences: settings.reportPreferences,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to save settings.");
      }

      setSettings(result.data);
      updateSettings(result.data);
      setMessage("Settings saved successfully.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settingsPage">
        <div className="settingsLoading">
          Loading production settings...
        </div>
      </div>
    );
  }

  if (!settings) return <div role="alert">{loadError || "Settings unavailable."} <button onClick={refreshSettings}>Retry</button></div>;

  return (
    <div className="settingsPage">
      <section className="settingsHero">
        <div>
          <p className="settingsEyebrow">SYSTEM / CONFIGURATION</p>

          <h1>
            Production
            <br />
            settings.
          </h1>

          <p className="settingsIntro">
            Configure plant information, departments, shifts,
            production units and daily report preferences.
          </p>
        </div>

        <button
          type="button"
          className="settingsSaveButton"
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={17} />

          {saving ? "SAVING..." : "SAVE SETTINGS"}
        </button>
      </section>

      {message && (
        <div className="settingsMessage settingsMessageSuccess">
          <CheckCircle2 size={17} />
          {message}
        </div>
      )}

      {error && (
        <div className="settingsMessage settingsMessageError">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      <div className="settingsGrid">
        {/* COMPANY */}

        <section className="settingsSection">
          <div className="settingsSectionHeader">
            <span className="settingsNumber">01</span>

            <div className="settingsSectionIcon">
              <Building2 size={19} />
            </div>

            <div>
              <p>COMPANY / PLANT</p>
              <h2>Facility information</h2>
            </div>
          </div>

          <div className="settingsFormGrid">
            <label className="settingsField">
              <span>COMPANY NAME</span>

              <input
                type="text"
                name="companyName"
                value={settings.companyName || ""}
                onChange={handleBasicChange}
              />
            </label>

            <label className="settingsField">
              <span>PLANT / SITE NAME</span>

              <div className="settingsInputWithIcon">
                <Factory size={16} />

                <input
                  type="text"
                  name="plantName"
                  value={settings.plantName || ""}
                  onChange={handleBasicChange}
                />
              </div>
            </label>
          </div>
        </section>

        {/* DEPARTMENTS */}

        <section className="settingsSection">
          <div className="settingsSectionHeader">
            <span className="settingsNumber">02</span>

            <div>
              <p>PRODUCTION / DEPARTMENTS</p>
              <h2>Department configuration</h2>
            </div>
          </div>

          <div className="settingsDepartmentList">
            {settings.departments?.map((department, index) => (
              <div
                className="settingsDepartmentRow"
                key={department._id || department.name}
              >
                <div>
                  <strong>{department.name}</strong>

                  <span>
                    {department.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>

                <button
                  type="button"
                  className={`settingsToggle ${
                    department.active ? "active" : ""
                  }`}
                  onClick={() => handleDepartmentToggle(index)}
                  aria-pressed={department.active}
                >
                  <span />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SHIFTS */}

        <section className="settingsSection">
          <div className="settingsSectionHeader">
            <span className="settingsNumber">03</span>

            <div className="settingsSectionIcon">
              <Clock3 size={19} />
            </div>

            <div>
              <p>WORKFORCE / SHIFTS</p>
              <h2>Shift timings</h2>
            </div>
          </div>

          <div className="settingsShiftList">
            {settings.shifts?.map((shift, index) => (
              <div
                className="settingsShiftRow"
                key={shift._id || shift.name}
              >
                <strong>{shift.name}</strong>

                <label>
                  <span>START</span>

                  <input
                    type="time"
                    value={shift.startTime || ""}
                    onChange={(event) =>
                      handleShiftChange(
                        index,
                        "startTime",
                        event.target.value
                      )
                    }
                  />
                </label>

                <span className="settingsShiftArrow">→</span>

                <label>
                  <span>END</span>

                  <input
                    type="time"
                    value={shift.endTime || ""}
                    onChange={(event) =>
                      handleShiftChange(
                        index,
                        "endTime",
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* UNITS */}

        <section className="settingsSection">
          <div className="settingsSectionHeader">
            <span className="settingsNumber">04</span>

            <div className="settingsSectionIcon">
              <Ruler size={19} />
            </div>

            <div>
              <p>PRODUCTION / UNITS</p>
              <h2>Measurement units</h2>
            </div>
          </div>

          <div className="settingsUnitsList">
            {settings.departments?.map((department, index) => (
              <div
                className="settingsUnitRow"
                key={department._id || department.name}
              >
                <strong>{department.name}</strong>

                <select
                  value={department.unit || ""}
                  onChange={(event) =>
                    handleDepartmentUnit(index, event.target.value)
                  }
                >
                  <option value="">NO UNIT</option>
                  <option value="KG">KG</option>
                  <option value="TON">TON</option>
                  <option value="PCS">PCS</option>
                  <option value="RMT">RMT</option>
                  <option value="PCS">PCS</option>
                  <option value="TON">TON</option>
                </select>
              </div>
            ))}
          </div>
        </section>

        {/* REPORT */}

        <section className="settingsSection settingsSectionWide">
          <div className="settingsSectionHeader">
            <span className="settingsNumber">05</span>

            <div className="settingsSectionIcon">
              <FileText size={19} />
            </div>

            <div>
              <p>REPORT / PREFERENCES</p>
              <h2>Daily report configuration</h2>
            </div>
          </div>

          <div className="settingsReportGrid">
            <label className="settingsField">
              <span>REPORT TITLE</span>

              <input
                type="text"
                name="reportTitle"
                value={
                  settings.reportPreferences?.reportTitle || ""
                }
                onChange={handleReportChange}
              />
            </label>

            <div className="settingsReportOptions">
              <label>
                <input
                  type="checkbox"
                  name="showEmployeeId"
                  checked={
                    settings.reportPreferences?.showEmployeeId ??
                    true
                  }
                  onChange={handleReportChange}
                />

                <span>Show Employee ID</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  name="showProject"
                  checked={
                    settings.reportPreferences?.showProject ?? true
                  }
                  onChange={handleReportChange}
                />

                <span>Show Project</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  name="showRemarks"
                  checked={
                    settings.reportPreferences?.showRemarks ?? true
                  }
                  onChange={handleReportChange}
                />

                <span>Show Remarks</span>
              </label>
            </div>
          </div>
        </section>
        {user?.role === "superadmin" && <PasswordManagement />}
      </div>
    </div>
  );
}

export default Settings;
