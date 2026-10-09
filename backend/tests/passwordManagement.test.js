const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const emailService = require("../utils/emailService");

test("password management protected APIs, real password hooks, and login", async (t) => {
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "password-management-test-secret";
  t.after(() => {
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
    t.mock.restoreAll();
  });
  let notifications = 0;
  t.mock.method(emailService, "sendLoginNotification", async () => { notifications++; });
  // Load routes after stubbing email delivery. Database IO alone is stubbed;
  // Mongoose validation/save hooks and bcrypt execute normally.
  const routes = require("../routes/authRoutes");
  const oldPassword = "old-test-password";
  const hash = await bcrypt.hash(oldPassword, 10);
  const rows = new Map();
  for (const [id, role] of [["111111111111111111111111", "superadmin"],
    ["222222222222222222222222", "admin"], ["333333333333333333333333", "superadmin"],
    ["444444444444444444444444", "other"]]) {
    rows.set(id, { _id: id, name: role, username: id, role, active: true, password: hash });
  }
  t.mock.method(User, "findById", (id) => {
    const row = rows.get(String(id));
    const promise = Promise.resolve(row ? User.hydrate({ ...row }) : null);
    promise.select = async () => row ? { ...row, password: undefined } : null;
    return promise;
  });
  t.mock.method(User, "findOne", async ({ username }) => {
    const row = [...rows.values()].find((item) => item.username === username);
    return row ? User.hydrate({ ...row }) : null;
  });
  t.mock.method(User, "find", (filter) => ({ select(fields) {
    assert.equal(fields, "_id name username role");
    assert.deepEqual(filter, { role: { $in: ["admin", "superadmin"] } });
    return { sort: async () => [...rows.values()].filter((row) => filter.role.$in.includes(row.role)) };
  } }));
  let writes = 0;
  t.mock.method(User.collection, "updateOne", async (filter, update) => {
    writes++;
    Object.assign(rows.get(String(filter._id)), update.$set);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  });
  const app = express();
  app.use(express.json());
  app.use("/api/auth", routes);
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const superId = "111111111111111111111111";
  const adminId = "222222222222222222222222";
  const otherSuperId = "333333333333333333333333";
  const token = (id) => jwt.sign({ id, role: rows.get(id).role }, process.env.JWT_SECRET);
  const superToken = token(superId);
  async function request(path, { method = "GET", body, bearer = superToken } = {}) {
    const result = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: result.status, body: await result.json() };
  }
  const reset = (id, newPassword, bearer = superToken) => request(`/users/${id}/password`, {
    method: "PATCH", body: { newPassword }, bearer,
  });

  await t.test("unauthenticated and admin callers cannot list or reset", async () => {
    for (const [bearer, status] of [[null, 401], ["invalid", 401], [token(adminId), 403]]) {
      assert.equal((await request("/users", { bearer })).status, status);
      assert.equal((await reset(adminId, "new-password", bearer)).status, status);
    }
    assert.equal(writes, 0);
  });
  await t.test("account listing filters roles and never returns hashes", async () => {
    const result = await request("/users");
    assert.equal(result.status, 200);
    assert.equal(result.body.data.length, 3);
    for (const row of result.body.data) assert.deepEqual(Object.keys(row).sort(), ["id", "name", "role", "username"]);
    assert.ok(!JSON.stringify(result.body).includes(hash));
  });
  await t.test("invalid passwords and targets are rejected without writes", async () => {
    for (const value of [undefined, null, 123456, {}, "", "short", "      ", "a".repeat(73), "😀".repeat(19)]) {
      assert.equal((await reset(adminId, value)).status, 400);
    }
    assert.equal((await reset("bad-id", "new-password")).status, 400);
    assert.equal((await reset("555555555555555555555555", "new-password")).status, 404);
    assert.equal((await reset("444444444444444444444444", "new-password")).status, 404);
    assert.equal(writes, 0);
  });
  for (const id of [adminId, otherSuperId, superId]) {
    await t.test(`reset ${id === superId ? "own superadmin" : rows.get(id).role} password, then authenticate`, async () => {
      const nextPassword = "new-test-password";
      const result = await reset(id, nextPassword);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { success: true, message: "Password updated successfully." });
      assert.notEqual(rows.get(id).password, nextPassword);
      assert.equal(await bcrypt.compare(nextPassword, rows.get(id).password), true);
      assert.equal(await bcrypt.compare(oldPassword, rows.get(id).password), false);
      const before = notifications;
      assert.equal((await request("/login", { method: "POST", body: { username: id, password: oldPassword } })).status, 401);
      assert.equal(notifications, before);
      const login = await request("/login", { method: "POST", body: { username: id, password: nextPassword } });
      assert.equal(login.status, 200);
      assert.equal(notifications, before + 1);
      assert.equal(jwt.verify(login.body.token, process.env.JWT_SECRET).id, id);
      assert.ok(!JSON.stringify(login.body).includes(rows.get(id).password));
      assert.ok(!JSON.stringify(login.body).includes(nextPassword));
      assert.equal((await request("/users")).status, 200, "original superadmin JWT remains valid");
    });
  }
  await t.test("storage failures expose neither password nor database errors", async () => {
    const mock = t.mock.method(User.collection, "updateOne", async () => { throw new Error("sensitive-database-error"); });
    assert.deepEqual(await reset(adminId, "not-returned-password"), {
      status: 500, body: { success: false, message: "Unable to update password." },
    });
    mock.mock.restore();
  });
});
