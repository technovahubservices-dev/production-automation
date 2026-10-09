import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_URL } from "../config/api";
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
      setSettings(result.data);
      setError("");
      return result.data;
    } catch (err) {
      setError(err.message || "Unable to load settings.");
      return null;
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refreshSettings(); }, [refreshSettings]);
  const updateSettings = useCallback((saved) => { setSettings(saved); setError(""); }, []);
  const unitFor = useCallback((name) => settings?.departments.find((d) => d.name === name)?.unit ?? "", [settings]);
  const value = useMemo(() => ({ settings, loading, error, refreshSettings, updateSettings, unitFor }), [settings, loading, error, refreshSettings, updateSettings, unitFor]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
export function useSettings() { return useContext(SettingsContext); }
