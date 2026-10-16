import { useEffect, useState } from "react";
import { getLocalDate } from "../utils/attendance";

export function useLocalToday() {
  const [today, setToday] = useState(() => getLocalDate());
  useEffect(() => {
    let timer;
    const refresh = () => {
      setToday(getLocalDate());
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight - now + 50);
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}

export const formatToday = (today) => "Today: " + new Date(today + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function useAccessDate(user, initialDate) {
  const today = useLocalToday();
  const [date, setDate] = useState(initialDate);
  const isAdmin = user?.role === "admin";
  return [isAdmin ? today : date, (value) => { if (!isAdmin) setDate(value); }];
}
