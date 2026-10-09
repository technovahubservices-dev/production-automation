import { getEntryProduction, calculateProductionTotals, formatProduction, formatTon, formatRmt } from "../context/productionUnits";
import { useSettings } from "../context/SettingsContext";
import { API_URL } from "../config/api";
import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  FileText,
  Printer,
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

function Reports() {
  const { settings } = useSettings();
  const preferences = settings?.reportPreferences || {};
  const showEmployeeId = preferences.showEmployeeId === true;
  const showProject = preferences.showProject === true;
  const showRemarks = preferences.showRemarks === true;
  const reportTitle = preferences.reportTitle || "Report";
  const activityColumns = `1.35fr .7fr ${showProject ? "1.1fr " : ""}.55fr .5fr .65fr ${showRemarks ? "1.2fr" : ""}`;
  const [selectedDate, setSelectedDate] =
    useState("2026-09-30");

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadReport = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/work-entries?date=${selectedDate}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to load report."
        );
      }

      setEntries(result.data || []);
    } catch (error) {
      console.error("Report load error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [selectedDate]);

  const totalHours = useMemo(() => {
    return entries.reduce(
      (total, entry) =>
        total + Number(entry.hours || 0),
      0
    );
  }, [entries]);

  const totalWorkers = useMemo(() => {
    return new Set(
      entries.map((entry) => entry.employeeId)
    ).size;
  }, [entries]);

  const totalProjects = useMemo(() => {
    return new Set(
      entries
        .map((entry) => entry.project)
        .filter(Boolean)
    ).size;
  }, [entries]);

  const production = useMemo(() => calculateProductionTotals(entries), [entries]);

  const departmentSummary = useMemo(() => {
    return departments.map((department) => {
      const departmentEntries =
        entries.filter(
          (entry) =>
            entry.department === department
        );

      const workers = new Set(
        departmentEntries.map(
          (entry) => entry.employeeId
        )
      ).size;

      const hours =
        departmentEntries.reduce(
          (total, entry) =>
            total +
            Number(entry.hours || 0),
          0
        );

      const { value: output, unit } = production.departments[department];

      return {
        department,
        entries: departmentEntries,
        workers,
        hours,
        output,
        unit,
      };
    });
  }, [entries, production]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <main className="reportsPage">
      {/* HEADER */}

      <section className="reportsHero">
        <div>
          <span className="reportsEyebrow">
            AUTOMATION / DAILY REPORT
          </span>

          <h1>{reportTitle.toUpperCase()}</h1>

          <p>
            One consolidated report generated
            automatically from all production
            department work entries.
          </p>
        </div>

        <div className="reportControls">
          <label>
            <span>REPORT DATE</span>

            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(
                  event.target.value
                )
              }
            />
          </label>

          <button
            type="button"
            onClick={loadReport}
          >
            <RefreshCw size={16} />
            REFRESH
          </button>

          <button
            type="button"
            className="printReportButton"
            onClick={handlePrint}
            disabled={!settings}
          >
            <Printer size={16} />
            PRINT / PDF
          </button>
        </div>
      </section>

      {loading ? (
        <div className="reportLoading">
          Preparing daily report...
        </div>
      ) : (
        <>
          {/* REPORT SUMMARY */}

          <section className="reportSummary">
            <div>
              <FileText size={18} />

              <span>WORK ENTRIES</span>

              <strong>
                {entries.length}
              </strong>

              <small>ACTIVITIES</small>
            </div>

            <div>
              <Users size={18} />

              <span>WORKERS</span>

              <strong>
                {totalWorkers}
              </strong>

              <small>
                UNIQUE EMPLOYEES
              </small>
            </div>

            <div>
              <Clock3 size={18} />

              <span>TOTAL HOURS</span>

              <strong>
                {totalHours}
              </strong>

              <small>HOURS</small>
            </div>

            {showProject && <div>
              <FileText size={18} />

              <span>PROJECTS</span>

              <strong>
                {totalProjects}
              </strong>

              <small>
                ACTIVE PROJECTS
              </small>
            </div>}
          </section>

          {/* REPORT DOCUMENT */}

          <section className="reportDocument">
            <div className="reportDocumentHeader">
              <div>
                <span>{settings?.companyName}</span>
                <p>{settings?.plantName}</p>

                <h2>
                  {reportTitle.toUpperCase()}
                </h2>
              </div>

              <div>
                <span>REPORT DATE</span>

                <strong>
                  {selectedDate}
                </strong>
              </div>
            </div>

            <div className="reportBlock">
              <div className="reportBlockTitle"><h3>Production totals</h3></div>
              <p><strong>TOTAL PRODUCTION: {formatTon(production.totalTon)}</strong></p>
              <p><strong>TOTAL RMT: {formatRmt(production.totalRmt)}</strong></p>
            </div>

            {/* DEPARTMENT SUMMARY */}

            <div className="reportBlock">
              <div className="reportBlockTitle">
                <span>01</span>

                <h3>
                  Department Summary
                </h3>
              </div>

              <div className="reportTable">
                <div className="reportTableHeader">
                  <span>DEPARTMENT</span>
                  <span>ENTRIES</span>
                  <span>WORKERS</span>
                  <span>HOURS</span>
                  <span>OUTPUT</span>
                </div>

                {departmentSummary.map(
                  (item) => (
                    <div
                      className="reportTableRow"
                      key={
                        item.department
                      }
                    >
                      <strong>
                        {item.department}
                      </strong>

                      <span>
                        {
                          item.entries
                            .length
                        }
                      </span>

                      <span>
                        {item.workers}
                      </span>

                      <span>
                        {item.hours}H
                      </span>

                      <span>
                        {item.department ===
                        "CLEANING"
                          ? "—"
                          : formatProduction({ value: item.output, unit: item.unit })}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* DETAILED ACTIVITIES */}

            <div className="reportBlock">
              <div className="reportBlockTitle">
                <span>02</span>

                <h3>
                  Production Activities
                </h3>
              </div>

              {entries.length === 0 ? (
                <div className="reportEmpty">
                  No work activities
                  recorded for this date.
                </div>
              ) : (
                <div className="reportActivityTable">
                  <div className="reportActivityHeader" style={{ "--activity-columns": activityColumns }}>
                    <span>EMPLOYEE</span>
                    <span>DEPT.</span>
                    {showProject && <span>PROJECT</span>}
                    <span>SHIFT</span>
                    <span>HOURS</span>
                    <span>OUTPUT</span>
                    {showRemarks && <span>REMARKS</span>}
                  </div>

                  {entries.map((entry) => {
                    const output = formatProduction(getEntryProduction(entry));

                    return (
                      <div
                        className="reportActivityRow" style={{ "--activity-columns": activityColumns }}
                        key={entry._id}
                      >
                        <div>
                          <strong>
                            {
                              entry.employeeName
                            }
                          </strong>

                          {showEmployeeId && <span>{entry.employeeId}</span>}
                        </div>

                        <strong>
                          {
                            entry.department
                          }
                        </strong>

                        {showProject && <span>
                          {entry.project ||
                            "—"}
                        </span>}

                        <span>
                          {entry.shift ||
                            "—"}
                        </span>

                        <strong>
                          {entry.hours}H
                        </strong>

                        <span>
                          {output}
                        </span>
                        {showRemarks && <span>{entry.remarks || "-"}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* WORKER HOURS */}

            <div className="reportBlock">
              <div className="reportBlockTitle">
                <span>03</span>

                <h3>
                  Work Hour Verification
                </h3>
              </div>

              <WorkerHourReport
                entries={entries}
                showEmployeeId={showEmployeeId}
              />
            </div>

            <div className="reportFooter">
              <span>
                GENERATED FROM {settings?.companyName} PRODUCTION AUTOMATION
              </span>

              <span>
                {selectedDate}
              </span>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

/* =========================================
   WORKER HOUR SUMMARY
========================================= */

function WorkerHourReport({ entries, showEmployeeId }) {
  const workers = {};

  entries.forEach((entry) => {
    if (!workers[entry.employeeId]) {
      workers[entry.employeeId] = {
        id: entry.employeeId,
        name: entry.employeeName,
        hours: 0,
        departments: new Set(),
      };
    }

    workers[entry.employeeId].hours +=
      Number(entry.hours || 0);

    workers[
      entry.employeeId
    ].departments.add(
      entry.department
    );
  });

  const workerList =
    Object.values(workers);

  if (workerList.length === 0) {
    return (
      <div className="reportEmpty">
        No worker hours recorded.
      </div>
    );
  }

  return (
    <div className="workerHourReport">
      {workerList.map((worker) => (
        <div
          className="workerHourReportRow"
          key={worker.id}
        >
          <div>
            {showEmployeeId && <span>{worker.id}</span>}

            <strong>
              {worker.name}
            </strong>
          </div>

          <div>
            <span>DEPARTMENTS</span>

            <strong>
              {
                worker.departments
                  .size
              }
            </strong>
          </div>

          <div>
            <span>
              TOTAL HOURS
            </span>

            <strong>
              {worker.hours}H
            </strong>
          </div>

        </div>
      ))}
    </div>
  );
}

export default Reports;
