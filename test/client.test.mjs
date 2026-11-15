import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorefrontClient, EstacklyError, verifyWebhook, WebhookSignatureError } from "../dist/index.js";

function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const r = responses.shift() ?? { status: 200, body: { data: null } };
    return new Response(r.status === 204 ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: r.headers ?? { "Content-Type": "application/json" },
    });
  };
  return { fn, calls };
}

test("public key header, currency and query params", async () => {
  const m = mockFetch([{ status: 200, body: { data: [], page: { next_cursor: null, has_more: false, total: 0 } } }]);
  const c = createStorefrontClient({ publicKey: "esk_pub_x", currency: "USD", fetch: m.fn });
  await c.products.list({ category: "shoes", ids: [1, 2], in_stock: true, sort: "newest" });
  const { url, init } = m.calls[0];
  assert.equal(url.pathname, "/storefront/v1/products");
  assert.equal(url.searchParams.get("currency"), "USD");
  assert.equal(url.searchParams.get("ids"), "1,2");
  assert.equal(url.searchParams.get("in_stock"), "true");
  assert.equal(url.searchParams.has("featured"), false);
  assert.equal(init.headers["X-Estackly-Storefront-Token"], "esk_pub_x");
  assert.equal(init.headers.Authorization, undefined);
});

test("private key uses Bearer", async () => {
  const m = mockFetch([{ status: 200, body: { data: [] } }]);
  await createStorefrontClient({ privateKey: "esk_prv_x", fetch: m.fn }).webhooks.list();
  assert.equal(m.calls[0].init.headers.Authorization, "Bearer esk_prv_x");
});

test("cart token, version and customer token", async () => {
  const m = mockFetch([{ status: 200, body: { data: { id: "crt_1" } } }]);
  const c = createStorefrontClient({ publicKey: "esk_pub_x", fetch: m.fn }).withCustomer("cus_abc");
  await c.carts.addLine({ id: "crt_1", token: "tok" }, { product_id: 5, variant_id: 7 }, { version: 3 });
  const { url, init } = m.calls[0];
  assert.equal(url.pathname, "/storefront/v1/carts/crt_1/lines");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["X-Estackly-Cart-Token"], "tok");
  assert.equal(init.headers["X-Estackly-Customer-Token"], "cus_abc");
  assert.deepEqual(JSON.parse(init.body), { product_id: 5, variant_id: 7, cart_version: 3 });
});

test("line keys are escaped", async () => {
  const m = mockFetch([{ status: 200, body: { data: {} } }]);
  await createStorefrontClient({ publicKey: "k", fetch: m.fn }).carts.updateLine({ id: "crt_1", token: "t" }, "137:37", 0);
  assert.equal(m.calls[0].url.pathname, "/storefront/v1/carts/crt_1/lines/137%3A37");
});

test("errors become EstacklyError", async () => {
  const m = mockFetch([{ status: 422, body: { error: { code: "coupon_invalid", message: "That code has expired.", request_id: "r1" } } }]);
  const c = createStorefrontClient({ publicKey: "k", fetch: m.fn });
  await assert.rejects(c.carts.applyCoupon({ id: "crt_1", token: "t" }, "OLD"), (e) => {
    assert.ok(e instanceof EstacklyError);
    assert.equal(e.status, 422);
    assert.equal(e.code, "coupon_invalid");
    assert.equal(e.message, "That code has expired.");
    assert.equal(e.requestId, "r1");
    return true;
  });
});

test("429 is retried after Retry-After", async () => {
  const m = mockFetch([
    { status: 429, body: { error: { code: "rate_limited", message: "Slow down" } }, headers: { "Retry-After": "1" } },
    { status: 200, body: { data: { store_id: "s", kind: "public", scopes: [] } } },
  ]);
  const key = await createStorefrontClient({ publicKey: "k", fetch: m.fn }).key();
  assert.equal(key.kind, "public");
  assert.equal(m.calls.length, 2);
});

test("204 resolves to undefined", async () => {
  const m = mockFetch([{ status: 204 }]);
  assert.equal(await createStorefrontClient({ publicKey: "k", fetch: m.fn }).customers.logout(), undefined);
});

test("all() follows cursors", async () => {
  const m = mockFetch([
    { status: 200, body: { data: [{ id: 1 }, { id: 2 }], page: { next_cursor: "c2", has_more: true, total: 3 } } },
    { status: 200, body: { data: [{ id: 3 }], page: { next_cursor: null, has_more: false, total: 3 } } },
  ]);
  const ids = [];
  for await (const p of createStorefrontClient({ publicKey: "k", fetch: m.fn }).products.all()) ids.push(p.id);
  assert.deepEqual(ids, [1, 2, 3]);
  assert.equal(m.calls[1].url.searchParams.get("cursor"), "c2");
});

// Same vector as TestWebhookSignature in the Go server.
const body = '{"id":"evt_1"}';
const sig = "t=1700000000,v1=366e40c480fe3a9e6a03609dca079cea86d77ae82d5a56b5348208247317a8d1";

test("verifyWebhook accepts a good signature", async () => {
  const evt = await verifyWebhook(body, sig, "whsec_x", { now: 1700000010 });
  assert.equal(evt.id, "evt_1");
});

test("verifyWebhook rejects bad, old and missing signatures", async () => {
  await assert.rejects(verifyWebhook(body, sig, "whsec_y", { now: 1700000010 }), WebhookSignatureError);
  await assert.rejects(verifyWebhook(body + " ", sig, "whsec_x", { now: 1700000010 }), WebhookSignatureError);
  await assert.rejects(verifyWebhook(body, sig, "whsec_x", { now: 1700001000 }), /too old/);
  await assert.rejects(verifyWebhook(body, null, "whsec_x"), /missing/);
});
