import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../config/api";

export function useCheckedInWorkers() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef(null);
  const refresh = useCallback(async ({ background = false } = {}) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    if (!background) setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/attendance/checked-in-workers`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        signal: controller.signal, cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.data))
        throw new Error(result.message || "Unable to load checked-in employees. Please retry.");
      if (!controller.signal.aborted) { setWorkers(result.data); setError(""); }
    } catch (err) {
      if (!controller.signal.aborted) {
        setWorkers([]);
        setError(err.message || "Unable to load checked-in employees. Please retry.");
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    // SecureVerify runs in a separate app/device: observe committed attendance
    // through authenticated polling instead of trusting browser attendance flags.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !pending.current) refresh({ background: true });
    }, 10000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      pending.current?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { workers, loading, error, refresh };
}
