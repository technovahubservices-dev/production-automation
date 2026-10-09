import { X, Clock3, Layers3, BriefcaseBusiness } from "lucide-react";
import { workEntries } from "../data/workers";

function WorkerPanel({ worker, onClose }) {
  if (!worker) return null;

  const employeeEntries = workEntries.filter(
    (entry) => entry.employeeId === worker.employeeId
  );

  const totalHours = employeeEntries.reduce(
    (sum, entry) => sum + entry.hours,
    0
  );

  const departments = [
    ...new Set(employeeEntries.map((entry) => entry.department)),
  ];

  return (
    <div className="workerPanelOverlay" onClick={onClose}>
      <aside
        className="workerPanel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workerPanelTop">
          <span>WORKER / DAILY ACTIVITY</span>

          <button onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div className="workerProfile">
          <div className="largeWorkerAvatar">
            {worker.name.charAt(0)}
          </div>

          <div>
            <span>{worker.employeeId}</span>
            <h2>{worker.name}</h2>

            <div className="workingBadge">
              <span></span>
              ACTIVE TODAY
            </div>
          </div>
        </div>

        <div className="workerQuickStats">
          <div>
            <Clock3 size={18} />
            <span>TOTAL HOURS</span>
            <strong>{totalHours}h</strong>
          </div>

          <div>
            <Layers3 size={18} />
            <span>DEPARTMENTS</span>
            <strong>{departments.length}</strong>
          </div>

          <div>
            <BriefcaseBusiness size={18} />
            <span>ACTIVITIES</span>
            <strong>{employeeEntries.length}</strong>
          </div>
        </div>

        <div className="departmentTimeline">
          <div className="timelineHeading">
            <span>30 SEP 2026</span>
            <h3>Today's activity</h3>
          </div>

          {employeeEntries.map((entry, index) => (
            <div className="timelineItem" key={entry.id}>
              <div className="timelineMarker">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>

              <div className="timelineContent">
                <div className="timelineTop">
                  <div>
                    <span>DEPARTMENT</span>
                    <h4>{entry.department}</h4>
                  </div>

                  <strong>{entry.hours}H</strong>
                </div>

                <div className="timelineDetails">
                  <div>
                    <span>PROJECT</span>
                    <strong>{entry.project}</strong>
                  </div>

                  <div>
                    <span>SHIFT</span>
                    <strong>{entry.shift}</strong>
                  </div>

                  <div>
                    <span>OUTPUT</span>
                    <strong>{entry.output}</strong>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

      </aside>
    </div>
  );
}

export default WorkerPanel;
