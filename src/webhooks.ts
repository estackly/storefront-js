import type { WebhookEvent } from "./types.js";

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

export interface VerifyOptions {
  /** Reject signatures older (or newer) than this many seconds. Default 300. */
  toleranceSeconds?: number;
  /** Unix seconds "now", for tests. */
  now?: number;
}

/**
 * Checks an `Estackly-Signature: t=<unix>,v1=<hex>` header against the raw
 * request body and returns the parsed event. Pass the body exactly as
 * received (before any JSON parsing). Works in Node 18+, Deno, Bun and edge
 * runtimes (Web Crypto).
 */
export async function verifyWebhook<T = Record<string, unknown>>(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  secret: string,
  opts: VerifyOptions = {},
): Promise<WebhookEvent<T>> {
  if (!signatureHeader) throw new WebhookSignatureError("missing Estackly-Signature header");
  let t = "";
  const sigs: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (k === "t") t = v ?? "";
    else if (k === "v1" && v) sigs.push(v);
  }
  const ts = Number(t);
  if (!t || !Number.isInteger(ts) || sigs.length === 0) throw new WebhookSignatureError("malformed Estackly-Signature header");

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (opts.toleranceSeconds ?? 300)) throw new WebhookSignatureError("signature timestamp is too old");

  const enc = new TextEncoder();
  const body = typeof rawBody === "string" ? enc.encode(rawBody) : rawBody;
  const prefix = enc.encode(t + ".");
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Estackly: Web Crypto is not available in this runtime");
  const key = await subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toHex(new Uint8Array(await subtle.sign("HMAC", key, signed)));
  if (!sigs.some((s) => timingSafeEqual(s, expected))) throw new WebhookSignatureError("signature does not match");

  return JSON.parse(new TextDecoder().decode(body)) as WebhookEvent<T>;
}

function toHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
