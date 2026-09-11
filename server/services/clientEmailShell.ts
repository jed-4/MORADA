/**
 * The HTML shell for emails a BUILDER sends to THEIR client.
 *
 * Deliberately not the shell in onboardingEmails.ts. That one is branded Morada
 * — "Morada" in the header band, "© Morada, construction management for
 * Australian builders" in the footer — which is right for mail from us to a
 * builder, and wrong for mail from a builder to a homeowner who has never heard
 * of us. These carry the builder's name, logo and brand colour; Morada appears
 * once, small, in the footer, matching the "via Morada" already in the From.
 *
 * Before this, every client-facing send did:
 *
 *     html: body.replace(/\n/g, "<br>")
 *
 * — no wrapper, no branding, no signature, and no escaping, so an ampersand or
 * an angle bracket in a builder's message landed as broken markup.
 */

export interface ClientEmailBrand {
  companyName?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  abn?: string | null;
}

export interface ClientEmailSender {
  name?: string | null;
  email?: string | null;
}

export interface ClientEmailOptions {
  brand: ClientEmailBrand;
  /** The builder's own message. Plain text; newlines become paragraphs. */
  body: string;
  /** The primary action, rendered as a button. */
  cta?: { href: string; label: string } | null;
  /** Small print under the button — a deadline, say. */
  note?: string | null;
  sender?: ClientEmailSender | null;
}

/** Morada plum, if the company has never set a colour. */
const FALLBACK_BRAND = "#87749A";

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** A URL safe to drop into an href. Anything not http(s) is dropped entirely —
 *  `javascript:` in a link is the obvious way this would be abused.
 *
 *  Relative paths are resolved against APP_BASE_URL first. An email is read
 *  outside the app, so "/api/public/company/x/logo" means nothing in a mail
 *  client — before this it parsed as an invalid URL and the logo was silently
 *  dropped from every branded email. Resolving keeps the http(s)-only rule:
 *  the base is ours, so the result is still one of our own origins. */
const safeUrl = (url: string): string | null => {
  const base = (process.env.APP_BASE_URL || "https://app.moradaco.com.au").replace(/\/$/, "");
  try {
    const u = url.startsWith("/") ? new URL(`${base}${url}`) : new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? escapeHtml(u.toString()) : null;
  } catch {
    return null;
  }
};

/** Readable ink for text sitting on `hex`. Relative luminance, same threshold
 *  the WCAG contrast formula uses — a pale brand colour needs dark text, and
 *  plenty of builders pick one. */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? "#2C2825" : "#ffffff";
}

export function renderClientEmail({ brand, body, cta, note, sender }: ClientEmailOptions): string {
  const accent = (brand.brandColor || FALLBACK_BRAND).trim();
  const onAccent = inkOn(accent);
  const company = escapeHtml(brand.companyName?.trim() || "Your builder");

  // Blank lines separate paragraphs; single newlines are line breaks within one.
  const paragraphs = escapeHtml(body.trim())
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin: 0 0 16px; color: #2C2825; font-size: 15px; line-height: 1.6;">${para.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const ctaHref = cta ? safeUrl(cta.href) : null;
  const ctaHtml =
    cta && ctaHref
      ? `<table role="presentation" style="width: 100%; margin: 28px 0 8px;">
           <tr><td align="center">
             <a href="${ctaHref}" style="display: inline-block; padding: 13px 28px; background-color: ${escapeHtml(accent)}; color: ${onAccent}; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">${escapeHtml(cta.label)}</a>
           </td></tr>
         </table>`
      : "";

  // Under a button the note is small print and centres with it. Standing alone
  // — an invoice has no portal, so no button — centred small print reads as
  // stranded, and the line is usually the most useful thing in the email
  // ("$24,180.00 due by 24 September"). So it becomes a left-aligned callout.
  const noteHtml = !note
    ? ""
    : ctaHtml
      ? `<p style="margin: 0 0 8px; text-align: center; color: #6B6561; font-size: 13px;">${escapeHtml(note)}</p>`
      : `<table role="presentation" style="width: 100%; margin: 22px 0 0;">
           <tr><td style="padding: 12px 14px; background-color: #FAF9F7; border-left: 3px solid ${escapeHtml(accent)}; border-radius: 0 6px 6px 0;">
             <p style="margin: 0; color: #2C2825; font-size: 14px; font-weight: 600;">${escapeHtml(note)}</p>
           </td></tr>
         </table>`;

  // The builder's own sign-off. Previously the message just stopped.
  const senderLine = sender?.name ? escapeHtml(sender.name) : null;
  const signature =
    senderLine || brand.phone || brand.email
      ? `<table role="presentation" style="width: 100%; margin: 28px 0 0; border-top: 1px solid #E9E9E7;">
           <tr><td style="padding-top: 18px;">
             ${senderLine ? `<p style="margin: 0 0 2px; color: #2C2825; font-size: 14px; font-weight: 600;">${senderLine}</p>` : ""}
             <p style="margin: 0 0 2px; color: #6B6561; font-size: 13px;">${company}</p>
             ${brand.phone ? `<p style="margin: 0; color: #6B6561; font-size: 13px;">${escapeHtml(brand.phone)}</p>` : ""}
             ${brand.email ? `<p style="margin: 0; color: #6B6561; font-size: 13px;">${escapeHtml(brand.email)}</p>` : ""}
           </td></tr>
         </table>`
      : "";

  const logo = brand.logoUrl ? safeUrl(brand.logoUrl) : null;
  // Logo when there is one, the company name set in the brand colour when not —
  // a header band with nothing in it reads as a broken image.
  const header = logo
    ? `<img src="${logo}" alt="${company}" style="max-height: 44px; max-width: 220px; display: block; margin: 0 auto;">`
    : `<h1 style="margin: 0; color: ${onAccent}; font-size: 22px; font-weight: 600; letter-spacing: -0.01em;">${company}</h1>`;

  const footerBits = [brand.abn ? `ABN ${escapeHtml(brand.abn)}` : null, brand.address ? escapeHtml(brand.address) : null]
    .filter(Boolean)
    .join(" &middot; ");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${company}</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9F6F1;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 32px 12px;">
          <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 10px; border: 1px solid #E9E9E7;">
            <tr>
              <td style="padding: 22px 40px; text-align: center; background-color: ${logo ? "#ffffff" : escapeHtml(accent)}; border-bottom: 1px solid #E9E9E7; border-radius: 10px 10px 0 0;">
                ${header}
              </td>
            </tr>
            <tr>
              <td style="padding: 32px 40px;">
                ${paragraphs}
                ${ctaHtml}
                ${noteHtml}
                ${signature}
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 40px; text-align: center; background-color: #FAF9F7; border-top: 1px solid #E9E9E7; border-radius: 0 0 10px 10px;">
                ${footerBits ? `<p style="margin: 0 0 4px; color: #6B6561; font-size: 12px;">${footerBits}</p>` : ""}
                <p style="margin: 0; color: #A39C94; font-size: 11px;">Sent via Morada</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
