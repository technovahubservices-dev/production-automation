import { activityMinutes, formatMinutes } from "../utils/attendance";
import { calculateProductionTotals, formatProduction, formatTon, formatRmt } from "../context/productionUnits";
import { API_URL } from "../config/api";
import { useEffect, useMemo, useState } from "react";

import {
  ArrowUpRight,
  Clock3,
  Factory,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";

const departmentNames = [
  "CNC",
  "PTW",
  "SETTING",
  "WELDING",
  "CLEANING",
];

function ProductionDashboard({ onDepartmentClick, onWorkEntryClick, onProductionClick }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const localDate = new Date(
      today.getTime() - today.getTimezoneOffset() * 60_000
    );
    return localDate.toISOString().slice(0, 10);
  });

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/work-entries?date=${selectedDate}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to load dashboard."
        );
      }

      setEntries((result.data || []).filter((entry) => entry.date === selectedDate));
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [selectedDate]);

  /* ========================================
     OVERALL CALCULATIONS
  ======================================== */

  const activeWorkers = useMemo(() => {
    return new Set(
      entries.map((entry) => entry.employeeId)
    ).size;
  }, [entries]);

  const totalMinutes = useMemo(() => {
    return entries.reduce(
      (total, entry) => total + activityMinutes(entry),
      0
    );
  }, [entries]);

  const production = useMemo(() => calculateProductionTotals(entries), [entries]);

  const recentEntries = useMemo(() => [...entries]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5), [entries]);

  /* ========================================
     DEPARTMENT CALCULATIONS
  ======================================== */

  const departments = useMemo(() => {
    return departmentNames.map((department, index) => {
      const departmentEntries = entries.filter(
        (entry) => entry.department === department
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

      const output = formatProduction(production.departments[department]);

      return {
        name: department,
        code: String(index + 1).padStart(2, "0"),
        workers,
        hours,
        output,
        activities: departmentEntries.length,
      };
    });
  }, [entries, production]);


  return (
    <main className="dashboard">
      {/* ===================================
          HERO
      =================================== */}

      <section className="dashboardHero">
        <div>
          <div className="heroTag">
            <span></span>
            LIVE PRODUCTION FLOOR
          </div>

          <h1>
            Production
            <br />
            <span>Intelligence.</span>
          </h1>

          <p>
            Real-time production visibility generated
            from daily work entries across every
            department.
          </p>
        </div>

        <div className="dashboardDateControl">
          <span>PRODUCTION DATE</span>

          <input
            type="date"
            value={selectedDate}
            onChange={(event) =>
              setSelectedDate(event.target.value)
            }
          />

          <button
            type="button"
            onClick={loadDashboard}
          >
            <RefreshCw size={14} />
            REFRESH
          </button>
        </div>
      </section>

      {/* ===================================
          LOADING
      =================================== */}

      {loading ? (
        <div className="dashboardLoading">
          Loading live production data...
        </div>
      ) : (
        <>
          {/* ===================================
              METRICS
          =================================== */}

          <section className="metricStrip">
            <div className="metricCard">
              <div>
                <Factory size={18} />
                <span>TOTAL PRODUCTION</span>
              </div>

              <strong>
                {formatTon(production.totalTon)}
              </strong>
              <small>SELECTED DATE</small>
            </div>

            <div className="metricCard"><div><Factory size={18} /><span>TOTAL RMT</span></div><strong>{formatRmt(production.totalRmt)}</strong><small>SELECTED DATE</small></div>

            <div className="metricCard">
              <div>
                <Users size={18} />
                <span>ACTIVE WORKERS</span>
              </div>

              <strong>{activeWorkers}</strong>

              <small>ON FLOOR</small>
            </div>

            <div className="metricCard">
              <div>
                <Clock3 size={18} />
                <span>WORK TIME</span>
              </div>

              <strong>{formatMinutes(totalMinutes)}</strong>

              <small>HOURS / MINUTES</small>
            </div>

          </section>

          {entries.length === 0 && (
            <div className="dashboardLoading">
              No work activities recorded for this date.
            </div>
          )}

          {/* ===================================
              DEPARTMENTS
          =================================== */}

          <section className="departmentSection">
            <div className="sectionHeading">
              <div>
                <span>
                  PRODUCTION FLOOR / 05 DEPARTMENTS
                </span>

                <h2>Department activity</h2>
              </div>

              <p>
                Select a department to inspect its
                workforce and production records.
              </p>
            </div>

            <div className="departmentGrid">
              {departments.map((department) => (
                <button
                  type="button"
                  className="departmentCard"
                  key={department.name}
                  onClick={() =>
                    onDepartmentClick(department.name)
                  }
                >
                  <div className="departmentCardTop">
                    <span>{department.code}</span>

                    <ArrowUpRight size={18} />
                  </div>

                  <h3>{department.name}</h3>

                  <div className="departmentStats">
                    <div>
                      <span>WORKERS</span>

                      <strong>
                        {department.workers}
                      </strong>
                    </div>

                    <div>
                      <span>HOURS</span>

                      <strong>
                        {department.hours}H
                      </strong>
                    </div>

                    <div>
                      <span>OUTPUT</span>

                      <strong>
                        {department.output}
                      </strong>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="overviewRecentActivity" aria-labelledby="overviewRecentTitle">
            <div className="overviewRecentHeading">
              <div>
                <span>WORK RECORDS / SELECTED DATE</span>
                <h2 id="overviewRecentTitle">Recent work activity</h2>
              </div>
              <button type="button" onClick={onProductionClick}>VIEW PRODUCTION <ArrowUpRight size={15} /></button>
            </div>
            {recentEntries.length ? (
              <div className="overviewRecentTable" role="table" aria-label="Recent work activity">
                <div className="overviewRecentRow overviewRecentHeader" role="row">
                  <span role="columnheader">EMPLOYEE</span><span role="columnheader">EMPLOYEE ID</span><span role="columnheader">DEPARTMENT</span><span role="columnheader">PROJECT</span><span role="columnheader">HOURS</span><span role="columnheader">SHIFT</span>
                </div>
                {recentEntries.map((entry) => (
                  <div className="overviewRecentRow" role="row" key={entry._id}>
                    <strong role="cell">{entry.employeeName || "—"}</strong><span role="cell">{entry.employeeId || "—"}</span><span role="cell"><i className="overviewRecentDeptMark" />{entry.department || "—"}</span><span role="cell" title={entry.project || "—"}>{entry.project || "—"}</span><b role="cell">{entry.hours || 0}H</b><span role="cell">{entry.shift || "—"}</span>
                  </div>
                ))}
              </div>
            ) : <p className="overviewRecentEmpty">No recent work activity for this date.</p>}
          </section>
        </>
      )}

      <button
        type="button"
        className="floatingAction"
        onClick={onWorkEntryClick}
      >
        <Plus size={18} />
        NEW WORK ENTRY
      </button>
    </main>
  );
}

export default ProductionDashboard;
