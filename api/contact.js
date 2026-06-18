// Warpath Collective lead-capture endpoint.
// Receives the signup form POST and emails the lead via Resend.
// Env vars (set in Vercel -> Project -> Settings -> Environment Variables):
//   RESEND_API_KEY  - your Resend API key (starts with "re_").
//   MAIL_FROM       - verified sender address (e.g. hello@warpathcollective.com).
//   LEAD_TO         - where leads are delivered; comma-separate for multiple
//                     (e.g. "ethan@warpathcollective.com, matt@warpathcollective.com").

const { Resend } = require('resend');

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

  // Reject malformed addresses (also keeps the reply-to header clean).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return res.status(400).json({ success: false, error: 'Invalid email address' });
  }

  // Cap field lengths so a bot can't post a multi-megabyte payload.
  const clip = function (s, max) { return String(s == null ? '' : s).trim().slice(0, max); };
  const lead = {
    name: clip(name, 200),
    email: clip(email, 320),
    business: clip(business, 200),
    message: clip(message, 5000)
  };

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.MAIL_FROM;
  const to = (process.env.LEAD_TO || fromAddr || '')
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

  if (!apiKey || !fromAddr || !to.length) {
    return res.status(500).json({ success: false, error: 'Email not configured' });
  }

  const from = '"Warpath Collective" <' + fromAddr + '>';

  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  const html =
    '<h2>New Warpath Collective lead</h2>' +
    '<p><strong>Name:</strong> ' + esc(lead.name) + '</p>' +
    '<p><strong>Email:</strong> ' + esc(lead.email) + '</p>' +
    '<p><strong>Business / site:</strong> ' + esc(lead.business || '—') + '</p>' +
    '<p><strong>What they need:</strong><br>' + esc(lead.message).replace(/\n/g, '<br>') + '</p>';

  const resend = new Resend(apiKey);

  try {
    // 1. Notify the team (the critical send).
    const sent = await resend.emails.send({
      from: from,
      to: to,
      replyTo: lead.email,
      subject: 'New lead: ' + lead.name,
      html: html
    });
    if (sent && sent.error) {
      return res.status(500).json({ success: false, error: String(sent.error.message || sent.error) });
    }

    // 2. Confirmation to the lead (best-effort; never fail the request on this).
    try {
      await resend.emails.send({
        from: from,
        to: [lead.email],
        replyTo: to,
        subject: 'We got your message — Warpath Collective',
        text:
          'Hi ' + lead.name + ',\n\n' +
          'Thanks for reaching out to Warpath Collective. We received your message and will be in touch within one business day.\n\n' +
          'What you sent us:\n' + lead.message + '\n\n' +
          'We row together.\n' +
          'Warpath Collective'
      });
    } catch (e) { /* confirmation is non-critical; the lead is already captured */ }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String((err && err.message) || err) });
  }
};
