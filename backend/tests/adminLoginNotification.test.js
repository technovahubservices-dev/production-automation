const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { login } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { sendLoginNotification } = require("../utils/emailService");

function response() {
  return {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("admin and superadmin login notifications and existing authentication", async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, {
    JWT_SECRET: "test-only-jwt-secret",
    SMTP_HOST: "smtp.example.test", SMTP_PORT: "587",
    SMTP_USER: "test-smtp-user", SMTP_PASS: "test-smtp-password",
    MAIL_FROM: "system@example.test", COMPANY_NOTIFICATION_EMAIL: "company@example.test",
  });
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    t.mock.restoreAll();
  });
  const admin = new User({
    name: "Test Admin", username: "admin", role: "admin", active: true,
    password: await bcrypt.hash("test-login-password", 4),
  });
  let foundUser = admin;
  let failSmtp = false;
  let mail = [];
  let options;
  const logs = [];
  // Stub only the SMTP boundary; no network or real email credentials are used.
  const nodemailer = { createTransport() {} };
  const originalLoad = Module._load;
  t.mock.method(Module, "_load", function (request, ...args) {
    if (request === "nodemailer") return nodemailer;
    return originalLoad.call(this, request, ...args);
  });
  t.mock.method(User, "findOne", async () => foundUser);
  t.mock.method(User, "findById", () => ({ select: async () => foundUser }));
  t.mock.method(console, "error", (...args) => logs.push(args.join(" ")));
  t.mock.method(nodemailer, "createTransport", (config) => {
    options = config;
    return { sendMail: async (message) => {
      mail.push(message);
      if (failSmtp) throw new Error(`Sensitive SMTP detail: ${process.env.SMTP_PASS}`);
    } };
  });
  async function attempt(body = { username: "admin", password: "test-login-password" }) {
    mail = [];
    const res = response();
    await login({ body }, res);
    return res;
  }

  await t.test("successful admin login sends one email and valid JWT works with middleware", async () => {
    const res = await attempt();
    assert.equal(res.statusCode, 200);
    assert.equal(mail.length, 1);
    assert.equal(mail[0].to, process.env.COMPANY_NOTIFICATION_EMAIL);
    assert.equal(mail[0].subject, "Login Successful - Starlit Production System");
    assert.match(mail[0].text, /^Login Successful\n\nA user has successfully logged into the\nStarlit Production Management System\./);
    assert.match(mail[0].text, /Name: Test Admin\nUsername: admin\nRole: Admin/);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.equal(decoded.id, String(admin._id));
    assert.equal(decoded.role, "admin");
    assert.equal(decoded.exp - decoded.iat, 12 * 60 * 60);
    for (const secret of [admin.password, "test-login-password", res.body.token,
      process.env.JWT_SECRET, process.env.SMTP_PASS]) assert.ok(!mail[0].text.includes(secret));
    const req = { headers: { authorization: `Bearer ${res.body.token}` } };
    let authenticated = false;
    await protect(req, response(), () => { authenticated = true; });
    assert.equal(authenticated, true);
    assert.equal(req.user, admin);
  });
  await t.test("wrong password sends no email", async () => {
    const res = await attempt({ username: "admin", password: "wrong-password" });
    assert.equal(res.statusCode, 401);
    assert.equal(mail.length, 0);
  });
  await t.test("invalid username sends no email", async () => {
    foundUser = null;
    assert.equal((await attempt()).statusCode, 401);
    assert.equal(mail.length, 0);
    foundUser = admin;
  });
  await t.test("inactive account sends no email", async () => {
    admin.active = false;
    for (const role of ["admin", "superadmin"]) {
      admin.role = role;
      assert.equal((await attempt()).statusCode, 403);
      assert.equal(mail.length, 0);
    }
    admin.role = "admin";
    admin.active = true;
  });
  await t.test("superadmin login sends one email with the correct role and configured recipient", async () => {
    admin.role = "superadmin";
    const res = await attempt();
    assert.equal(res.statusCode, 200);
    assert.equal(mail.length, 1);
    assert.match(mail[0].text, /Role: Super Admin\n/);
    assert.equal(mail[0].to, process.env.COMPANY_NOTIFICATION_EMAIL);
    assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).role, "superadmin");
    admin.role = "admin";
  });
  await t.test("wrong superadmin password sends no email", async () => {
    admin.role = "superadmin";
    assert.equal((await attempt({ username: "admin", password: "wrong-password" })).statusCode, 401);
    assert.equal(mail.length, 0);
    admin.role = "admin";
  });
  await t.test("SMTP failure preserves login and logs only a safe message", async () => {
    failSmtp = true;
    for (const role of ["admin", "superadmin"]) {
      admin.role = role;
      const res = await attempt();
      assert.equal(res.statusCode, 200);
      assert.equal(mail.length, 1);
      assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).role, role);
    }
    assert.deepEqual(logs, Array(2).fill("Login email failed: notification could not be sent."));
    admin.role = "admin";
    failSmtp = false;
  });
  await t.test("missing email configuration preserves login", async () => {
    delete process.env.SMTP_HOST;
    assert.equal((await attempt()).statusCode, 200);
    assert.equal(mail.length, 0);
    process.env.SMTP_HOST = "smtp.example.test";
  });
  await t.test("missing credentials send no email", async () => {
    assert.equal((await attempt({ username: "admin" })).statusCode, 400);
    assert.equal(mail.length, 0);
  });
  await t.test("JWT generation failure sends no email", async () => {
    const secret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.equal((await attempt()).statusCode, 500);
      assert.equal(mail.length, 0);
    } finally {
      process.env.JWT_SECRET = secret;
    }
  });
  await t.test("email dates use India timezone across UTC midnight", async () => {
    await sendLoginNotification({
      name: "Test Admin", username: "admin", role: "admin", loginAt: new Date("2026-10-07T20:00:00Z"),
    });
    assert.match(mail[0].text, /Date: 08\/10\/2026/);
    assert.match(mail[0].text, /Time: 01:30:00 am \(Asia\/Kolkata\)/i);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    process.env.SMTP_PORT = "465";
    await sendLoginNotification({ name: "Test Admin", username: "admin", role: "admin" });
    assert.equal(options.secure, true);
  });
});
