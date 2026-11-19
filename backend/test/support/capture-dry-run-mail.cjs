// Preloaded into spawned database-writing backends via
//   NODE_OPTIONS=--require test/support/capture-dry-run-mail.cjs
// so a test suite can recover the plaintext reset code from the only place it
// still exists after T-003 (storage holds SHA-256 digests): the rendered
// dry-run mail message, i.e. the exact channel the user experiences.
//
// Wraps the jsonTransport only - a real SMTP transport is never constructed in
// a test run, and the forced-failure seam never reaches createTransport at all.
// Each rendered message is appended as one JSON line: {pid, to, subject, html, text}.

const fs = require("node:fs");
const nodemailer = require("nodemailer");

const captureFile = process.env.WZ_MAIL_CAPTURE_FILE;
const real = nodemailer.createTransport.bind(nodemailer);

if (captureFile && !globalThis.__wzMailCaptureInstalled) {
  globalThis.__wzMailCaptureInstalled = true;

  nodemailer.createTransport = (options, ...rest) => {
    const transport = real(options, ...rest);
    if (!options || !options.jsonTransport) return transport;

    const sendMail = transport.sendMail.bind(transport);
    transport.sendMail = async (mail, callback) => {
      try {
        fs.appendFileSync(
          captureFile,
          JSON.stringify({
            pid: process.pid,
            to: mail.to,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          }) + "\n",
        );
      } catch {
        // Capturing must never break mail behaviour in the server under test.
      }
      return sendMail(mail, callback);
    };
    return transport;
  };
}

module.exports = {};
