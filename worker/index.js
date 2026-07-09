// Modulr site worker: static site + secure Square payment + ticket email.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/pay') {
      return handlePay(request, env);
    }
    const res = await env.ASSETS.fetch(request);
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.indexOf('text/html') !== -1) {
        const h = new Headers(res.headers);
        h.set('Cache-Control', 'no-cache');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
      }
    } catch (e) {}
    return res;
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
function money(cents, cur) { return (cur || 'AUD') + ' ' + (Math.round(cents) / 100).toFixed(2); }
function ticketNumber() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return 'MOD-' + String(n).padStart(6, '0');
}

function ticketEmailHtml(o) {
  const sub = esc(o.date) + (o.city ? (' &middot; ' + esc(o.city)) : '') + (o.doors ? (' &middot; Doors ' + esc(o.doors)) : '');
  return '<!doctype html><html><body style="margin:0;background:#000;padding:24px;font-family:Arial,Helvetica,sans-serif;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#0b0b0b;border:1px solid #222;">'
    + '<tr><td style="padding:28px 28px 6px;"><div style="font-size:26px;font-weight:900;letter-spacing:2px;color:#fff;">MODULR</div>'
    + '<div style="font-size:11px;letter-spacing:3px;color:#8a8a8a;text-transform:uppercase;margin-top:6px;">Your Ticket</div></td></tr>'
    + '<tr><td style="padding:6px 28px 0;"><div style="font-size:22px;font-weight:800;color:#fff;text-transform:uppercase;">' + esc(o.venue) + '</div>'
    + '<div style="font-size:13px;color:#bdbdbd;margin-top:6px;">' + sub + '</div></td></tr>'
    + '<tr><td style="padding:20px 28px;"><div style="border:1px dashed #333;border-radius:10px;padding:18px;text-align:center;">'
    + '<div style="font-size:11px;letter-spacing:3px;color:#8a8a8a;text-transform:uppercase;">Ticket Number</div>'
    + '<div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;margin-top:6px;">' + esc(o.ticketNo) + '</div></div></td></tr>'
    + '<tr><td style="padding:0 28px 26px;"><div style="font-size:13px;color:#bdbdbd;">Name: <span style="color:#fff;">' + esc(o.name) + '</span></div>'
    + '<div style="font-size:13px;color:#bdbdbd;margin-top:4px;">Paid: <span style="color:#fff;">' + esc(o.amount) + '</span></div>'
    + '<div style="font-size:12px;color:#7a7a7a;margin-top:16px;">Show this email at the door. See you there.</div></td></tr>'
    + '</table></body></html>';
}

async function sendEmail(env, to, subject, html) {
  const key = env.RESEND_API_KEY;
  if (!key || !to) return false;
  const from = env.TICKET_FROM || 'Modulr Tickets <onboarding@resend.dev>';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from, to: [to], subject: subject, html: html })
    });
    return resp.ok;
  } catch (e) { return false; }
}

async function handlePay(request, env) {
  try {
    const { sourceId, amount, currency, note, buyerEmail, buyerName, kind, event } = await request.json();
    if (!sourceId || !amount) return json({ ok: false, error: 'Missing payment details' }, 400);

    const token = env.SQUARE_ACCESS_TOKEN;
    if (!token) return json({ ok: false, error: 'Checkout is not switched on yet' }, 503);

    const base = env.SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
    const locationId = env.SQUARE_LOCATION_ID || '';

    let payCurrency = currency || 'AUD';
    try {
      const locResp = await fetch(base + '/v2/locations/' + locationId, { headers: { 'Authorization': 'Bearer ' + token } });
      const locData = await locResp.json();
      if (locData && locData.location && locData.location.currency) payCurrency = locData.location.currency;
    } catch (e) {}

    const body = {
      source_id: sourceId,
      idempotency_key: crypto.randomUUID(),
      amount_money: { amount: Math.round(amount), currency: payCurrency },
      location_id: locationId,
      note: note ? String(note).slice(0, 480) : 'Modulr'
    };
    if (buyerEmail && String(buyerEmail).indexOf('@') > 0) body.buyer_email_address = String(buyerEmail).slice(0, 254);

    const resp = await fetch(base + '/v2/payments', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) {
      const msg = data && data.errors && data.errors[0] ? (data.errors[0].detail || data.errors[0].code) : 'Payment failed';
      return json({ ok: false, error: msg }, 400);
    }

    // Payment succeeded. For tickets, mint a number and email it.
    let ticketNo = null, emailed = false;
    if (kind === 'ticket') {
      ticketNo = ticketNumber();
      const ev = event || {};
      const html = ticketEmailHtml({
        ticketNo: ticketNo,
        name: buyerName || '',
        venue: ev.venue || 'Modulr show',
        city: ev.city || '',
        date: ev.date || '',
        doors: ev.doors || '',
        amount: money(amount, payCurrency)
      });
      emailed = await sendEmail(env, buyerEmail, 'Your Modulr ticket ' + ticketNo, html);
    }

    return json({ ok: true, id: data.payment && data.payment.id, ticketNo: ticketNo, emailed: emailed });
  } catch (e) {
    return json({ ok: false, error: 'Server error, please try again' }, 500);
  }
}
