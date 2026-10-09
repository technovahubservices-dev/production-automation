// Stored weight fields remain kilograms. Conversion is for display only.
const fields = { CNC: "cuttingWeight", PTW: "weight", SETTING: "weight", WELDING: "rmt" };
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const kgToTon = (kg) => numeric(kg) / 1000;
export const formatTon = (value) => numeric(value) === 0 ? "0 TON" : `${numeric(value).toFixed(3)} TON`;
export const formatRmt = (value) => `${numeric(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} RMT`;
export const formatProduction = ({ value, unit }) => unit === "TON" ? formatTon(value) : unit === "RMT" ? formatRmt(value) : "?";

export function getEntryProduction(entry) {
  const field = fields[entry.department];
  if (!field) return { value: 0, unit: "" };
  return entry.department === "WELDING"
    ? { value: numeric(entry[field]), unit: "RMT" }
    : { value: kgToTon(entry[field]), unit: "TON" };
}

export function calculateProductionTotals(entries) {
  const raw = { CNC: 0, PTW: 0, SETTING: 0, WELDING: 0, CLEANING: 0 };
  for (const entry of entries) {
    const field = fields[entry.department];
    if (field) raw[entry.department] += numeric(entry[field]);
  }
  const departments = Object.fromEntries(Object.keys(raw).map((name) => [name,
    getEntryProduction({ department: name, [fields[name]]: raw[name] }),
  ]));
  return {
    totalTon: kgToTon(raw.CNC + raw.PTW + raw.SETTING),
    totalRmt: raw.WELDING,
    departments,
  };
}
