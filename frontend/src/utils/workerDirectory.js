// Merge master employees with period activity without changing stored records.
// Keep historical activity visible even when its employee is no longer active.
export function mergeWorkerDirectory(employees, activityWorkers) {
  const directory = new Map(activityWorkers.map((worker) => [worker.employeeId, worker]));
  for (const employee of employees) {
    const activity = directory.get(employee.employeeId);
    directory.set(employee.employeeId, {
      employeeId: employee.employeeId,
      totalMinutes: 0, workedDays: 0, departments: [], projects: [], activities: [],
      ...activity,
      employeeName: employee.name,
    });
  }
  return [...directory.values()].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}
