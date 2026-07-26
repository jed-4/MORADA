// Product-page scraper for "add option from URL" (Programa-style capture).
// Fetches a supplier product page server-side and extracts name / brand /
// price / images from JSON-LD Product markup, Open Graph tags, and meta
// fallbacks. No HTML-parser dependency — targeted regexes + JSON.parse on
// JSON-LD blocks are sufficient and keep the surface small.

import { lookup } from "dns/promises";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 6;
const USER_AGENT =
  "Mozilla/5.0 (compatible; MoradaBot/1.0; +https://morada.build) product-import";

export interface ScrapedProduct {
  name: string | null;
  brand: string | null;
  description: string | null;
  sku: string | null;
  /** Price in cents when found. Retail AU pages list inc-GST prices. */
  priceCents: number | null;
  currency: string | null;
  /** Absolute image URLs, best-first, deduped, capped. */
  images: string[];
  url: string;
}

// ---------------------------------------------------------------------------
// SSRF guard: only public http(s) hosts. Rejects IP-literal and DNS-resolved
// private / loopback / link-local / metadata ranges.
// ---------------------------------------------------------------------------

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    // IPv6: loopback, link-local, unique-local, v4-mapped
    const low = ip.toLowerCase();
    if (low === "::1" || low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd")) return true;
    const v4 = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return v4 ? isPrivateIp(v4[1]) : false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }
  const host = url.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) throw new Error("URL host not allowed");
  } else {
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new Error("URL host not allowed");
    }
    try {
      const addrs = await lookup(host, { all: true });
      if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
        throw new Error("URL host not allowed");
      }
    } catch (e: any) {
      throw new Error(e?.message === "URL host not allowed" ? e.message : "Could not resolve URL host");
    }
  }
  return url;
}

async function fetchWithLimits(url: URL, accept: string, maxBytes: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: accept },
    });
    const len = Number(res.headers.get("content-length") || 0);
    if (len > maxBytes) throw new Error("Response too large");
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.from(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // property/name/itemprop before or after content=
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${key}["']`, "i"),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decodeEntities(m[1]);
    }
  }
  return null;
}

function extractJsonLdProducts(html: string): any[] {
  const products: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : parsed["@graph"] && Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
      for (const node of nodes) {
        const type = node?.["@type"];
        const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
        if (isProduct) products.push(node);
      }
    } catch {
      // malformed JSON-LD block — skip
    }
  }
  return products;
}

function parsePriceToCents(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

function firstOffer(product: any): any | null {
  const offers = product?.offers;
  if (!offers) return null;
  if (Array.isArray(offers)) return offers[0] ?? null;
  if (offers["@type"] === "AggregateOffer" && Array.isArray(offers.offers)) return offers.offers[0] ?? offers;
  return offers;
}

function toAbsolute(src: string, base: URL): string | null {
  try {
    const u = new URL(src, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function collectImages(product: any | null, html: string, base: URL): string[] {
  const out: string[] = [];
  const push = (src: unknown) => {
    if (typeof src !== "string" || !src) return;
    const abs = toAbsolute(decodeEntities(src), base);
    if (abs && !out.includes(abs)) out.push(abs);
  };
  if (product) {
    const img = product.image;
    if (Array.isArray(img)) img.forEach((i) => push(typeof i === "object" ? i?.url : i));
    else if (typeof img === "object") push(img?.url);
    else push(img);
  }
  // og:image (may appear multiple times)
  const ogRe = /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = ogRe.exec(html))) push(m[1]);
  const ogRe2 = /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["']/gi;
  while ((m = ogRe2.exec(html))) push(m[1]);
  return out.slice(0, MAX_IMAGES);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeProductUrl(rawUrl: string): Promise<ScrapedProduct> {
  const url = await assertSafeUrl(rawUrl);
  const res = await fetchWithLimits(url, "text/html,application/xhtml+xml", MAX_HTML_BYTES);
  if (!res.ok) throw new Error(`Page returned ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("html")) throw new Error("URL is not an HTML page");
  const html = (await readBodyCapped(res, MAX_HTML_BYTES)).toString("utf-8");

  const jsonLd = extractJsonLdProducts(html)[0] ?? null;
  const offer = firstOffer(jsonLd);

  const name =
    (typeof jsonLd?.name === "string" && decodeEntities(jsonLd.name)) ||
    metaContent(html, ["og:title", "twitter:title"]) ||
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
    null;

  const brandRaw = jsonLd?.brand;
  const brand =
    (typeof brandRaw === "string" && decodeEntities(brandRaw)) ||
    (typeof brandRaw?.name === "string" && decodeEntities(brandRaw.name)) ||
    metaContent(html, ["product:brand", "og:site_name"]) ||
    null;

  const description =
    (typeof jsonLd?.description === "string" && decodeEntities(jsonLd.description).slice(0, 2000)) ||
    metaContent(html, ["og:description", "description", "twitter:description"]) ||
    null;

  const sku =
    (jsonLd?.sku != null && String(jsonLd.sku)) ||
    (jsonLd?.mpn != null && String(jsonLd.mpn)) ||
    metaContent(html, ["product:retailer_item_id", "product:sku"]) ||
    null;

  const priceCents =
    parsePriceToCents(offer?.price ?? offer?.lowPrice) ??
    parsePriceToCents(metaContent(html, ["product:price:amount", "og:price:amount"])) ??
    parsePriceToCents(html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1]);

  const currency =
    (typeof offer?.priceCurrency === "string" && offer.priceCurrency) ||
    metaContent(html, ["product:price:currency", "og:price:currency"]) ||
    null;

  return {
    name: name || null,
    brand,
    description,
    sku,
    priceCents,
    currency,
    images: collectImages(jsonLd, html, url),
    url: url.toString(),
  };
}

export async function downloadImage(rawUrl: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const url = await assertSafeUrl(rawUrl);
  const res = await fetchWithLimits(url, "image/*", MAX_IMAGE_BYTES);
  if (!res.ok) throw new Error(`Image returned ${res.status}`);
  const mimeType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  if (!mimeType.startsWith("image/")) throw new Error("URL is not an image");
  const buffer = await readBodyCapped(res, MAX_IMAGE_BYTES);
  const base = url.pathname.split("/").pop() || "image";
  const fileName = base.includes(".") ? base : `${base}.${mimeType.split("/")[1] || "jpg"}`;
  return { buffer, mimeType, fileName: decodeURIComponent(fileName).slice(0, 120) };
}
