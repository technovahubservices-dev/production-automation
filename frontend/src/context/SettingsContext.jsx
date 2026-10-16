import defaultDepartments from "../../../shared/departments.json";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_URL } from "../config/api";
export function resolveDepartments(configured = []) {
  const byName = new Map(configured.map(department => [department.name, department]));
  return [...defaultDepartments.map(department => ({ ...department, ...(byName.get(department.name) || {}) })), ...configured.filter(department => !defaultDepartments.some(item => item.name === department.name))];
}
const normalizeSettings = (settings) => ({ ...settings, departments: resolveDepartments(settings.departments) });
const SettingsContext = createContext(null);
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/settings`);
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.data?.departments) || !Array.isArray(result.data?.shifts)) throw new Error(result.message || "Unable to load settings.");
      setSettings(normalizeSettings(result.data));
      setError("");
      return result.data;
    } catch (err) {
      setError(err.message || "Unable to load settings.");
      return null;
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refreshSettings(); }, [refreshSettings]);
  const updateSettings = useCallback((saved) => { setSettings(normalizeSettings(saved)); setError(""); }, []);
  const unitFor = useCallback((name) => settings?.departments.find((d) => d.name === name)?.unit ?? "", [settings]);
  const departments = useMemo(() => (settings?.departments || []).filter(department => department.active === true), [settings]);
  const value = useMemo(() => ({ settings, departments, loading, error, refreshSettings, updateSettings, unitFor }), [settings, departments, loading, error, refreshSettings, updateSettings, unitFor]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
export function useSettings() { return useContext(SettingsContext); }
