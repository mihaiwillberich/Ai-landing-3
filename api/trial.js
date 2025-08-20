// api/trial.js
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

module.exports = async (req, res) => {
  const log = (...a)=>console.log('[trial]', ...a);
  log('HIT', req.method, req.url, req.headers['content-type'] || '');

  if (req.method !== 'POST') return res.status(405).end('Only POST');

  try {
    // 1) Citește corpul RAW (merge și pentru JSON, și pentru form-urlencoded)
    let raw = ''; for await (const c of req) raw += c;
    log('RAW', raw.slice(0, 300));

    // 2) Parsează în funcție de content-type
    const ct = (req.headers['content-type'] || '').split(';')[0].trim();
    let email = '', company = '';
    try {
      if (ct === 'application/json') {
        const obj = JSON.parse(raw || '{}');
        email   = (obj.email   || '').trim();
        company = (obj.company || '').trim();
      } else if (ct === 'application/x-www-form-urlencoded') {
        const p = new URLSearchParams(raw);
        email   = (p.get('email')   || '').trim();
        company = (p.get('company') || '').trim();
      } else {
        // fallback
        const obj = JSON.parse(raw || '{}');
        email   = (obj.email   || '').trim();
        company = (obj.company || '').trim();
      }
    } catch (e) {
      log('PARSE_ERR', e?.message);
    }

    // 3) Validează
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !company) {
      log('INVALID', { email, company });
      return res.status(400).end('invalid');
    }

    // 4) Trimite prin Resend
    const welcome = process.env.WELCOME_URL || 'https://ai-landing-self-xi.vercel.app/welcome.html';
    const from    = process.env.FROM_EMAIL   || 'onboarding@resend.dev';
    const html    = `
      <h2>Bun venit, ${escapeHtml(company)}</h2>
      <p>Acces demo 7 zile:</p>
      <p><a href="${welcome}?email=${encodeURIComponent(email)}">Intră în aplicație</a></p>
    `;

    log('RESEND about to send', { to: email, from });

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY || ''}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Acces demo – Free Trial 7 zile',
        html
      })
    });

    const text = await r.text().catch(()=> '');
    log('RESEND response', r.status, text.slice(0, 300));

    if (!r.ok) return res.status(502).end('send_failed');

    // 5) Răspunde prietenos: JSON pt fetch, redirect pt submit nativ
    const accept = (req.headers['accept'] || '').toLowerCase();
    if (accept.includes('application/json') || accept.includes('*/*')) {
      return res.status(200).json({ ok: true });
    } else {
      res.statusCode = 303; res.setHeader('Location', '/thanks.html'); return res.end();
    }
  } catch (err) {
    console.error('[trial] ERROR', err?.stack || err);
    return res.status(500).end('server_error');
  }
};
