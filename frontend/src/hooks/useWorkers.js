import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../config/api";
export function useWorkers(includeInactive = false) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef(null);
  const refresh = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(API_URL + "/api/workers" + (includeInactive ? "?includeInactive=true" : ""), { headers: { Authorization: "Bearer " + localStorage.getItem("token") }, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load employees.");
      if (!controller.signal.aborted) setWorkers(result.data || []);
    } catch (err) {
      if (!controller.signal.aborted) { setError(err.message); setWorkers([]); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [includeInactive]);
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { pending.current?.abort(); window.removeEventListener("focus", onFocus); };
  }, [refresh]);
  return { workers, loading, error, refresh };
}
