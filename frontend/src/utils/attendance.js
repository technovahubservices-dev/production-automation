// Calendar arithmetic uses local components, never UTC ISO conversion.
export const getLocalDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function getPeriodRange(period, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  if (period === "week" || period === "lastWeek") {
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    if (period === "lastWeek") start.setDate(start.getDate() - 7);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  } else if (period === "month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  return { fromDate: getLocalDate(start), toDate: getLocalDate(end) };
}

export function activityMinutes(entry) {
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (timePattern.test(entry.inTime) && timePattern.test(entry.outTime)) {
    const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const difference = minutes(entry.outTime) - minutes(entry.inTime);
    return difference < 0 ? difference + 1440 : difference;
  }
  const hours = Number(entry.hours);
  return Number.isFinite(hours) && hours >= 0 ? Math.round(hours * 60) : 0;
}

export const formatMinutes = (minutes) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

export function summarizeWorkers(entries) {
  const workers = new Map();
  entries.forEach((entry) => {
    const employeeId = String(entry.employeeId || "").trim();
    if (!employeeId) return;
    if (!workers.has(employeeId)) workers.set(employeeId, {
      employeeId, employeeName: entry.employeeName, totalMinutes: 0,
      dates: new Set(), departments: new Set(), projects: new Set(), activities: [],
    });
    const worker = workers.get(employeeId);
    worker.totalMinutes += activityMinutes(entry);
    worker.dates.add(entry.date);
    worker.departments.add(entry.department);
    if (entry.project) worker.projects.add(entry.project);
    worker.activities.push(entry);
  });
  return [...workers.values()].map((worker) => ({
    ...worker, workedDays: worker.dates.size,
    departments: [...worker.departments], projects: [...worker.projects],
    activities: worker.activities.sort((a, b) => a.date.localeCompare(b.date) || (a.inTime || "").localeCompare(b.inTime || "")),
  }));
}
