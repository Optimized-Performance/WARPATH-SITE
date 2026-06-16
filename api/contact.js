// Warpath Collective lead-capture endpoint.
// Receives the signup form POST and emails the lead via Resend.
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY  - your Resend API key (required)
//   LEAD_TO         - the email address leads are delivered to (required)
//   LEAD_FROM       - sender, e.g. "Warpath Collective <leads@warpathcollective.com>"
//                     (optional; defaults to Resend's shared onboarding sender until
//                      warpathcollective.com is verified in Resend)

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

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_TO;
  const from = process.env.LEAD_FROM || 'Warpath Collective <onboarding@resend.dev>';

  if (!apiKey || !to) {
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
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from,
        to: to,
        reply_to: email,
        subject: 'New lead: ' + name,
        html: html
      })
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ success: false, error: 'Send failed', detail: detail });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String((err && err.message) || err) });
  }
};
