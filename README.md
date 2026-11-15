# @estackly/storefront

A small, typed client for the [Estackly Storefront API](https://developers.estackly.com): catalogue, carts, checkout links, customer accounts and webhooks. No dependencies; works in browsers, Node 18+, Deno, Bun and edge runtimes.

```sh
npm install @estackly/storefront
```

The package installs under its own name, so imports stay `@estackly/storefront`.

## Quick start

```ts
import { createStorefrontClient } from "@estackly/storefront";

const estackly = createStorefrontClient({
  publicKey: process.env.ESTACKLY_PUBLIC_KEY!, // esk_pub_… from admin → Settings → Developers
  currency: "USD",                              // optional: one of the store's selling currencies
});

const { data: products, page } = await estackly.products.list({ sort: "newest", limit: 24 });
const product = await estackly.products.bySlug("linen-shirt");
const store = await estackly.store();
```

Every price is a `Money` object: `{ amount_minor, currency, formatted }`. Show `formatted`; do sums on `amount_minor`.

## Cart and checkout

```ts
const cart = await estackly.carts.create([{ product_id: 137, variant_id: 37, quantity: 1 }]);
const ref = { id: cart.id, token: cart.token }; // keep both; the token is returned only once

await estackly.carts.addLine(ref, { product_id: 94, variant_id: 2 });
await estackly.carts.applyCoupon(ref, "WELCOME10");

const { checkout_url } = await estackly.carts.checkout(ref);
window.location.href = checkout_url; // the store's own checkout, valid one hour, one use
```

Payment, tax and shipping always run on the store's checkout, so your code never touches card data.

## Shopper accounts

```ts
const { customer_access_token } = await estackly.customers.login(email, password);
const shopper = estackly.withCustomer(customer_access_token);

const orders = await shopper.customers.orders.list();
const wishlist = await shopper.customers.wishlist.get();
```

Create carts with `shopper.carts.create(...)` and they are recorded against the shopper's account.

## Errors

Failed calls throw `EstacklyError` with `status`, `code` (for example `out_of_stock`, `coupon_invalid`, `cart_changed`), `message`, `fields` for validation errors and `requestId`. A `429` is retried automatically after `Retry-After` (up to two times; set `maxRetries`).

```ts
import { EstacklyError } from "@estackly/storefront";

try {
  await estackly.carts.applyCoupon(ref, code);
} catch (e) {
  if (e instanceof EstacklyError && e.code === "coupon_invalid") showMessage(e.message);
  else throw e;
}
```

## Webhooks (server only)

```ts
import { createStorefrontClient, verifyWebhook } from "@estackly/storefront";

const admin = createStorefrontClient({ privateKey: process.env.ESTACKLY_PRIVATE_KEY! });
const hook = await admin.webhooks.create("https://example.com/estackly", ["order.paid", "order.shipped"]);
// store hook.secret; it is shown only once

// In your handler, verify against the raw body:
const event = await verifyWebhook(rawBody, req.headers["estackly-signature"], process.env.ESTACKLY_WEBHOOK_SECRET!);
if (event.topic === "order.paid") { /* … */ }
```

Never put a private key (`esk_prv_…`) in browser or app code.

## All methods

| Area | Methods |
| --- | --- |
| Key | `key()` |
| Catalogue | `products.list / all / get / bySlug / related / reviews`, `categories.list / get`, `brands.list` |
| Content | `store()`, `menu("main" \| "footer")`, `pages.list / get`, `banners(placement?)` |
| Cart | `carts.create / get / addLine / updateLine / removeLine / applyCoupon / removeCoupon / estimateShipping / checkout` |
| Customers | `customers.register / login / logout / me / update / changePassword`, `customers.addresses.*`, `customers.orders.list / get`, `customers.wishlist.get / set` |
| Webhooks | `webhooks.list / create / update / remove / deliveries / test`, `verifyWebhook()` |

The full reference is at [developers.estackly.com/reference](https://developers.estackly.com/reference).

## License

MIT
