/**
 * RSVP-Endpoint für die Hochzeitsseite.
 *
 * Verschickt jede Rückmeldung per SMTP über das Yahoo-Konto an dich selbst.
 *
 * Benötigte Environment Variables in Vercel (Settings → Environment Variables):
 *   YAHOO_USER      volle Yahoo-Adresse, z.B. Steven.froese@yahoo.de
 *   YAHOO_APP_PW    App-Passwort aus den Yahoo-Kontoeinstellungen (NICHT das
 *                   normale Login-Passwort, das lehnt Yahoo per SMTP ab)
 *   RSVP_TO         Empfänger, optional. Default: YAHOO_USER
 *   RSVP_CC         zusätzlicher Empfänger, optional
 *
 * Die Zugangsdaten liegen ausschliesslich serverseitig und tauchen nie im
 * Browser auf.
 */

import nodemailer from 'nodemailer';

const MAX = { name: 120, msg: 2000 };

function sauber(wert, maxLaenge) {
  if (typeof wert !== 'string') return '';
  return wert.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLaenge);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, fehler: 'Nur POST' });
  }

  const user = process.env.YAHOO_USER;
  const pass = process.env.YAHOO_APP_PW;
  if (!user || !pass) {
    console.error('[RSVP] YAHOO_USER oder YAHOO_APP_PW fehlt');
    return res.status(500).json({ ok: false, fehler: 'Server nicht konfiguriert' });
  }
  const an = process.env.RSVP_TO || user;
  const cc = process.env.RSVP_CC || undefined;

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});

  // Honeypot: echte Gäste füllen dieses Feld nie aus, Bots schon.
  if (sauber(body.website, 50)) {
    return res.status(200).json({ ok: true });
  }

  const name = sauber(body.name, MAX.name);
  const attending = body.attending === 'Ja' ? 'Ja' : body.attending === 'Nein' ? 'Nein' : '';
  const msg = sauber(body.msg, MAX.msg);

  if (!name || !attending) {
    return res.status(400).json({ ok: false, fehler: 'Name und Rückmeldung erforderlich' });
  }

  const zeitpunkt = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const status = attending === 'Ja' ? 'Zusage' : 'Absage';
  const betreff = `Hochzeit RSVP · ${status} · ${name}`;

  const text = [
    `${status} von ${name}`,
    '',
    `Name: ${name}`,
    `Rückmeldung: ${attending}`,
    `Nachricht: ${msg || '–'}`,
    '',
    `Eingegangen: ${zeitpunkt} (Europe/Berlin)`
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#3A2119">
      <h2 style="margin:0 0 .6em;color:#2E3FD6">${status} · ${escapeHtml(name)}</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td style="opacity:.6">Name</td><td><strong>${escapeHtml(name)}</strong></td></tr>
        <tr><td style="opacity:.6">Rückmeldung</td><td><strong>${attending}</strong></td></tr>
        <tr><td style="opacity:.6;vertical-align:top">Nachricht</td><td>${msg ? escapeHtml(msg).replace(/\n/g, '<br>') : '<em>keine</em>'}</td></tr>
      </table>
      <p style="margin-top:1.2em;opacity:.55;font-size:13px">Eingegangen: ${zeitpunkt} (Europe/Berlin)</p>
    </div>`;

  const transporter = nodemailer.createTransport({
    host: 'smtp.mail.yahoo.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
  });

  try {
    const info = await transporter.sendMail({
      from: `"Hochzeitsseite Vicky & Steven" <${user}>`,
      to: an,
      cc,
      subject: betreff,
      text,
      html
    });
    console.log('[RSVP] versendet:', info.messageId, betreff);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[RSVP] SMTP-Fehler:', e && e.message);
    return res.status(502).json({ ok: false, fehler: 'Versand fehlgeschlagen' });
  }
}
