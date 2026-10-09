import { useSettings } from "../context/SettingsContext";
import { API_URL } from "../config/api";
import { useEffect, useMemo, useState } from "react";

import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  FolderKanban,
  Search,
  Users,
  X,
} from "lucide-react";

function Department({ department, onBack }) {
  const { unitFor } = useSettings();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedWorker, setSelectedWorker] = useState(null);

  const [selectedDate, setSelectedDate] =
    useState("2026-09-30");

  /* =========================================
     LOAD DEPARTMENT DATA
  ========================================= */

  useEffect(() => {
    const loadDepartment = async () => {
      try {
        setLoading(true);

        const response = await fetch(
          `${API_URL}/api/work-entries?date=${selectedDate}&department=${encodeURIComponent(
            department
          )}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.message || "Unable to load department."
          );
        }

        setEntries(result.data || []);
      } catch (error) {
        console.error("Department load error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDepartment();
  }, [department, selectedDate]);

  /* =========================================
     UNIQUE WORKERS
  ========================================= */

  const workers = useMemo(() => {
    const workerMap = {};

    entries.forEach((entry) => {
      if (!workerMap[entry.employeeId]) {
        workerMap[entry.employeeId] = {
          employeeId: entry.employeeId,
          employeeName: entry.employeeName,
          totalHours: 0,
          activities: [],
          projects: new Set(),
        };
      }

      workerMap[entry.employeeId].totalHours +=
        Number(entry.hours || 0);

      workerMap[entry.employeeId].activities.push(entry);

      if (entry.project) {
        workerMap[entry.employeeId].projects.add(entry.project);
      }
    });

    return Object.values(workerMap).map((worker) => ({
      ...worker,
      projects: [...worker.projects],
    }));
  }, [entries]);

  /* =========================================
     SEARCH
  ========================================= */

  const filteredWorkers = useMemo(() => {
    const searchValue = search.toLowerCase().trim();

    if (!searchValue) {
      return workers;
    }

    return workers.filter(
      (worker) =>
        worker.employeeName
          ?.toLowerCase()
          .includes(searchValue) ||
        worker.employeeId
          ?.toLowerCase()
          .includes(searchValue)
    );
  }, [workers, search]);

  /* =========================================
     SUMMARY
  ========================================= */

  const totalHours = entries.reduce(
    (total, entry) =>
      total + Number(entry.hours || 0),
    0
  );

  const projects = new Set(
    entries
      .map((entry) => entry.project)
      .filter(Boolean)
  ).size;

  /* =========================================
     OUTPUT
  ========================================= */

  const totalOutput = useMemo(() => {
    if (department === "CNC") {
      const value = entries.reduce(
        (total, entry) =>
          total + Number(entry.cuttingWeight || 0),
        0
      );

      return `${value} ${unitFor(department)}`;
    }

    if (
      department === "PTW" ||
      department === "SETTING"
    ) {
      const value = entries.reduce(
        (total, entry) =>
          total + Number(entry.weight || 0),
        0
      );

      return `${value} ${unitFor(department)}`;
    }

    if (department === "WELDING") {
      const value = entries.reduce(
        (total, entry) =>
          total + Number(entry.rmt || 0),
        0
      );

      return `${value} ${unitFor(department)}`;
    }

    return "—";
  }, [entries, department, unitFor]);

  /* =========================================
     UI
  ========================================= */

  return (
    <main className="departmentPage">
      <div className="departmentTopActions">
        <button
          type="button"
          className="backButton"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
          BACK TO OVERVIEW
        </button>

        <label className="departmentDatePicker">
          <span>WORK DATE</span>

          <input
            type="date"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setSelectedWorker(null);
            }}
          />
        </label>
      </div>

      {/* HERO */}

      <section className="departmentHero">
        <div>
          <span className="departmentEyebrow">
            PRODUCTION / DEPARTMENT
          </span>

          <h1>{department}</h1>

          <p>
            Live workforce and production activity
            loaded from daily work entries.
          </p>
        </div>

        <div className="departmentNumber">
          {String(workers.length).padStart(2, "0")}

          <span>WORKERS TODAY</span>
        </div>
      </section>

      {/* SUMMARY */}

      <section className="departmentSummary">
        <div>
          <Users size={18} />

          <span>WORKERS</span>

          <strong>{workers.length}</strong>
        </div>

        <div>
          <Clock3 size={18} />

          <span>TOTAL HOURS</span>

          <strong>{totalHours}h</strong>
        </div>

        <div>
          <FolderKanban size={18} />

          <span>PROJECTS</span>

          <strong>{projects}</strong>
        </div>

        <div>
          <ArrowUpRight size={18} />

          <span>OUTPUT</span>

          <strong>{totalOutput}</strong>
        </div>
      </section>

      {/* WORKERS */}

      <section className="workersSection">
        <div className="workersHeader">
          <div>
            <span>
              {selectedDate} / {department}
            </span>

            <h2>People on the floor</h2>
          </div>

          <div className="workerSearch">
            <Search size={17} />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search worker..."
            />
          </div>
        </div>

        {loading ? (
          <div className="departmentEmpty">
            Loading {department} records...
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="departmentEmpty">
            <strong>No activity recorded</strong>

            <span>
              No {department} work entries were found
              for {selectedDate}.
            </span>
          </div>
        ) : (
          <div className="workerTable">
            <div className="workerTableHeader">
              <span>EMPLOYEE</span>
              <span>ACTIVITIES</span>
              <span>PROJECTS</span>
              <span>HOURS</span>
              <span>STATUS</span>
              <span></span>
            </div>

            {filteredWorkers.map((worker) => (
              <div
                className="workerRow"
                key={worker.employeeId}
                onClick={() =>
                  setSelectedWorker(worker)
                }
              >
                <div className="workerIdentity">
                  <div className="workerAvatar">
                    {worker.employeeName?.charAt(0) ||
                      "W"}
                  </div>

                  <div>
                    <strong>
                      {worker.employeeName}
                    </strong>

                    <span>
                      {worker.employeeId}
                    </span>
                  </div>
                </div>

                <strong>
                  {worker.activities.length}
                </strong>

                <span>
                  {worker.projects.length}
                </span>

                <strong>
                  {worker.totalHours}h
                </strong>

                <div className="workerStatus">
                  <span></span>
                  RECORDED
                </div>

                <button
                  type="button"
                  className="workerOpen"
                >
                  <ArrowUpRight size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* WORKER DETAIL PANEL */}

      {selectedWorker && (
        <div
          className="departmentWorkerOverlay"
          onClick={() =>
            setSelectedWorker(null)
          }
        >
          <aside
            className="departmentWorkerPanel"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="departmentWorkerPanelTop">
              <span>
                {department} / EMPLOYEE ACTIVITY
              </span>

              <button
                type="button"
                onClick={() =>
                  setSelectedWorker(null)
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="departmentWorkerProfile">
              <div className="departmentWorkerAvatar">
                {selectedWorker.employeeName?.charAt(
                  0
                )}
              </div>

              <div>
                <span>
                  {selectedWorker.employeeId}
                </span>

                <h2>
                  {selectedWorker.employeeName}
                </h2>

                <small>
                  {selectedDate}
                </small>
              </div>
            </div>

            <div className="departmentWorkerStats">
              <div>
                <span>HOURS</span>

                <strong>
                  {selectedWorker.totalHours}H
                </strong>
              </div>

              <div>
                <span>ACTIVITIES</span>

                <strong>
                  {
                    selectedWorker.activities
                      .length
                  }
                </strong>
              </div>

              <div>
                <span>PROJECTS</span>

                <strong>
                  {
                    selectedWorker.projects
                      .length
                  }
                </strong>
              </div>
            </div>

            <div className="departmentActivityList">
              <div className="departmentActivityHeading">
                <span>DAILY ACTIVITY</span>

                <h3>
                  {department} records
                </h3>
              </div>

              {selectedWorker.activities.map(
                (activity, index) => (
                  <div
                    className="departmentActivityItem"
                    key={
                      activity._id || index
                    }
                  >
                    <span>
                      {String(
                        index + 1
                      ).padStart(2, "0")}
                    </span>

                    <div>
                      <small>PROJECT</small>

                      <strong>
                        {activity.project || "—"}
                      </strong>
                    </div>

                    <div>
                      <small>SHIFT</small>

                      <strong>
                        {activity.shift || "—"}
                      </strong>
                    </div>

                    <div>
                      <small>HOURS</small>

                      <strong>
                        {activity.hours}H
                      </strong>
                    </div>
                  </div>
                )
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

export default Department;