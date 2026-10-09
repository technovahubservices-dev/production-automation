import { kgToTon, calculateProductionTotals, formatProduction, formatTon, formatRmt } from "../context/productionUnits";
import { API_URL } from "../config/api";
import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { Activity, CalendarDays, Clock3, Factory, FolderKanban, Users, X } from "lucide-react";

const DEPARTMENTS = ["CNC", "PTW", "SETTING", "WELDING", "CLEANING"];
const COLORS = ["#C96B3B", "#F0B84B", "#52798A", "#8E999D", "#1B272D"];
const API = `${API_URL}/api`;

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatHours(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ActiveSlice(props) {
  return <Sector {...props} outerRadius={(props.outerRadius || 0) + 7} stroke="#C96B3B" strokeWidth={2} />;
}

function ChartTooltip({ active, payload, coordinate, viewBox, wrapper }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const chartWidth = wrapper?.offsetWidth || viewBox?.width || 0;
  const chartHeight = wrapper?.offsetHeight || viewBox?.height || 0;
  const sliceX = coordinate?.x ?? chartWidth / 2;
  const donutCenter = chartWidth / 2;
  const donutRadius = (viewBox?.width || chartWidth) * 0.44;
  const tooltipWidth = 170;
  const gap = 16;
  const rightLeft = donutCenter + donutRadius + gap;
  const leftLeft = donutCenter - donutRadius - gap - tooltipWidth;
  const placeRight = sliceX <= donutCenter;
  const narrow = chartWidth < donutRadius * 2 + tooltipWidth + gap * 2;
  const left = narrow
    ? Math.max(0, Math.min((viewBox?.width || chartWidth) / 2 - tooltipWidth / 2, chartWidth - tooltipWidth))
    : placeRight ? Math.min(rightLeft, chartWidth - tooltipWidth) : Math.max(0, leftLeft);
  const top = narrow
    ? 0
    : Math.max(0, Math.min((coordinate?.y ?? chartHeight / 2) - 65, chartHeight - 170));

  return (
    <div className="dashboardChartTooltip" style={{ left, top }}>
      <strong>{item.name}</strong>
      <span>{formatHours(item.hours)}H WORK</span>
      <span>{item.workers} {item.workers === 1 ? "WORKER" : "WORKERS"}</span>
      <span>{item.entries} {item.entries === 1 ? "ACTIVITY" : "ACTIVITIES"}</span>
      {item.outputLabel && <span>{item.outputLabel}</span>}
      <span>{item.share.toFixed(0)}% OF HOURS</span>
    </div>
  );
}

function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(localDate);
  const [entries, setEntries] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [hoveredDepartment, setHoveredDepartment] = useState(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [entryResponse, workerResponse] = await Promise.all([
          fetch(`${API}/work-entries?date=${encodeURIComponent(selectedDate)}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }),
          fetch(`${API}/workers`),
        ]);
        const [entryResult, workerResult] = await Promise.all([
          entryResponse.json(),
          workerResponse.json(),
        ]);
        if (!entryResponse.ok) throw new Error(entryResult.message || "Unable to load work entries.");
        if (!workerResponse.ok) throw new Error(workerResult.message || "Unable to load worker details.");
        if (cancelled) return;
        setEntries((entryResult.data || []).filter((entry) => entry.date === selectedDate));
        setWorkers(workerResult.data || []);
      } catch (error) {
        if (!cancelled) {
          setEntries([]);
          setLoadError(error.message || "Unable to load dashboard data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  useEffect(() => {
    setSelectedDepartment(null);
    setHoveredDepartment(null);
    setSelectedWorkerId(null);
    setSelectedProject(null);
  }, [selectedDate]);

  const workerMaster = useMemo(() => new Map(
    workers.map((worker) => [String(worker.employeeId || "").trim().toUpperCase(), worker])
  ), [workers]);

  const production = useMemo(() => calculateProductionTotals(entries), [entries]);

  const departmentData = useMemo(() => DEPARTMENTS.map((name, index) => {
    const rows = entries.filter((entry) => entry.department === name);
    const hours = rows.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
    const workerIds = [...new Set(rows.map((entry) => String(entry.employeeId || "").trim().toUpperCase()).filter(Boolean))];
    const projects = [...new Set(rows.map((entry) => (entry.project || "").trim()).filter(Boolean))];
    const { value: output, unit } = production.departments[name];
    return {
      name, index, rows, hours, entries: rows.length, workerIds, workers: workerIds.length,
      projects: projects.length, output, unit,
      outputLabel: formatProduction(production.departments[name]),
      share: 0,
    };
  }), [entries, production]);

  const totalHours = departmentData.reduce((sum, department) => sum + department.hours, 0);
  const chartData = departmentData.map((department) => ({
    ...department,
    share: totalHours ? department.hours / totalHours * 100 : 0,
  }));
  const activeWorkers = new Set(entries.map((entry) => String(entry.employeeId || "").trim().toUpperCase()).filter(Boolean)).size;
  const activeProjects = new Set(entries.map((entry) => (entry.project || "").trim()).filter(Boolean)).size;

  const workforce = useMemo(() => {
    const byId = new Map();
    entries.forEach((entry) => {
      const id = String(entry.employeeId || "").trim().toUpperCase();
      if (!id) return;
      if (!byId.has(id)) byId.set(id, { employeeId: id, employeeName: entry.employeeName || workerMaster.get(id)?.name || id, activities: [] });
      byId.get(id).activities.push(entry);
    });
    return [...byId.values()].map((person) => {
      const master = workerMaster.get(person.employeeId);
      return {
        ...person,
        employeeName: master?.name || person.employeeName,
        phone: master?.phone || "",
        designation: master?.designation || "",
        status: master?.status || "",
        totalHours: person.activities.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
        departments: [...new Set(person.activities.map((entry) => entry.department))],
        projects: [...new Set(person.activities.map((entry) => (entry.project || "").trim()).filter(Boolean))],
      };
    }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [entries, workerMaster]);

  const selectedPerson = workforce.find((person) => person.employeeId === selectedWorkerId);
  const activeDepartmentName = hoveredDepartment || selectedDepartment;
  const chartSelectionName = activeDepartmentName;
  const activeDepartment = chartData.find((department) => department.name === activeDepartmentName);
  const departmentWorkers = activeDepartment ? workforce
    .map((person) => ({ ...person, departmentEntries: person.activities.filter((entry) => entry.department === activeDepartment.name) }))
    .filter((person) => person.departmentEntries.length)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName)) : [];
  const recentEntries = [...entries]
    .sort((a, b) => new Date(b.createdAt || `${b.date}T00:00:00`) - new Date(a.createdAt || `${a.date}T00:00:00`))
    .slice(0, 5);
  const projectData = useMemo(() => {
    const projectMap = new Map();
    entries.forEach((entry) => {
      const name = (entry.project || "").trim();
      if (!name) return;
      if (!projectMap.has(name)) projectMap.set(name, { name, employeeIds: new Set(), activities: 0, hours: 0 });
      const project = projectMap.get(name);
      project.employeeIds.add(String(entry.employeeId || "").trim().toUpperCase());
      project.activities += 1;
      project.hours += Number(entry.hours || 0);
    });
    return [...projectMap.values()].map(({ employeeIds, ...project }) => ({ ...project, workers: employeeIds.size }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  }, [entries]);

  useEffect(() => {
    if (!selectedWorkerId) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setSelectedWorkerId(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedWorkerId]);

  const showField = (entry, key, label, suffix = "") => {
    const value = entry[key];
    if (value === undefined || value === null || String(value).trim() === "") return null;
    const displayed = ["plateWeight", "cuttingWeight", "weight"].includes(key) ? formatTon(kgToTon(value)) : value;
    return <div className="dashboardActivityField" key={key}><span>{label}</span><strong>{displayed}{suffix && ` ${suffix}`}</strong></div>;
  };

  return (
    <main className="dashboardPage">
      <header className="dashboardPageHeader">
        <div>
          <span className="dashboardEyebrow">PRODUCTION / INTELLIGENCE</span>
          <h1>Production<br /><em>dashboard.</em></h1>
          <p>A visual overview of production, workforce and department activity.</p>
        </div>
        <label className="dashboardDatePicker"><span><CalendarDays size={15} /> PRODUCTION DATE</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
      </header>

      {loadError && <div className="dashboardError" role="alert">{loadError}</div>}

      <section className="dashboardKpis" aria-label="Daily production metrics">
        <article className="dashboardKpi dashboardKpiPrimary"><span><Factory size={16} /> TOTAL PRODUCTION</span><strong>{formatTon(production.totalTon)}</strong><small>SELECTED DATE</small></article>
        <article className="dashboardKpi"><span><Factory size={16} /> TOTAL RMT</span><strong>{formatRmt(production.totalRmt)}</strong><small>SELECTED DATE</small></article>
        <article className="dashboardKpi"><span><Users size={16} /> ACTIVE WORKERS</span><strong>{activeWorkers}</strong><small>UNIQUE EMPLOYEES</small></article>
        <article className="dashboardKpi"><span><Clock3 size={16} /> TOTAL HOURS</span><strong>{formatHours(totalHours)}<small>H</small></strong><small>WORK HOURS</small></article>
        <article className="dashboardKpi"><span><Activity size={16} /> WORK ENTRIES</span><strong>{entries.length}</strong><small>ACTIVITIES</small></article>
        <article className="dashboardKpi"><span><FolderKanban size={16} /> ACTIVE PROJECTS</span><strong>{activeProjects}</strong><small>UNIQUE PROJECTS</small></article>
      </section>

      {loading ? <div className="dashboardLoadingState">Loading production intelligenceâ€¦</div> : entries.length === 0 ? (
        <section className="dashboardNoData"><Activity size={25} /><strong>NO ACTIVITY DATA</strong><span>No production work has been recorded for this date.</span></section>
      ) : (
        <>
          <section className="dashboardAnalysisGrid">
            <article className="dashboardChartPanel">
              <div className="dashboardPanelHeading"><div><span>DEPARTMENT ACTIVITY</span><h2>Work hours by department</h2></div><small>{formatHours(totalHours)}H TOTAL</small></div>
              <div className="dashboardChartLayout">
                <div className="dashboardDonutWrap">
                  <div className="dashboardDonut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        {totalHours === 0 && <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="dashboardChartEmpty">NO ACTIVITY RECORDED</text>}
                        <Pie data={chartData.filter((item) => item.hours > 0)} dataKey="hours" nameKey="name" innerRadius="68%" outerRadius="88%" paddingAngle={3} stroke="none" activeIndex={chartSelectionName ? chartData.filter((item) => item.hours > 0).findIndex((item) => item.name === chartSelectionName) : undefined} activeShape={ActiveSlice} onMouseEnter={(data) => setHoveredDepartment(data.name)} onMouseLeave={() => setHoveredDepartment(null)} onClick={(data) => setSelectedDepartment(selectedDepartment === data.name ? null : data.name)} isAnimationActive animationDuration={240}>
                          {chartData.filter((item) => item.hours > 0).map((item) => <Cell key={item.name} fill={COLORS[item.index]} fillOpacity={chartSelectionName && chartSelectionName !== item.name ? 0.6 : 1} cursor="pointer" />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} wrapperStyle={{ pointerEvents: "none", zIndex: 20 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="dashboardDonutCenter" aria-live="polite">{activeDepartment ? <><strong>{activeDepartment.name}</strong><b>{formatHours(activeDepartment.hours)}H</b><span>{activeDepartment.share.toFixed(0)}%</span><small>OF TOTAL WORK HOURS</small></> : <><b>{formatHours(totalHours)}H</b><span>TOTAL WORK HOURS</span></>}</div>
                  </div>
                </div>
                <div className="dashboardDepartmentDetail">
                  {activeDepartment ? <>
                    <div className="dashboardDetailHeading" style={{ "--department-color": COLORS[activeDepartment.index] }}><span>{activeDepartment.name} DEPARTMENT</span><strong>{formatHours(activeDepartment.hours)}H</strong></div>
                    <div className="dashboardDetailMetrics"><div><span>WORKERS</span><strong>{activeDepartment.workers}</strong></div><div><span>WORK ENTRIES</span><strong>{activeDepartment.entries}</strong></div><div><span>OUTPUT</span><strong>{activeDepartment.outputLabel || "—"}</strong></div><div><span>ACTIVE PROJECTS</span><strong>{activeDepartment.projects}</strong></div></div>
                    <div className="dashboardDepartmentWorkers"><span className="dashboardSubhead">WORKERS ON THIS DEPARTMENT</span>{departmentWorkers.length ? departmentWorkers.map((person) => <button type="button" key={person.employeeId} onClick={() => setSelectedWorkerId(person.employeeId)}><span className="dashboardMiniAvatar">{person.employeeName.charAt(0)}</span><strong>{person.employeeName}<small>{person.employeeId}</small></strong><b>{formatHours(person.departmentEntries.reduce((sum, row) => sum + Number(row.hours || 0), 0))}H</b><span className="dashboardWorkerArrow" aria-hidden="true">›</span></button>) : <p>No workers recorded.</p>}</div>
                    <button type="button" className="dashboardClearSelection" onClick={() => setSelectedDepartment(null)}>CLEAR DEPARTMENT SELECTION</button>
                  </> : <div className="dashboardDepartmentPrompt"><span>{totalHours ? "SELECT A DEPARTMENT" : "NO ACTIVITY RECORDED"}</span><p>{totalHours ? "Choose a chart segment to inspect its workforce and production output." : "Department details will appear here when work is recorded."}</p></div>}
                </div>
              </div>
              <div className="dashboardLegend">{chartData.map((item) => <button type="button" key={item.name} aria-pressed={selectedDepartment === item.name} style={{ "--department-color": COLORS[item.index] }} className={selectedDepartment === item.name ? "selected" : ""} onMouseEnter={() => item.hours > 0 && setHoveredDepartment(item.name)} onMouseLeave={() => setHoveredDepartment(null)} onClick={() => item.hours > 0 && setSelectedDepartment(selectedDepartment === item.name ? null : item.name)}><i style={{ "--dashboard-swatch": COLORS[item.index] }} />{item.name}<b>{formatHours(item.hours)}H</b></button>)}</div>
            </article>

            <article className="dashboardOutputPanel">
              <div className="dashboardPanelHeading"><div><span>PRODUCTION OUTPUT</span><h2>Department totals</h2></div></div>
              <div className="dashboardOutputRows">{departmentData.map((item) => {
                const scale = Math.max(0, ...departmentData.filter((d) => (item.unit ? d.unit === item.unit : d.name === item.name)).map((d) => d.output));
                const percent = scale ? item.output / scale * 100 : 0;
                return <button type="button" aria-pressed={selectedDepartment === item.name} style={{ "--department-color": COLORS[item.index] }} className={`dashboardOutputRow ${selectedDepartment === item.name ? "selected" : ""}`} key={item.name} onClick={() => setSelectedDepartment(selectedDepartment === item.name ? null : item.name)}><div><strong>{item.name}</strong><b>{item.name !== "CLEANING" ? item.outputLabel : "—"}</b></div>{item.unit && <div className={`dashboardOutputTrack ${item.unit === "RMT" ? "rmt" : "kg"}`}><i style={{ width: `${percent}%` }} /></div>}</button>;
              })}</div>
              <p className="dashboardOutputNote">Different units are scaled separately.</p>
            </article>
          </section>

          <section className="dashboardWorkforceSection">
            <div className="dashboardSectionHeading"><div><span>WORKFORCE ACTIVITY</span><h2>People on the floor</h2></div><small>{workforce.length} UNIQUE WORKERS</small></div>
            <div className="dashboardWorkerGrid">{workforce.map((person) => {
              const isHighlighted = (!selectedDepartment || person.departments.includes(selectedDepartment)) && (!selectedProject || person.projects.includes(selectedProject));
              return <button type="button" aria-label={`View details for ${person.employeeName}, ${person.employeeId}`} className={`dashboardWorkerCard ${isHighlighted ? "highlighted" : "dimmed"}`} key={person.employeeId} onClick={() => setSelectedWorkerId(person.employeeId)}><div className="dashboardWorkerTop"><span className="dashboardWorkerAvatar">{person.employeeName.charAt(0)}</span><small>{person.employeeId}</small></div><strong className="dashboardWorkerName">{person.employeeName}</strong><div className="dashboardWorkerStats"><span><b>{formatHours(person.totalHours)}H</b><small>TOTAL HOURS</small></span><span><b>{person.departments.length}</b><small>DEPARTMENTS</small></span><span><b>{person.activities.length}</b><small>ACTIVITIES</small></span></div><div className="dashboardWorkerTags">{person.departments.map((name) => <span key={name}>{name}</span>)}</div></button>;
            })}</div>
          </section>

          <section className="dashboardBottomGrid">
            <article className="dashboardProjectsPanel"><div className="dashboardPanelHeading"><div><span>ACTIVE PROJECTS</span><h2>Selected date</h2></div>{selectedProject && <button type="button" className="dashboardClearSelection" onClick={() => setSelectedProject(null)}>CLEAR PROJECT</button>}</div>{projectData.length ? projectData.map((project) => <button type="button" aria-pressed={selectedProject === project.name} className={`dashboardProjectRow ${selectedProject === project.name ? "selected" : ""}`} key={project.name} onClick={() => setSelectedProject(selectedProject === project.name ? null : project.name)}><strong>{project.name}</strong><span>{project.workers} workers</span><span>{project.activities} activities</span><b>{formatHours(project.hours)}H</b></button>) : <p className="dashboardQuietEmpty">No named projects for this date.</p>}</article>
            <article className="dashboardRecentPanel"><div className="dashboardPanelHeading"><div><span>RECENT ACTIVITY</span><h2>Latest work records</h2></div><small>LAST 5</small></div><div className="dashboardRecentList">{recentEntries.map((entry) => <div className="dashboardRecentRow" key={entry._id}><div><strong>{entry.employeeName}</strong><small>{entry.employeeId}</small></div><span className="dashboardDeptBadge">{entry.department}</span><span>{(entry.project || "—").trim() || "—"}</span><b>{formatHours(entry.hours)}H</b><small>{entry.shift || "—"}</small></div>)}</div>{recentEntries.length === 0 && <p className="dashboardQuietEmpty">No recent work records for this date.</p>}</article>
          </section>
        </>
      )}

      {selectedPerson && <div className="dashboardDrawerOverlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedWorkerId(null); }}>
        <aside className="dashboardWorkerDrawer" role="dialog" aria-modal="true" aria-label={`Worker details for ${selectedPerson.employeeName}`}>
          <header className="dashboardDrawerHeader"><div><span>WORKFORCE / DAILY RECORD</span><h2>Worker details</h2></div><button type="button" aria-label="Close worker details" onClick={() => setSelectedWorkerId(null)}><X size={20} /></button></header>
          <div className="dashboardDrawerProfile"><span className="dashboardDrawerAvatar">{selectedPerson.employeeName.charAt(0)}</span><div><strong>{selectedPerson.employeeName}</strong><span>{selectedPerson.employeeId}</span></div><small>{selectedPerson.status}</small></div>
          {(selectedPerson.phone || selectedPerson.designation) && <div className="dashboardMasterDetails">{selectedPerson.phone && <div><span>PHONE</span><strong>{selectedPerson.phone}</strong></div>}{selectedPerson.designation && <div><span>DESIGNATION</span><strong>{selectedPerson.designation}</strong></div>}</div>}
          <div className="dashboardSelectedDate"><span>SELECTED DATE</span><strong>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</strong></div>
          <div className="dashboardDrawerMetrics"><div><span>TOTAL HOURS</span><strong>{formatHours(selectedPerson.totalHours)}H</strong></div><div><span>DEPARTMENTS</span><strong>{selectedPerson.departments.length}</strong></div><div><span>PROJECTS</span><strong>{selectedPerson.projects.length}</strong></div><div><span>ACTIVITIES</span><strong>{selectedPerson.activities.length}</strong></div></div>
          <div className="dashboardActivityHistory"><div className="dashboardActivityTitle"><span>ALL DAILY RECORDS</span><h3>Production activity</h3></div>
            {selectedPerson.activities.map((entry, index) => <article className="dashboardActivityCard" key={entry._id || `${entry.employeeId}-${entry.department}-${index}`}><div className="dashboardActivityCardTop"><span>{String(index + 1).padStart(2, "0")} / {entry.department}</span><strong>{formatHours(entry.hours)}H</strong></div><div className="dashboardActivityCommon"><div><span>PROJECT</span><strong>{entry.project || "â€”"}</strong></div><div><span>SHIFT</span><strong>{entry.shift || "â€”"}</strong></div><div><span>REMARKS</span><strong>{entry.remarks || "â€”"}</strong></div></div>
              <div className="dashboardActivityFields">{entry.department === "CNC" && <>{showField(entry,"pageNo","PAGE NO")}{showField(entry,"plateNo","PLATE NO")}{showField(entry,"length","LENGTH","MM")}{showField(entry,"width","WIDTH","MM")}{showField(entry,"thickness","THICKNESS","MM")}{showField(entry,"plateWeight","PLATE WEIGHT","")}{showField(entry,"cuttingWeight","CUTTING WEIGHT","")}{showField(entry,"cuttingTime","CUTTING TIME")}</>}{(entry.department === "PTW" || entry.department === "SETTING") && <>{showField(entry,"drawingNo","DRAWING NO")}{showField(entry,"quantity","QUANTITY")}{showField(entry,"weight","WEIGHT","")}</>}{entry.department === "WELDING" && <>{showField(entry,"rmt","WELDING OUTPUT","RMT")}{showField(entry,"workDescription","WORK DESCRIPTION")}</>}{entry.department === "CLEANING" && showField(entry,"workDescription","WORK DESCRIPTION")}</div>
            </article>)}
          </div>
        </aside>
      </div>}
    </main>
  );
}

export default Dashboard;
