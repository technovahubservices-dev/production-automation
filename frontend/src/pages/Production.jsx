import { calculateProductionTotals, formatProduction, formatTon, formatRmt } from "../context/productionUnits";
import { calculateDuration } from "./WorkEntry";
import { useSettings } from "../context/SettingsContext";
import { API_URL } from "../config/api";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Clock3,
  Factory,
  FolderKanban,
  Pencil,
  RefreshCw,
  Users,
} from "lucide-react";

const departments = [
  "CNC",
  "PTW",
  "SETTING",
  "WELDING",
  "CLEANING",
];

const departmentFields = {
  CNC: ["pageNo", "plateNo", "length", "width", "thickness", "plateWeight", "cuttingWeight", "cuttingTime"],
  PTW: ["drawingNo", "quantity", "weight"],
  SETTING: ["drawingNo", "quantity", "weight"],
  WELDING: ["rmt", "workDescription"],
  CLEANING: ["workDescription"],
};

const fieldLabels = {
  employeeName: "EMPLOYEE", date: "WORK DATE", department: "DEPARTMENT", project: "PROJECT", shift: "SHIFT", inTime: "IN TIME", outTime: "OUT TIME", remarks: "REMARKS",
  pageNo: "PAGE NO", plateNo: "PLATE NO", length: "LENGTH", width: "WIDTH", thickness: "THICKNESS", plateWeight: "PLATE WEIGHT", cuttingWeight: "CUTTING WEIGHT", cuttingTime: "CUTTING TIME",
  drawingNo: "DRAWING NO", quantity: "QUANTITY", weight: "WEIGHT", rmt: "RMT", workDescription: "WORK DESCRIPTION",
};

const numericFields = new Set(["length", "width", "thickness", "plateWeight", "cuttingWeight", "cuttingTime", "quantity", "weight", "rmt"]);

function createEditForm(entry) {
  const form = { ...entry };
  Object.keys(fieldLabels).forEach((field) => { form[field] = entry[field] ?? ""; });
  return form;
}

const getTodayDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

function Production({ user }) {
  const { settings } = useSettings();
  const isSuperAdmin = user?.role === "superadmin";
   const isAdmin = user?.role === "admin";
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] =
    useState(getTodayDate());
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editReason, setEditReason] = useState("");
 

  const openEdit = (entry) => {
    setEditingEntry(entry);
    setEditForm(createEditForm(entry));
    setEditError("");
    setEditReason("");
  };

  const closeEdit = () => {
    if (savingEdit) return;
    setEditingEntry(null);
    setEditForm(null);
    setEditError("");
    setEditReason("");
  };

  const saveEdit = async (event) => {
  event.preventDefault();

  if (!isSuperAdmin) {
    setEditError("Only Super Admin can edit work entries.");
    return;
  }

  if (!editReason.trim()) {
    setEditError("Reason for editing is required.");
    return;
  }

  try {
    setSavingEdit(true);
    setEditError("");

    const payload = {
      ...editForm,
      editReason: editReason.trim(),
    };

    delete payload.hours;
    // Old records can retain numeric hours until both times are supplied.
    if (!editingEntry.inTime && !editingEntry.outTime && !payload.inTime && !payload.outTime) {
      delete payload.inTime;
      delete payload.outTime;
    }

    Object.entries(payload).forEach(([key, value]) => {
      if (numericFields.has(key) && value !== "") {
        payload[key] = Number(value);
      }
    });

    const response = await fetch(
      `${API_URL}/api/work-entries/${editingEntry._id}`,
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },

        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
          "Unable to update work activity."
      );
    }

    setEntries((previous) =>
      previous.map((entry) =>
        entry._id === result.data._id
          ? result.data
          : entry
      )
    );

    setEditingEntry(null);
    setEditForm(null);
    setEditReason("");
  } catch (error) {
    setEditError(
      error.message ||
        "Unable to update work activity."
    );
  } finally {
    setSavingEdit(false);
  }
};

  
  const loadProduction = async () => {
    try {
      setLoading(true);

     const response = await fetch(
  `${API_URL}/api/work-entries?date=${isAdmin ? getTodayDate() : selectedDate}`,
  {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  }
);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to load production."
        );
      }

      setEntries(result.data || []);
    } catch (error) {
      console.error("Production load error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduction();
  }, [selectedDate]);

  const totalHours = useMemo(() => {
    return entries.reduce(
      (total, entry) =>
        total + Number(entry.hours || 0),
      0
    );
  }, [entries]);

  const activeWorkers = useMemo(() => {
    return new Set(
      entries.map((entry) => entry.employeeId)
    ).size;
  }, [entries]);

  const activeProjects = useMemo(() => {
    return new Set(
      entries
        .map((entry) => entry.project)
        .filter(Boolean)
    ).size;
  }, [entries]);

  const production = useMemo(() => calculateProductionTotals(entries), [entries]);

  const departmentData = useMemo(() => {
    return departments.map((department) => {
      const departmentEntries = entries.filter(
        (entry) =>
          entry.department === department
      );

      const workers = new Set(
        departmentEntries.map(
          (entry) => entry.employeeId
        )
      ).size;

      const hours = departmentEntries.reduce(
        (total, entry) =>
          total + Number(entry.hours || 0),
        0
      );

      const { value: output, unit } = production.departments[department];

      return {
        department,
        entries: departmentEntries.length,
        workers,
        hours,
        output,
        unit,
      };
    });
  }, [entries, production]);

  return (
    <main className="productionPage">
      <section className="productionPageHero">
        <div>
          <span className="productionEyebrow">
            LIVE / PRODUCTION CONTROL
          </span>

          <h1>
            Floor
            <br />
            <span>activity.</span>
          </h1>

          <p>
            Production information consolidated
            automatically from daily work entries.
          </p>
        </div>

        <div className="productionControls">
        <label>
  <span>REPORT DATE</span>

  <input
    type="date"
    value={
      isAdmin
        ? getTodayDate()
        : selectedDate
    }
    onChange={(event) =>
      setSelectedDate(event.target.value)
    }
    disabled={isAdmin}
  />
</label>

          <button
            type="button"
            onClick={loadProduction}
          >
            <RefreshCw size={16} />
            REFRESH
          </button>
        </div>
      </section>

      {loading ? (
        <div className="productionLoading">
          Loading production data...
        </div>
      ) : (
        <>
          <section className="productionMetrics">
            <div>
              <Activity size={18} />

              <span>TOTAL PRODUCTION</span>

              <strong>{formatTon(production.totalTon)}</strong>

              <small>{formatRmt(production.totalRmt)}</small>
            </div>

            <div>
              <Users size={18} />

              <span>ACTIVE WORKERS</span>

              <strong>{activeWorkers}</strong>

              <small>UNIQUE PEOPLE</small>
            </div>

            <div>
              <Clock3 size={18} />

              <span>WORK HOURS</span>

              <strong>{totalHours}</strong>

              <small>HOURS</small>
            </div>

            <div>
              <FolderKanban size={18} />

              <span>ACTIVE PROJECTS</span>

              <strong>{activeProjects}</strong>

              <small>PROJECTS</small>
            </div>
          </section>

          <section className="productionDepartmentSection">
            <div className="productionSectionTitle">
              <div>
                <span>
                  DEPARTMENT / BREAKDOWN
                </span>

                <h2>Production floor</h2>
              </div>

              <Factory size={22} />
            </div>

            <div className="productionDepartmentTable">
              <div className="productionTableHeader">
                <span>DEPARTMENT</span>
                <span>ENTRIES</span>
                <span>WORKERS</span>
                <span>HOURS</span>
                <span>OUTPUT</span>
              </div>

              {departmentData.map(
                (item, index) => (
                  <div
                    className="productionTableRow"
                    key={item.department}
                  >
                    <div className="productionDepartmentName">
                      <span>
                        {String(
                          index + 1
                        ).padStart(2, "0")}
                      </span>

                      <strong>
                        {item.department}
                      </strong>
                    </div>

                    <strong>
                      {item.entries}
                    </strong>

                    <strong>
                      {item.workers}
                    </strong>

                    <strong>
                      {item.hours}H
                    </strong>

                    <strong>
                      {item.department ===
                      "CLEANING"
                        ? "—"
                        : formatProduction({ value: item.output, unit: item.unit })}
                    </strong>
                  </div>
                )
              )}
            </div>
          </section>

          <section className="recentProduction">
            <div className="productionSectionTitle">
              <div>
                <span>
                  {isAdmin ? getTodayDate() : selectedDate} / ACTIVITY LOG
                </span>

                <h2>Recorded work</h2>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="emptyProduction">
                <Factory size={25} />

                <strong>
                  No production recorded
                </strong>

                <span>
                  There are no work entries for
                  this date.
                </span>
              </div>
            ) : (
              <div className="productionActivityList">
                {entries.map((entry) => (
                  <div
                    className="productionActivityRow"
                    key={entry._id}
                  >
                    <div>
                      <span>
                        {entry.employeeId}
                      </span>

                      <strong>
                        {entry.employeeName}
                      </strong>
                    </div>

                    <div>
                      <span>DEPARTMENT</span>
                      <strong>
                        {entry.department}
                      </strong>
                    </div>

                    <div>
                      <span>PROJECT</span>
                      <strong>
                        {entry.project || "—"}
                      </strong>
                    </div>

                    <div>
                      <span>SHIFT</span>
                      <strong>
                        {entry.shift}
                      </strong>
                    </div>

                    <div>
                      <span>HOURS</span>
                      <strong>
                      {entry.hours}H
                      </strong>
                    </div>
                    {isSuperAdmin && (
  <div className="productionActivityActions">
    <span>ACTIONS</span>

    <div>
      <button
        type="button"
        className="activityIconButton"
        aria-label={`Edit ${entry.employeeName} ${entry.department} activity`}
        title="Edit activity"
        onClick={() => openEdit(entry)}
      >
        <Pencil size={16} />
      </button>
    </div>
  </div>
)}
                    </div>
                 
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {editingEntry && editForm && (
        <div className="workEntryOverlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEdit(); }}>
          <form className="workEntryModal" onSubmit={saveEdit}>
            <div className="workEntryModalHeader"><div><span>PRODUCTION / EDIT ACTIVITY</span><h2>Edit work activity</h2></div><button type="button" aria-label="Close edit modal" onClick={closeEdit}>×</button></div>
            <div className="workEntryFormFields">
              {["employeeName", "date", "department", "project", "shift", "inTime", "outTime", "remarks", ...(departmentFields[editForm.department] || [])].map((field) => (
                <label key={field} className={field === "remarks" || field === "workDescription" ? "wide" : ""}>
                  <span>{fieldLabels[field]}</span>
                  {field === "department" ? <select value={editForm[field]} onChange={(event) => setEditForm((previous) => ({ ...previous, department: event.target.value }))}>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select>
                    : field === "shift" ? <select value={editForm[field]} onChange={(event) => setEditForm((previous) => ({ ...previous, [field]: event.target.value }))}>{[...new Set([editForm.shift, ...(settings?.shifts || []).map((shift) => shift.name)].filter(Boolean))].map((shift) => <option key={shift} value={shift}>{shift}</option>)}</select>
                    : <input type={field === "date" ? "date" : ["inTime", "outTime"].includes(field) ? "time" : numericFields.has(field) ? "number" : "text"} step={numericFields.has(field) ? "any" : undefined} min={numericFields.has(field) ? "0" : undefined} value={editForm[field]} onChange={(event) => setEditForm((previous) => ({ ...previous, [field]: event.target.value }))} required={["employeeName", "date", "department"].includes(field) || (["inTime", "outTime"].includes(field) && !!(editingEntry.inTime || editingEntry.outTime || editForm.inTime || editForm.outTime))} />}
                </label>
              ))}
              <label><span>WORK DURATION</span><strong>{!editForm.inTime && !editForm.outTime ? `${editingEntry.hours}h (recorded)` : calculateDuration(editForm.inTime, editForm.outTime).display}</strong></label>
            </div>
      <label className="workEntryEditReason">
  <span>REASON FOR EDIT *</span>

  <textarea
    rows={1}
    aria-describedby="work-entry-edit-reason-help"
    value={editReason}
    onChange={(event) =>
      setEditReason(event.target.value)
    }
    placeholder="Example: Wrong production weight"
    required
  />

  <small id="work-entry-edit-reason-help">
    This reason will be stored permanently in the audit history.
  </small>
</label>
            {editError && <div className="workEntryMessage error" role="alert">{editError}</div>}
            <div className="workEntryModalActions">
  <button
    type="button"
    className="secondary"
    onClick={closeEdit}
    disabled={savingEdit}
  >
    CANCEL
  </button>

  <button
    type="submit"
    className="primary"
    disabled={
      savingEdit ||
      !editReason.trim()
    }
  >
    {savingEdit
      ? "SAVING..."
      : "SAVE CHANGES"}
  </button>
</div>
          </form>
        </div>
      )}
      
    </main>
  );
}

export default Production;
