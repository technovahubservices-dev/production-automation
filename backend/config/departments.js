const defaults = require('../../shared/departments.json');
function resolveDepartments(configured = []) {
  configured = configured.map(department => typeof department.toObject === "function" ? department.toObject() : department);
  const byName = new Map(configured.map(department => [department.name, department]));
  return [...defaults.map(department => ({ ...department, ...(byName.get(department.name) || {}) })), ...configured.filter(department => !defaults.some(item => item.name === department.name))];
}
module.exports = { defaults, resolveDepartments };
