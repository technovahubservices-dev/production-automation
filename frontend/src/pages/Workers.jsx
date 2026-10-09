import { getLocalDate, getPeriodRange, activityMinutes, formatMinutes, summarizeWorkers } from "../utils/attendance";
import { API_URL } from "../config/api";
import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Layers3,
  Search,
  UserRound,
  Users as UsersIcon,
  X,
} from "lucide-react";

const emptyEntries = [];

function groupHistoryByDate(activities) {
  // Derive display rows while retaining the original activities for summary cards.
  const days = new Map();
  activities.forEach((activity) => {
    if (!days.has(activity.date)) {
      days.set(activity.date, { date: activity.date, departments: new Map(), totalMinutes: 0 });
    }
    const day = days.get(activity.date);
    if (activity.department) {
      day.departments.set(activity.department, (day.departments.get(activity.department) || 0) + 1);
    }
    day.totalMinutes += activityMinutes(activity);
  });
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function Workers({ user }) {
  const isSuperAdmin = user?.role === "superadmin";
  const [result, setResult] = useState({ key: "", entries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("today");
  const [fromDate, setFromDate] = useState(getLocalDate);
  const [toDate, setToDate] = useState(getLocalDate);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const activePeriod = isSuperAdmin ? period : "today";
  const range = activePeriod === "custom" ? { fromDate, toDate } : getPeriodRange(activePeriod);
  const validRange = !!range.fromDate && !!range.toDate && range.fromDate <= range.toDate;
  const requestKey = `${user?._id || user?.id || ""}:${user?.role}:${range.fromDate}:${range.toDate}`;
  const entries = result.key === requestKey ? result.entries : emptyEntries;
  const selectedDate = range.fromDate === range.toDate ? range.fromDate : `${range.fromDate} \u2192 ${range.toDate}`;

  useEffect(() => {
    const controller = new AbortController();
    if (!validRange) return () => controller.abort();
    const loadWorkers = async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams(isSuperAdmin
          ? { fromDate: range.fromDate, toDate: range.toDate }
          : { date: range.fromDate });
        const response = await fetch(`${API_URL}/api/work-entries?${query}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to load workers.");
        if (!controller.signal.aborted) setResult({ key: requestKey, entries: data.data || [] });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, entries: [] });
          setError(error.message || "Unable to load workers.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadWorkers();
    return () => controller.abort();
  }, [requestKey, range.fromDate, range.toDate, validRange, isSuperAdmin]);

  const workers = useMemo(() => summarizeWorkers(entries), [entries]);
  const selectedWorker = workers.find((worker) => worker.employeeId === selectedWorkerId);
  const dailyHistory = useMemo(
    () => groupHistoryByDate(selectedWorker?.activities || emptyEntries),
    [selectedWorker]
  );
  const setSelectedWorker = (worker) => setSelectedWorkerId(worker?.employeeId || null);

  const filteredWorkers = useMemo(() => {
    const value = search.toLowerCase().trim();

    if (!value) return workers;

    return workers.filter(
      (worker) =>
        worker.employeeName?.toLowerCase().includes(value) ||
        worker.employeeId?.toLowerCase().includes(value)
    );
  }, [workers, search]);

  const totalHours = workers.reduce(
    (total, worker) => total + worker.totalMinutes,
    0
  );

  return (
    <main className="workersPage">
      <section className="workersPageHero">
        <div>
          <span className="workersEyebrow">WORKFORCE / DAILY ACTIVITY</span>

          <h1>
            People
            <br />
            <span>on the floor.</span>
          </h1>

          <p>
            Worker activity consolidated across every production department.
          </p>
        </div>

        <div className="workersDateControl">
          <label>
            <span>PERIOD</span>
            <select value={activePeriod} disabled={!isSuperAdmin} onChange={(event) => setPeriod(event.target.value)}>
              <option value="today">Today</option>
              {isSuperAdmin && <>
                <option value="week">This Week</option>
                <option value="lastWeek">Last Week</option>
                <option value="month">This Month</option>
                <option value="custom">Custom Range</option>
              </>}
            </select>
          </label>
          {activePeriod === "custom" && <>
            <label><span>FROM DATE</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
            <label><span>TO DATE</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
          </>}
          <small>{selectedDate}</small>
        </div>
      </section>

      <section className="workersMetrics">
        <div>
          <UsersIcon size={18} />
          <span>ACTIVE WORKERS</span>
          <strong>{workers.length}</strong>
          <small>UNIQUE EMPLOYEES</small>
        </div>

        <div>
          <Clock3 size={18} />
          <span>TOTAL WORK TIME</span>
          <strong>{formatMinutes(totalHours)}</strong>
          <small>HOURS / MINUTES</small>
        </div>

        <div>
          <Layers3 size={18} />
          <span>WORK ENTRIES</span>
          <strong>{entries.length}</strong>
          <small>ACTIVITIES</small>
        </div>
      </section>

      <section className="workersDirectory">
        <div className="workersDirectoryHeader">
          <div>
            <span>{selectedDate} / WORKFORCE</span>
            <h2>Worker directory</h2>
          </div>

          <div className="workersSearch">
            <Search size={17} />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Employee ID or Name..."
            />
          </div>
        </div>

        {!validRange ? (
          <div className="workersEmpty" role="alert">Select From Date and To Date, with From Date on or before To Date.</div>
        ) : error ? (
          <div className="workersEmpty" role="alert">{error}</div>
        ) : loading ? (
          <div className="workersEmpty">Loading workers...</div>
        ) : filteredWorkers.length === 0 ? (
          <div className="workersEmpty">
            <UserRound size={25} />
            <strong>No workers found</strong>
            <span>No work activities match this worker search and period.</span>
          </div>
        ) : (
          <div className="workersGrid">
            {filteredWorkers.map((worker) => (
              <button
                type="button"
                className="workerDirectoryCard"
                key={worker.employeeId}
                onClick={() => setSelectedWorker(worker)}
              >
                <div className="workerDirectoryTop">
                  <div className="workerDirectoryAvatar">
                    {worker.employeeName?.charAt(0) || "W"}
                  </div>

                  <span>{worker.employeeId}</span>
                </div>

                <h3>{worker.employeeName}</h3>

                <div className="workerDirectoryStats">
                  <div>
                    <span>WORK TIME</span>
                    <strong>{formatMinutes(worker.totalMinutes)}</strong>
                  </div>

                  <div>
                    <span>DEPARTMENTS</span>
                    <strong>{worker.departments.length}</strong>
                  </div>

                </div>

                <div className="workerDepartmentTags">
                  {worker.departments.map((department) => (
                    <span key={department}>{department}</span>
                  ))}
                </div>

              </button>
            ))}
          </div>
        )}
      </section>

      {selectedWorker && (
        <div
          className="workersPanelOverlay"
          onClick={() => setSelectedWorker(null)}
        >
          <aside
            className="workersDetailPanel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="workersPanelHeader">
              <span>EMPLOYEE / WORK RECORD</span>

              <button
                type="button"
                onClick={() => setSelectedWorker(null)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="workersPanelProfile">
              <div className="workersLargeAvatar">
                {selectedWorker.employeeName?.charAt(0)}
              </div>

              <div>
                <span>{selectedWorker.employeeId}</span>
                <h2>{selectedWorker.employeeName}</h2>
                <small>{selectedDate}</small>
              </div>
            </div>

            <div className="workersPanelStats">
              <div>
                <span>TOTAL WORK TIME</span>
                <strong>{formatMinutes(selectedWorker.totalMinutes)}</strong>
              </div>

              <div>
                <span>WORKED DAYS</span>
                <strong>{selectedWorker.workedDays}</strong>
              </div>

            </div>


            <div className="workersActivityHistory">
              <div className="workersActivityTitle">
                <span>WORK HISTORY</span>
                <h3>Production activity</h3>
              </div>

              <div className="workersHistoryTableContainer" role="region" aria-label="Worker work history" tabIndex={0}>
                <table className="workersHistoryTable" style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      {["DATE", "DEPARTMENT(S)", "TOTAL HOURS"].map((heading) => (
                        <th key={heading} scope="col">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dailyHistory.map((day) => (
                      <tr key={day.date}>
                        <td>{day.date.split("-").reverse().join("-")}</td>
                        <td>{[...day.departments].map(([department, count]) => `${department} (${count})`).join(" / ") || "\u2014"}</td>
                        <td>{formatMinutes(day.totalMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

export default Workers;
