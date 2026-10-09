async function sendLoginNotification({ name, username, role, loginAt = new Date() }) {
  const required = [
    "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS",
    "MAIL_FROM", "COMPANY_NOTIFICATION_EMAIL",
  ];
  if (required.some((key) => !process.env[key]?.trim())) {
    throw new Error("Email configuration is incomplete.");
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Email port is invalid.");
  }

  const nodemailer = require("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    logger: false,
    debug: false,
  });
  const date = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(loginAt);
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit",
    second: "2-digit", hour12: true,
  }).format(loginAt);

  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to: process.env.COMPANY_NOTIFICATION_EMAIL,
    subject: "Login Successful - Starlit Production System",
    text: [
      "Login Successful", "",
      "A user has successfully logged into the",
      "Starlit Production Management System.", "",
      `Name: ${name}`, `Username: ${username}`,
      `Role: ${role === "superadmin" ? "Super Admin" : "Admin"}`,
      `Date: ${date}`, `Time: ${time} (Asia/Kolkata)`,
    ].join("\n"),
  });
}

module.exports = { sendLoginNotification };
