import { useSettings } from "../context/SettingsContext";
import { API_URL } from "../config/api";
import { useEffect, useMemo, useState } from "react";

import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Factory,
  Plus,
  UserRound,
} from "lucide-react";

/* =========================================
   WORKERS
========================================= */

const workers = [
  { id: "EMP001", name: "Abinesh" },
  { id: "EMP002", name: "Kumar" },
  { id: "EMP003", name: "Arun" },
  { id: "EMP004", name: "Suresh" },
  { id: "EMP005", name: "Prakash" },
  { id: "EMP006", name: "Vignesh" },
  { id: "EMP007", name: "Manoj" },
];

/* =========================================
   DEPARTMENTS
========================================= */



const getTodayDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

/* =========================================
   REUSABLE INPUT
========================================= */

function InputField({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder = "",
  suffix = "",
}) {
  return (
    <label className="entryField">
      <span>{label}</span>

      <div className="inputWithSuffix">
        <input
          type={type}
          name={name}
          value={value ?? ""}
          onChange={onChange}
          placeholder={placeholder}
        />

        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

/* =========================================
   WORK ENTRY PAGE
========================================= */
export const calculateDuration = (inTime, outTime) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(inTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(outTime)) {
    return {
      hours: "",
      display: "—",
    };
  }

  const [inHour, inMinute] = inTime.split(":").map(Number);
  const [outHour, outMinute] = outTime.split(":").map(Number);

  let startMinutes = inHour * 60 + inMinute;
  let endMinutes = outHour * 60 + outMinute;

  // Overnight / Night shift
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  const totalMinutes = endMinutes - startMinutes;

  if (totalMinutes <= 0) {
    return {
      hours: "",
      display: "—",
    };
  }

  return {
    hours: Number((totalMinutes / 60).toFixed(2)),
    display: `${Math.floor(totalMinutes / 60)}h ${
      totalMinutes % 60
    }m`,
  };
};
function WorkEntry({ user }) {
  const { settings, loading: settingsLoading, error: settingsError, unitFor } = useSettings();
  const isAdmin = user?.role === "admin";
const today = getTodayDate();
  const departments = (settings?.departments || []).filter((d) => d.active === true).map((d, i) => ({ ...d, number: String(i + 1).padStart(2, "0") }));
  const shifts = settings?.shifts || [];

  const [employee, setEmployee] = useState("");

  const [department, setDepartment] = useState("");

  const [savedActivities, setSavedActivities] = useState([]);

  const [loadingActivities, setLoadingActivities] =
    useState(true);

  const [savingActivity, setSavingActivity] =
    useState(false);

  const [formData, setFormData] = useState(() => ({
    date: getTodayDate(),

    shift: "",

    project: "",

inTime: "",
outTime: "",
    // CNC
    pageNo: "",
    plateNo: "",
    length: "",
    width: "",
    thickness: "",
    plateWeight: "",
    cuttingWeight: "",
    cuttingTime: "",

    // PTW / SETTING
    drawingNo: "",
    quantity: "",
    weight: "",

    // WELDING
    rmt: "",

    // WELDING / CLEANING
    workDescription: "",

    remarks: "",
  }));
   const calculatedDuration = calculateDuration(
    formData.inTime,
    formData.outTime
  );


  /* =========================================
     LOAD SAVED MONGODB ENTRIES
  ========================================= */

  useEffect(() => {
    const loadActivities = async () => {
      try {
        setLoadingActivities(true);

        const response = await fetch(
          `${API_URL}/api/work-entries`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.message ||
              "Unable to load production records."
          );
        }

        setSavedActivities(result.data || []);
      } catch (error) {
        console.error(
          "Load production records error:",
          error
        );
      } finally {
        setLoadingActivities(false);
      }
    };

    loadActivities();
  }, []);

  /* =========================================
     HANDLE INPUT
  ========================================= */

  useEffect(() => {
    if (!settings?.departments.some((d) => d.name === department && d.active === true)) setDepartment("");
    setFormData((previous) => settings?.shifts.some((shift) => shift.name === previous.shift) ? previous : { ...previous, shift: settings?.shifts[0]?.name || "" });
  }, [settings, department]);
  const selectedShift = shifts.find((shift) => shift.name === formData.shift);
  const configurationValid = !settingsLoading && !settingsError && departments.some((d) => d.name === department) && !!selectedShift;

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  /* =========================================
     SELECTED WORKER
  ========================================= */

  const selectedWorker = workers.find(
    (worker) => worker.id === employee
  );

  /* =========================================
     EMPLOYEE ACTIVITIES FOR SELECTED DATE
  ========================================= */

  const employeeActivities = useMemo(() => {
    return savedActivities.filter(
      (activity) =>
        activity.employeeId === employee &&
        activity.date === formData.date
    );
  }, [
    savedActivities,
    employee,
    formData.date,
  ]);

  /* =========================================
     TOTAL HOURS
  ========================================= */

  const previouslyRecordedHours =
    employeeActivities.reduce(
      (total, activity) =>
        total + Number(activity.hours || 0),
      0
    );

  const currentHours = Number(
    calculatedDuration.hours || 0
  );

  const projectedHours =
    previouslyRecordedHours + currentHours;

  /* =========================================
     RESET DEPARTMENT FIELDS
  ========================================= */

  const resetActivityFields = () => {
    setFormData((previous) => ({
      ...previous,

      inTime: "",
      outTime: "",

      pageNo: "",
      plateNo: "",
      length: "",
      width: "",
      thickness: "",
      plateWeight: "",
      cuttingWeight: "",
      cuttingTime: "",

      drawingNo: "",
      quantity: "",
      weight: "",

      rmt: "",

      workDescription: "",

      remarks: "",
    }));
  };

  /* =========================================
     SAVE TO MONGODB
  ========================================= */

  const saveActivity = async () => {
    if (!configurationValid) { alert("Select an active department and configured shift before saving."); return; }
    if (!employee) {
      alert("Please select a worker.");
      return;
    }

    if (!formData.date) {
      alert("Please select the work date.");
      return;
    }

    if (!department) {
      alert("Please select a department.");
      return;
    }

   if (!formData.inTime || !formData.outTime) {
  alert("Please enter In Time and Out Time.");
  return;
}

if (!calculatedDuration.hours) {
  alert("Please enter valid In Time and Out Time.");
  return;
}
    if (isAdmin && formData.date !== today) {
  alert("Admin can only create work entries for today.");
  return;
}

    const activity = {
  employeeId: employee,
  employeeName: selectedWorker?.name,
  department,

  ...formData,


};

    try {
      setSavingActivity(true);

      const response = await fetch(
        `${API_URL}/api/work-entries`,
        {
          method: "POST",

          headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
},
          body: JSON.stringify(activity),
        }
      );

      const result = await response.json();

      if (!response.ok || result.success !== true || !result.data?._id) {
        alert(
          result.message ||
            "Unable to save work activity."
        );

        return;
      }

      setSavedActivities((previous) => [
        result.data,
        ...previous,
      ]);

      resetActivityFields();

      alert("Work activity saved successfully.");
    } catch (error) {
      console.error(
        "Save work activity error:",
        error
      );

      alert(
        "Cannot connect to the backend. Make sure the backend is running on port 5000."
      );
    } finally {
      setSavingActivity(false);
    }
  };

  /* =========================================
     UI
  ========================================= */

  return (
    <main className="smartEntryPage">

      {/* ===============================
          HEADER
      =============================== */}

      <section className="entryHero">
        <div>
          <span className="entryEyebrow">
            PRODUCTION / SMART ENTRY
          </span>

          <h1>
            Record the
            <br />

            <span>work.</span>
          </h1>

          <p>
            One worker can record activity across
            multiple production departments while the
            system automatically consolidates their
            daily working hours.
          </p>
        </div>

      </section>

      {/* ===============================
          STEP 01 - WORKER
      =============================== */}

      <section className="entryStep">
        <div className="entryStepNumber">
          01
        </div>

        <div className="entryStepContent">
          <div className="entryStepHeading">
            <div>
              <span>WORKFORCE</span>

              <h2>Who's working?</h2>
            </div>

            <UserRound size={22} />
          </div>

          <div className="employeeSelector">
            <select
              value={employee}
              onChange={(event) =>
                { setEmployee(event.target.value); resetActivityFields(); }
              }
            >
              <option value="">
                Select employee
              </option>

              {workers.map((worker) => (
                <option
                  key={worker.id}
                  value={worker.id}
                >
                  {worker.id} - {worker.name}
                </option>
              ))}
            </select>

            <ChevronDown size={18} />
          </div>

          <label className="entryDateBlock">
            <CalendarDays size={20} />

            <div>
              <span>WORK DATE *</span>

              <input
  type="date"
  name="date"
  value={isAdmin ? today : formData.date}
  onChange={handleChange}
  disabled={isAdmin}
  required
/>
            </div>
          </label>

          {selectedWorker && (
            <div className="selectedEmployee">
              <div className="selectedEmployeeAvatar">
                {selectedWorker.name.charAt(0)}
              </div>

              <div>
                <span>
                  {selectedWorker.id}
                </span>

                <strong>
                  {selectedWorker.name}
                </strong>
              </div>

              <div className="selectedEmployeeHours">
                <span>
                  RECORDED TODAY
                </span>

                <strong>
                  {previouslyRecordedHours}H
                </strong>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===============================
          STEP 02 - DEPARTMENT
      =============================== */}

      <section className="entryStep">
        <div className="entryStepNumber">
          02
        </div>

        <div className="entryStepContent">
          <div className="entryStepHeading">
            <div>
              <span>
                PRODUCTION FLOOR
              </span>

              <h2>
                Where did they work?
              </h2>
            </div>

            <Factory size={22} />
          </div>

          {settingsLoading ? <p role="status">Loading settings...</p> : settingsError ? <p role="alert">{settingsError}</p> : departments.length === 0 ? <p role="status">No active departments are currently available.</p> : null}
          <div className="entryDepartmentGrid">
            {departments.map((item) => (
              <button
                key={item.name}
                type="button"
                className={`entryDepartment ${
                  department === item.name
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setDepartment(item.name)
                }
              >
                <span>
                  {item.number}
                </span>

                <strong>
                  {item.name}
                </strong>

                {department ===
                  item.name && (
                  <div className="departmentCheck">
                    <Check size={13} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ===============================
          STEP 03 - DETAILS
      =============================== */}

      <section className="entryStep">
        <div className="entryStepNumber">
          03
        </div>

        <div className="entryStepContent">
          <div className="entryStepHeading">
            <div>
              <span>
                {department} ACTIVITY
              </span>

              <h2>
                Enter production details
              </h2>
            </div>

            <Clock3 size={22} />
          </div>

          <div className="entryForm">

            {/* COMMON */}

            <InputField
              label="PROJECT"
              name="project"
              value={formData.project}
              onChange={handleChange}
              placeholder="Project name"
            />

            <label className="entryField">
              <span>SHIFT</span>

              <select
                name="shift"
                value={formData.shift}
                onChange={handleChange}
              >
                <option value="">Select shift</option>
                {shifts.map((shift) => <option key={shift.name} value={shift.name}>{shift.name}</option>)}
              </select>
              {selectedShift && <small>{selectedShift.startTime} - {selectedShift.endTime}</small>}
            </label>

            <InputField
  label="IN TIME"
  name="inTime"
  value={formData.inTime}
  onChange={handleChange}
  type="time"
/>

<InputField
  label="OUT TIME"
  name="outTime"
  value={formData.outTime}
  onChange={handleChange}
  type="time"
/>

<label className="entryField">
  <span>WORK DURATION</span>

  <input
    type="text"
    value={calculatedDuration.display}
    readOnly
  />
</label>

            {/* ===========================
                CNC
            =========================== */}

            {department === "CNC" && (
              <>
                <InputField
                  label="PAGE NO."
                  name="pageNo"
                  value={formData.pageNo}
                  onChange={handleChange}
                  placeholder="Page number"
                />

                <InputField
                  label="PLATE NO."
                  name="plateNo"
                  value={formData.plateNo}
                  onChange={handleChange}
                  placeholder="Plate number"
                />

                <InputField
                  label="LENGTH"
                  name="length"
                  value={formData.length}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix="MM"
                />

                <InputField
                  label="WIDTH"
                  name="width"
                  value={formData.width}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix="MM"
                />

                <InputField
                  label="THICKNESS"
                  name="thickness"
                  value={formData.thickness}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix="MM"
                />

                <InputField
                  label="PLATE WEIGHT"
                  name="plateWeight"
                  value={formData.plateWeight}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix={unitFor(department)}
                />

                <InputField
                  label="JOB CUTTING WEIGHT"
                  name="cuttingWeight"
                  value={formData.cuttingWeight}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix={unitFor(department)}
                />

                <InputField
                  label="CUTTING RUNNING TIME"
                  name="cuttingTime"
                  value={formData.cuttingTime}
                  onChange={handleChange}
                  placeholder="Example: 02:30"
                />
              </>
            )}

            {/* ===========================
                PTW
            =========================== */}

            {department === "PTW" && (
              <>
                <InputField
                  label="DRAWING NO."
                  name="drawingNo"
                  value={formData.drawingNo}
                  onChange={handleChange}
                  placeholder="Drawing number"
                />

                <InputField
                  label="QUANTITY"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix="NOS"
                />

                <InputField
                  label="WEIGHT"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix={unitFor(department)}
                />
              </>
            )}

            {/* ===========================
                SETTING
            =========================== */}

            {department ===
              "SETTING" && (
              <>
                <InputField
                  label="DRAWING NO."
                  name="drawingNo"
                  value={formData.drawingNo}
                  onChange={handleChange}
                  placeholder="Drawing number"
                />

                <InputField
                  label="QUANTITY"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix="NOS"
                />

                <InputField
                  label="WEIGHT"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix={unitFor(department)}
                />
              </>
            )}

            {/* ===========================
                WELDING
            =========================== */}

            {department ===
              "WELDING" && (
              <>
                <InputField
                  label="WELDING OUTPUT"
                  name="rmt"
                  value={formData.rmt}
                  onChange={handleChange}
                  type="number"
                  placeholder="0"
                  suffix={unitFor(department)}
                />

                <InputField
                  label="WORK DESCRIPTION"
                  name="workDescription"
                  value={
                    formData.workDescription
                  }
                  onChange={handleChange}
                  placeholder="Welding activity"
                />
              </>
            )}

            {/* ===========================
                CLEANING
            =========================== */}

            {department ===
              "CLEANING" && (
              <InputField
                label="WORK DESCRIPTION"
                name="workDescription"
                value={
                  formData.workDescription
                }
                onChange={handleChange}
                placeholder="Cleaning activity"
              />
            )}

            {/* REMARKS */}

            <label className="entryField entryRemarks">
              <span>REMARKS</span>

              <textarea
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Optional remarks..."
              />
            </label>
          </div>

          {/* ===============================
              HOURS PREVIEW
          =============================== */}

          {selectedWorker &&
            currentHours > 0 && (
              <div className="hourPreview">
                <div>
                  <span>
                    {selectedWorker.name.toUpperCase()}{" "}
                    / DAILY HOURS
                  </span>

                  <strong>
                    {previouslyRecordedHours}H
                    <small>
                      {" "}
                      PREVIOUS
                    </small>

                    {" + "}

                    {currentHours}H

                    <small>
                      {" "}
                      CURRENT
                    </small>
                  </strong>
                </div>

                <div>
                  <span>
                    AFTER SAVE
                  </span>

                  <strong>
                    {projectedHours}H
                  </strong>
                </div>
              </div>
            )}

          {/* ===============================
              SAVE
          =============================== */}

          <div className="entryActions">
            <button
              type="button"
              className="saveActivityButton"
              onClick={saveActivity}
              disabled={savingActivity || !configurationValid}
            >
              <Plus size={18} />

              {savingActivity
                ? "SAVING..."
                : "ADD WORK ACTIVITY"}
            </button>
          </div>
        </div>
      </section>

      {/* ===============================
          LOADING
      =============================== */}

      {loadingActivities && (
        <div className="entryLoading">
          Loading production records...
        </div>
      )}

      {/* ===============================
          EMPLOYEE DAILY SUMMARY
      =============================== */}

      {!loadingActivities &&
        selectedWorker &&
        employeeActivities.length >
          0 && (
          <section className="recordedActivities">
            <div className="recordedHeader">
              <div>
                <span>
                  AUTOMATIC SUMMARY /{" "}
                  {formData.date}
                </span>

                <h2>
                  {selectedWorker.name}'s
                  work today
                </h2>
              </div>

              <strong>
                {previouslyRecordedHours}H
                TOTAL
              </strong>
            </div>

            <div className="recordedList">
              {employeeActivities.map(
                (activity, index) => (
                  <div
                    className="recordedActivity"
                    key={
                      activity._id ||
                      activity.id
                    }
                  >
                    <span>
                      {String(
                        index + 1
                      ).padStart(2, "0")}
                    </span>

                    <div>
                      <small>
                        DEPARTMENT
                      </small>

                      <strong>
                        {
                          activity.department
                        }
                      </strong>
                    </div>

                    <div>
                      <small>
                        PROJECT
                      </small>

                      <strong>
                        {activity.project ||
                          "-"}
                      </strong>
                    </div>

                    <div>
                      <small>
                        SHIFT
                      </small>

                      <strong>
                        {activity.shift}
                      </strong>
                    </div>

                    <div>
                      <small>
                        HOURS
                      </small>

                      <strong>
                        {activity.hours}H
                      </strong>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}
    </main>
  );
}

export default WorkEntry;
