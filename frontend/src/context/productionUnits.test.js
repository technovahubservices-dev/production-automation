import test from "node:test";
import assert from "node:assert/strict";
import { kgToTon, getEntryProduction, calculateProductionTotals, formatTon, formatRmt, formatProduction } from "./productionUnits.js";

test("weights become TON while welding remains separate RMT", () => {
  const entries = [
    { department: "CNC", cuttingWeight: 77, weight: 999, rmt: 999 },
    { department: "PTW", weight: 34 },
    { department: "SETTING", weight: 88 },
    { department: "WELDING", rmt: 232, weight: 999 },
    { department: "CLEANING", weight: 999, rmt: 999 },
  ].map(Object.freeze);
  const totals = calculateProductionTotals(Object.freeze(entries));
  assert.equal(totals.totalTon, 0.199);
  assert.equal(totals.totalRmt, 232);
  assert.equal(formatProduction(totals.departments.CNC), "0.077 TON");
  assert.equal(formatProduction(totals.departments.PTW), "0.034 TON");
  assert.equal(formatProduction(totals.departments.SETTING), "0.088 TON");
  assert.equal(formatProduction(totals.departments.WELDING), "232 RMT");
  assert.equal(formatProduction(totals.departments.CLEANING), "?");
  assert.equal(entries[0].cuttingWeight, 77);
});

test("formatting preserves three decimal places and handles zero", () => {
  for (const [kg, expected] of [[77,"0.077 TON"],[200,"0.200 TON"],[1000,"1.000 TON"],[1250,"1.250 TON"],[0,"0 TON"]]) {
    assert.equal(formatTon(kgToTon(kg)), expected);
  }
  assert.equal(formatRmt(232), "232 RMT");
  assert.equal(getEntryProduction({department:"CNC",cuttingWeight:"77"}).value, 0.077);
});

test("aggregate raw weights before conversion or formatting", () => {
  const totals = calculateProductionTotals([
    {department:"CNC",cuttingWeight:0.4},
    {department:"PTW",weight:0.4},
    {department:"SETTING",weight:0.4},
    {department:"WELDING",rmt:100},
    {department:"WELDING",rmt:132},
  ]);
  assert.equal(formatTon(totals.totalTon), "0.001 TON");
  assert.equal(totals.totalRmt, 232);
  const empty = calculateProductionTotals([]);
  assert.equal(empty.totalTon, 0);
  assert.equal(empty.totalRmt, 0);
  assert.equal(getEntryProduction({department:"PTW"}).value, 0);
});
