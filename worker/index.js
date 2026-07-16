// Modulr site worker: static site + secure Square payment + ticket email.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/pay') {
      return handlePay(request, env, ctx);
    }
    if (request.method === 'POST' && url.pathname === '/api/subscribe') {
      return handleSubscribe(request, env);
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
function refNo(prefix) {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return prefix + String(n).padStart(6, '0');
}

function ticketEmailHtml(o) {
  var logo = 'https://modulrofficial.com/uploads/modulr-wordmark.png';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:24px 12px;background:#000000;font-family:Arial,Helvetica,sans-serif;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:0 auto;background:#0b0b0b;border:1px solid #222222;border-radius:16px;">'
    + '<tr><td align="center" style="padding:34px 32px 0;">'
    + '<img src="' + logo + '" width="196" alt="MODULR" style="display:block;width:196px;max-width:58%;height:auto;">'
    + '<div style="font-size:12px;font-weight:bold;letter-spacing:6px;color:#8a8a8a;margin-top:14px;">E &middot; TICKET</div></td></tr>'
    + '<tr><td style="padding:18px 32px 0;"><div style="border-top:1px solid #222222;font-size:0;line-height:0;">&nbsp;</div></td></tr>'
    + '<tr><td align="center" style="padding:22px 32px 0;">'
    + '<div style="font-size:30px;font-weight:800;letter-spacing:1px;color:#ffffff;text-transform:uppercase;line-height:1.08;">' + esc(o.venue) + '</div>'
    + (o.city ? '<div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#bdbdbd;text-transform:uppercase;margin-top:10px;">' + esc(o.city) + '</div>' : '')
    + (o.address ? '<div style="font-size:12px;color:#8a8a8a;margin-top:8px;">' + esc(o.address) + '</div>' : '') + '</td></tr>'
    + '<tr><td style="padding:22px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td align="center" width="50%" style="border-right:1px solid #222222;padding:2px 6px;"><div style="font-size:11px;font-weight:bold;letter-spacing:4px;color:#8a8a8a;">DATE</div>'
    + '<div style="font-size:19px;font-weight:800;color:#ffffff;margin-top:6px;">' + esc(o.date || 'TBA') + '</div></td>'
    + '<td align="center" width="50%" style="padding:2px 6px;"><div style="font-size:11px;font-weight:bold;letter-spacing:4px;color:#8a8a8a;">DOORS</div>'
    + '<div style="font-size:19px;font-weight:800;color:#ffffff;margin-top:6px;">' + esc(o.doors || 'TBA') + '</div></td>'
    + '</tr></table></td></tr>'
    + '<tr><td style="padding:24px 22px 0;"><div style="border-top:2px dashed #3a3a3a;font-size:0;line-height:0;">&nbsp;</div></td></tr>'
    + '<tr><td align="center" style="padding:20px 32px 0;"><div style="font-size:11px;font-weight:bold;letter-spacing:5px;color:#8a8a8a;">ADMIT ONE</div>'
    + '<div style="font-size:30px;font-weight:800;letter-spacing:6px;color:#ffffff;margin-top:10px;font-family:Courier New,Courier,monospace;">' + esc(o.ticketNo) + '</div></td></tr>'
    + '<tr><td style="padding:22px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr><td style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#8a8a8a;">NAME</td><td align="right" style="font-size:15px;font-weight:bold;color:#ffffff;">' + esc(o.name) + '</td></tr>'
    + '<tr><td style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#8a8a8a;padding-top:8px;">PAID</td><td align="right" style="font-size:15px;font-weight:bold;color:#ffffff;padding-top:8px;">' + esc(o.amount) + '</td></tr>'
    + '</table></td></tr>'
    + '<tr><td align="center" style="padding:22px 32px 30px;"><div style="font-size:12px;color:#7a7a7a;">Show this email at the door. See you on the floor.</div></td></tr>'
    + '</table></body></html>';
}

function orderEmailHtml(o) {
  var logo = 'https://modulrofficial.com/uploads/modulr-wordmark.png';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:24px 12px;background:#000000;font-family:Arial,Helvetica,sans-serif;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:0 auto;background:#0b0b0b;border:1px solid #222222;border-radius:16px;">'
    + '<tr><td align="center" style="padding:34px 32px 0;">'
    + '<img src="' + logo + '" width="196" alt="MODULR" style="display:block;width:196px;max-width:58%;height:auto;">'
    + '<div style="font-size:12px;font-weight:bold;letter-spacing:6px;color:#8a8a8a;margin-top:14px;">ORDER CONFIRMED</div></td></tr>'
    + '<tr><td style="padding:18px 32px 0;"><div style="border-top:1px solid #222222;font-size:0;line-height:0;">&nbsp;</div></td></tr>'
    + '<tr><td align="center" style="padding:22px 32px 0;">'
    + '<div style="font-size:28px;font-weight:800;letter-spacing:1px;color:#ffffff;text-transform:uppercase;line-height:1.08;">' + esc(o.product) + '</div>'
    + '<div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#bdbdbd;text-transform:uppercase;margin-top:10px;">Size ' + esc(o.size) + '</div></td></tr>'
    + '<tr><td style="padding:24px 22px 0;"><div style="border-top:2px dashed #3a3a3a;font-size:0;line-height:0;">&nbsp;</div></td></tr>'
    + '<tr><td align="center" style="padding:20px 32px 0;"><div style="font-size:11px;font-weight:bold;letter-spacing:5px;color:#8a8a8a;">ORDER NUMBER</div>'
    + '<div style="font-size:30px;font-weight:800;letter-spacing:6px;color:#ffffff;margin-top:10px;font-family:Courier New,Courier,monospace;">' + esc(o.orderNo) + '</div></td></tr>'
    + '<tr><td style="padding:22px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr><td style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#8a8a8a;">NAME</td><td align="right" style="font-size:15px;font-weight:bold;color:#ffffff;">' + esc(o.name) + '</td></tr>'
    + '<tr><td valign="top" style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#8a8a8a;padding-top:8px;">SHIP TO</td><td align="right" style="font-size:14px;color:#ffffff;padding-top:8px;">' + esc(o.address) + '</td></tr>'
    + '<tr><td style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#8a8a8a;padding-top:8px;">PAID</td><td align="right" style="font-size:15px;font-weight:bold;color:#ffffff;padding-top:8px;">' + esc(o.amount) + '</td></tr>'
    + '</table></td></tr>'
    + '<tr><td align="center" style="padding:22px 32px 30px;"><div style="font-size:12px;color:#7a7a7a;">The band will post this to the address above. Thanks for the support.</div></td></tr>'
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
      body: JSON.stringify({ from: from, to: [to], subject: subject, html: html, reply_to: env.TICKET_REPLY_TO || 'modulrband@gmail.com' })
    });
    return resp.ok;
  } catch (e) { return false; }
}

async function handleSubscribe(request, env) {
  try {
    const { email } = await request.json();
    if (!email || String(email).indexOf('@') < 1) return json({ ok: false, error: 'Please enter a valid email' }, 400);
    const base = env.MC_URL, u = env.MC_U, id = env.MC_ID, fid = env.MC_FID || '';
    if (!base || !u || !id) return json({ ok: false, error: 'Signup is not switched on yet' }, 503);
    const q = 'u=' + encodeURIComponent(u) + '&id=' + encodeURIComponent(id) + (fid ? ('&f_id=' + encodeURIComponent(fid)) : '') + '&EMAIL=' + encodeURIComponent(email) + '&c=cb';
    const resp = await fetch(base + '/subscribe/post-json?' + q, { headers: { 'User-Agent': 'ModulrSite' } });
    const t = await resp.text();
    let data = {};
    const m = t.match(/\{[\s\S]*\}/);
    if (m) { try { data = JSON.parse(m[0]); } catch (e) {} }
    if (data.result === 'success') return json({ ok: true });
    const msg = (data.msg || 'Could not sign you up, please try again').replace(/^\d+\s*-\s*/, '');
    if (/already/i.test(msg)) return json({ ok: true, already: true });
    return json({ ok: false, error: msg });
  } catch (e) {
    return json({ ok: false, error: 'Something went wrong, please try again' }, 500);
  }
}

function mcSubscribeUrl(env, email, first, last) {
  const base = env.MC_URL, u = env.MC_U, id = env.MC_ID, fid = env.MC_FID || '';
  if (!base || !u || !id || !email) return null;
  let q = 'u=' + encodeURIComponent(u) + '&id=' + encodeURIComponent(id) + (fid ? ('&f_id=' + encodeURIComponent(fid)) : '') + '&EMAIL=' + encodeURIComponent(email);
  if (first) q += '&FNAME=' + encodeURIComponent(first);
  if (last) q += '&LNAME=' + encodeURIComponent(last);
  return base + '/subscribe/post-json?' + q + '&c=cb';
}
async function mcAddQuietly(env, email, name) {
  try {
    const parts = String(name || '').trim().split(/\s+/);
    const first = parts.shift() || '';
    const last = parts.join(' ');
    const url = mcSubscribeUrl(env, email, first, last);
    if (!url) return;
    await fetch(url, { headers: { 'User-Agent': 'ModulrSite' } });
  } catch (e) {}
}

async function handlePay(request, env, ctx) {
  try {
    const { sourceId, amount, currency, note, buyerEmail, buyerName, kind, event, item } = await request.json();
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

    // Payment succeeded. Mint a reference and email it.
    let ticketNo = null, orderNo = null, emailed = false;
    if (kind === 'ticket') {
      ticketNo = refNo('MOD');
      const ev = event || {};
      const html = ticketEmailHtml({
        ticketNo: ticketNo, name: buyerName || '',
        venue: ev.venue || 'Modulr show', city: ev.city || '', date: ev.date || '', doors: ev.doors || '', address: ev.address || '',
        amount: money(amount, payCurrency)
      });
      emailed = await sendEmail(env, buyerEmail, 'Your Modulr ticket ' + ticketNo, html);
    } else if (kind === 'merch') {
      orderNo = refNo('ORD');
      const it = item || {};
      const html = orderEmailHtml({
        orderNo: orderNo, name: buyerName || '',
        product: it.product || 'Modulr merch', size: it.size || '', address: it.address || '',
        amount: money(amount, payCurrency)
      });
      emailed = await sendEmail(env, buyerEmail, 'Your Modulr order ' + orderNo, html);
    }

    if (buyerEmail && String(buyerEmail).indexOf('@') > 0 && ctx && ctx.waitUntil) {
      ctx.waitUntil(mcAddQuietly(env, buyerEmail, buyerName));
    }
    return json({ ok: true, id: data.payment && data.payment.id, ticketNo: ticketNo, orderNo: orderNo, emailed: emailed });
  } catch (e) {
    return json({ ok: false, error: 'Server error, please try again' }, 500);
  }
}
