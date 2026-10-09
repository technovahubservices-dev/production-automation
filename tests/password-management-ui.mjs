import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformWithOxc } from "../frontend/node_modules/vite/dist/node/index.js";
import React from "../frontend/node_modules/react/index.js";
import { renderToStaticMarkup } from "../frontend/node_modules/react-dom/server.node.js";

async function compile(path, name, globals) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  source = source.replace(/import[\s\S]*?from ["'][^"']+["'];?\r?\n/g, "")
    .replace(/import ["'][^"']+["'];?\r?\n/g, "")
    .replace(/export default function/, "function").replace(/export default \w+;/, "");
  const { code } = await transformWithOxc(source, `${name}.jsx`, { jsx: { runtime: "classic" } });
  const context = { React, ...globals };
  vm.createContext(context);
  vm.runInContext(`${code}\nglobalThis.Component = ${name};`, context);
  return context.Component;
}
const accounts = [{ id: "account-1", name: "Manager", username: "manager", role: "admin" },
  { id: "account-2", name: "Owner", username: "owner", role: "superadmin" }];
let state = [], index = 0;
const calls = [];
const effects = [];
let failRequest = false;
const Component = await compile("../frontend/src/components/PasswordManagement.jsx", "PasswordManagement", {
  useState(initial) {
    const slot = index++;
    if (!(slot in state)) state[slot] = initial;
    return [state[slot], (value) => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }];
  },
  useEffect(fn) { effects.push(fn); },
  Eye: () => null, EyeOff: () => null, LockKeyhole: () => null,
  API_URL: "http://test", TextEncoder, AbortController,
  localStorage: { getItem: () => "test-token" },
  fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: !failRequest, json: async () => ({ success: !failRequest, data: accounts }) };
  },
});
function render() { index = 0; return Component(); }
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function find(predicate) { return nodes(render()).find(predicate); }
function input(id) { return find((node) => node.type === "input" && node.props.id === id); }
function fill(id, value) { input(id).props.onChange({ target: { value } }); }
function select(id) { find((node) => node.type === "select").props.onChange({ target: { value: id } }); }
async function submit() { await find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); }
render();
const cleanup = effects[0]();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls[0].url, "http://test/api/auth/users");
assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
assert.match(renderToStaticMarkup(render()), /Manager.*manager.*Admin/);
assert.match(renderToStaticMarkup(render()), /Owner.*owner.*Super Admin/);
assert.equal(input("new-password").props.type, "password");
assert.equal(input("confirm-password").props.type, "password");
select("account-1");
await submit();
assert.match(renderToStaticMarkup(render()), /confirmation are required/);
fill("new-password", "short"); fill("confirm-password", "short");
await submit();
assert.match(renderToStaticMarkup(render()), /at least 6 characters/);
fill("new-password", "new-password"); fill("confirm-password", "mismatched-password");
await submit();
assert.match(renderToStaticMarkup(render()), /do not match/);
assert.equal(calls.length, 1, "invalid forms do not make reset requests");
for (const [label, id] of [["new password", "new-password"], ["confirm new password", "confirm-password"]]) {
  const eye = find((node) => node.props?.["aria-label"] === `Show ${label}`);
  assert.equal(eye.props.type, "button");
  eye.props.onClick();
  assert.equal(input(id).props.type, "text");
  find((node) => node.props?.["aria-label"] === `Hide ${label}`).props.onClick();
  assert.equal(input(id).props.type, "password");
}
fill("confirm-password", "new-password");
await submit();
assert.equal(calls[1].url, "http://test/api/auth/users/account-1/password");
assert.equal(calls[1].options.method, "PATCH");
assert.deepEqual(JSON.parse(calls[1].options.body), { newPassword: "new-password" });
assert.match(renderToStaticMarkup(render()), /Password updated successfully for Manager \(Admin\)/);
assert.equal(input("new-password").props.value, "");
assert.equal(input("confirm-password").props.value, "");
assert.equal(input("new-password").props.type, "password");
assert.equal(input("confirm-password").props.type, "password");
select("account-2");
fill("new-password", "another-password"); fill("confirm-password", "another-password");
failRequest = true;
await submit();
assert.match(renderToStaticMarkup(render()), /Unable to update password/);
assert.equal(find((node) => node.props?.type === "submit").props.disabled, false);
cleanup();

const settings = { companyName: "Test company", plantName: "Test plant", departments: [], shifts: [], reportPreferences: {} };
let savedSettings;
let settingsRequest;
const Settings = await compile("../frontend/src/pages/Settings.jsx", "Settings", {
  useSettings: () => ({ settings, loading: false, updateSettings: (value) => { savedSettings = value; } }), useEffect() {},
  useState: (initial) => [initial === null ? settings : initial, () => {}],
  API_URL: "http://test", localStorage: { getItem: () => "test-token" },
  fetch: async (url, options) => {
    settingsRequest = { url, options };
    return { ok: true, json: async () => ({ success: true, data: settings }) };
  },
  PasswordManagement: () => React.createElement("div", null, "PASSWORD MANAGEMENT"),
  ...Object.fromEntries(["Building2", "Factory", "Clock3", "Ruler", "FileText", "Save", "CheckCircle2", "AlertCircle"].map((name) => [name, () => null])),
});
assert.ok(renderToStaticMarkup(Settings({ user: { role: "superadmin" } })).includes("PASSWORD MANAGEMENT"));
assert.ok(!renderToStaticMarkup(Settings({ user: { role: "admin" } })).includes("PASSWORD MANAGEMENT"));
for (const text of ["Facility information", "Department configuration", "Shift timings", "Measurement units", "Daily report configuration", "SAVE SETTINGS"]) {
  assert.ok(renderToStaticMarkup(Settings({ user: { role: "superadmin" } })).includes(text));
}
await nodes(Settings({ user: { role: "superadmin" } })).find((node) => node.props?.className === "settingsSaveButton").props.onClick();
assert.equal(settingsRequest.url, "http://test/api/settings");
assert.equal(settingsRequest.options.method, "PUT");
assert.deepEqual(JSON.parse(settingsRequest.options.body), settings);
assert.equal(savedSettings, settings);
console.log("PASS: role visibility, account loading, required/short/mismatched passwords, show/hide controls, reset payload, success cleanup, safe failure handling, existing Settings sections and save behavior.");
