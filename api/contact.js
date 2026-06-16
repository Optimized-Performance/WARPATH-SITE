// Warpath Collective lead-capture endpoint.
// Receives the signup form POST and emails the lead through Gmail (SMTP via Nodemailer).
// Env vars (set in Vercel -> Project -> Settings -> Environment Variables):
//   GMAIL_USER          - the Gmail address that sends the mail (e.g. you@gmail.com)
//   GMAIL_APP_PASSWORD  - a Google App Password (16 chars, requires 2-Step Verification)
//   LEAD_TO             - where leads are delivered (optional; defaults to GMAIL_USER)

const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const { name, email, business, message, botcheck } = body;

  // Honeypot: bots fill this; humans never see it.
  if (botcheck) return res.status(200).json({ success: true });

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.LEAD_TO || user;

  if (!user || !pass) {
    return res.status(500).json({ success: false, error: 'Email not configured' });
  }

  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  const html =
    '<h2>New Warpath Collective lead</h2>' +
    '<p><strong>Name:</strong> ' + esc(name) + '</p>' +
    '<p><strong>Email:</strong> ' + esc(email) + '</p>' +
    '<p><strong>Business / site:</strong> ' + esc(business || '—') + '</p>' +
    '<p><strong>What they need:</strong><br>' + esc(message).replace(/\n/g, '<br>') + '</p>';

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: user, pass: pass }
    });
    await transporter.sendMail({
      from: '"Warpath Collective" <' + user + '>',
      to: to,
      replyTo: email,
      subject: 'New lead: ' + name,
      html: html
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String((err && err.message) || err) });
  }
};
