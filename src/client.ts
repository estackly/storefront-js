import type {
  Address,
  AddressInput,
  Banner,
  BannerPlacement,
  Brand,
  Cart,
  Category,
  CheckoutLink,
  Customer,
  KeyInfo,
  LineInput,
  List,
  MenuLink,
  Order,
  OrderSummary,
  PageSummary,
  Product,
  ProductDetail,
  ProductQuery,
  Review,
  SignedIn,
  Store,
  StorePage,
  Webhook,
  WebhookDelivery,
  WebhookTopic,
} from "./types.js";

export const DEFAULT_API_URL = "https://api.estackly.com/storefront/v1";

export interface ClientOptions {
  /** An esk_pub_ key: safe in browsers and apps. */
  publicKey?: string;
  /** An esk_prv_ key: servers only. Needed for webhooks. */
  privateKey?: string;
  /** One of the store's selling currencies; default the store's base currency. */
  currency?: string;
  /** One of the store's locales; default the store's first locale. */
  locale?: string;
  /** A signed-in shopper's customer_access_token. */
  customerToken?: string;
  apiUrl?: string;
  fetch?: typeof fetch;
  /** Retries after a 429 (waiting Retry-After, up to 10 s each). Default 2. */
  maxRetries?: number;
  /** Extra fetch options for every call, e.g. { next: { revalidate: 300 } } in Next.js. */
  fetchOptions?: RequestInit & Record<string, unknown>;
}

/** A cart you created: its id and the token returned with it. */
export interface CartRef {
  id: string;
  token: string;
}

/** Send `version` to refuse the write if the cart changed meanwhile (409 cart_changed). */
export interface CartWriteOptions {
  version?: number;
}

export class EstacklyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  readonly requestId?: string;
  readonly retryAfter?: number;

  constructor(status: number, body: any, retryAfter?: number) {
    const e = body?.error ?? {};
    super(e.message ?? `Estackly API error ${status}`);
    this.name = "EstacklyError";
    this.status = status;
    this.code = e.code ?? (status >= 500 ? "internal" : "bad_request");
    this.fields = e.fields;
    this.requestId = e.request_id;
    this.retryAfter = retryAfter;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface Req {
  method?: string;
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
}

export class StorefrontClient {
  private readonly opts: ClientOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    if (!opts.publicKey && !opts.privateKey) throw new Error("Estackly: pass publicKey or privateKey");
    this.opts = { ...opts };
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) throw new Error("Estackly: no fetch available; pass options.fetch");
    this.fetchImpl = f.bind(globalThis);
  }

  /** A copy of this client with other options, e.g. withCustomer(token) or with({ currency: "USD" }). */
  with(opts: Partial<ClientOptions>): StorefrontClient {
    return new StorefrontClient({ ...this.opts, ...opts });
  }

  /** A copy that sends this shopper's customer token. */
  withCustomer(customerToken: string | undefined): StorefrontClient {
    return this.with({ customerToken });
  }

  async request<T>(path: string, r: Req = {}): Promise<T> {
    const url = new URL((this.opts.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "") + path);
    const q: Query = { currency: this.opts.currency, locale: this.opts.locale, ...r.query };
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: "application/json", ...r.headers };
    if (this.opts.privateKey) headers.Authorization = `Bearer ${this.opts.privateKey}`;
    else headers["X-Estackly-Storefront-Token"] = this.opts.publicKey!;
    if (this.opts.customerToken && !headers["X-Estackly-Customer-Token"]) {
      headers["X-Estackly-Customer-Token"] = this.opts.customerToken;
    }
    let body: string | undefined;
    if (r.body !== undefined) {
      body = JSON.stringify(r.body);
      headers["Content-Type"] = "application/json";
    }

    const retries = this.opts.maxRetries ?? 2;
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url.toString(), { ...this.opts.fetchOptions, method: r.method ?? "GET", headers, body });
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (res.ok) return json as T;
      const ra = Number(res.headers.get("Retry-After"));
      const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
      if (res.status === 429 && attempt < retries && (retryAfter ?? 1) <= 10) {
        await new Promise((ok) => setTimeout(ok, (retryAfter ?? 1) * 1000));
        continue;
      }
      throw new EstacklyError(res.status, json, retryAfter);
    }
  }

  private async data<T>(path: string, r?: Req): Promise<T> {
    return (await this.request<{ data: T }>(path, r)).data;
  }

  /** The store and permissions of the key in use. */
  key(): Promise<KeyInfo> {
    return this.data("/key");
  }

  // ── Catalogue ──────────────────────────────────────────────────────────

  readonly products = {
    list: (q: ProductQuery = {}): Promise<List<Product>> =>
      this.request("/products", {
        query: {
          ...q,
          ids: q.ids?.join(","),
          in_stock: q.in_stock ? "true" : undefined,
          featured: q.featured ? "true" : undefined,
        },
      }),
    /** Every matching product, page by page. */
    all: (q: Omit<ProductQuery, "cursor"> = {}): AsyncGenerator<Product> =>
      paginate((cursor) => this.products.list({ limit: 100, ...q, cursor })),
    get: (id: number): Promise<ProductDetail> => this.data(`/products/${id}`),
    bySlug: (slug: string): Promise<ProductDetail> => this.data(`/products/by-slug/${encodeURIComponent(slug)}`),
    related: (id: number, limit?: number): Promise<Product[]> => this.data(`/products/${id}/related`, { query: { limit } }),
    reviews: (id: number, q: { limit?: number; cursor?: string } = {}): Promise<List<Review>> =>
      this.request(`/products/${id}/reviews`, { query: q }),
  };

  readonly categories = {
    /** The whole tree. */
    list: (): Promise<Category[]> => this.data("/categories"),
    /** By numeric id or slug, with its direct children. */
    get: (idOrSlug: number | string): Promise<Category> => this.data(`/categories/${encodeURIComponent(String(idOrSlug))}`),
  };

  readonly brands = {
    list: (): Promise<Brand[]> => this.data("/brands"),
  };

  // ── Content ────────────────────────────────────────────────────────────

  store(): Promise<Store> {
    return this.data("/store");
  }

  menu(menu: "main" | "footer"): Promise<MenuLink[]> {
    return this.data(`/menus/${menu}`);
  }

  readonly pages = {
    list: (): Promise<PageSummary[]> => this.data("/pages"),
    get: (slug: string): Promise<StorePage> => this.data(`/pages/${encodeURIComponent(slug)}`),
  };

  banners(placement?: BannerPlacement): Promise<Banner[]> {
    return this.data("/banners", { query: { placement } });
  }

  // ── Cart + checkout ────────────────────────────────────────────────────

  readonly carts = {
    /** The returned cart carries `token`; keep { id, token } to use it later. */
    create: (lines: LineInput[] = []): Promise<Cart & { token: string }> =>
      this.data("/carts", { method: "POST", body: { lines } }),
    get: (cart: CartRef): Promise<Cart> => this.data(`/carts/${cart.id}`, { headers: cartHeader(cart) }),
    addLine: (cart: CartRef, line: LineInput, o: CartWriteOptions = {}): Promise<Cart> =>
      this.data(`/carts/${cart.id}/lines`, { method: "POST", headers: cartHeader(cart), body: { ...line, cart_version: o.version } }),
    /** Quantity 0 removes the line. */
    updateLine: (cart: CartRef, lineKey: string, quantity: number, o: CartWriteOptions = {}): Promise<Cart> =>
      this.data(`/carts/${cart.id}/lines/${encodeURIComponent(lineKey)}`, {
        method: "PATCH",
        headers: cartHeader(cart),
        body: { quantity, cart_version: o.version },
      }),
    removeLine: (cart: CartRef, lineKey: string): Promise<Cart> =>
      this.data(`/carts/${cart.id}/lines/${encodeURIComponent(lineKey)}`, { method: "DELETE", headers: cartHeader(cart) }),
    /** A refused code throws EstacklyError with code "coupon_invalid" and is not kept. */
    applyCoupon: (cart: CartRef, code: string, o: CartWriteOptions = {}): Promise<Cart> =>
      this.data(`/carts/${cart.id}/coupon`, { method: "POST", headers: cartHeader(cart), body: { code, cart_version: o.version } }),
    removeCoupon: (cart: CartRef): Promise<Cart> =>
      this.data(`/carts/${cart.id}/coupon`, { method: "DELETE", headers: cartHeader(cart) }),
    /** Prices the cart for an address with its shipping options; nothing is saved. */
    estimateShipping: (
      cart: CartRef,
      address: { country: string; region?: string; postcode?: string; rate_id?: number },
    ): Promise<Cart> =>
      this.data(`/carts/${cart.id}/shipping-estimate`, { method: "POST", headers: cartHeader(cart), body: address }),
    /** A one-use link to the store's checkout, valid one hour. Open it in a browser. */
    checkout: (cart: CartRef, o: CartWriteOptions = {}): Promise<CheckoutLink> =>
      this.data(`/carts/${cart.id}/checkout`, { method: "POST", headers: cartHeader(cart), body: { cart_version: o.version } }),
  };

  // ── Customers ──────────────────────────────────────────────────────────

  readonly customers = {
    register: (input: { name: string; email: string; password: string; phone?: string; marketing_opt_in?: boolean }): Promise<SignedIn> =>
      this.data("/customers", { method: "POST", body: input }),
    login: (email: string, password: string): Promise<SignedIn> =>
      this.data("/customers/login", { method: "POST", body: { email, password } }),
    logout: (): Promise<void> => this.request("/customers/logout", { method: "POST" }),
    me: (): Promise<Customer> => this.data("/customers/me"),
    update: (input: { name?: string; phone?: string | null }): Promise<Customer> =>
      this.data("/customers/me", { method: "PATCH", body: input }),
    /** Signs the shopper's other API sessions out. */
    changePassword: (current_password: string, password: string): Promise<void> =>
      this.request("/customers/me/password", { method: "POST", body: { current_password, password } }).then(() => undefined),
    addresses: {
      list: (): Promise<Address[]> => this.data("/customers/me/addresses"),
      add: (a: AddressInput): Promise<Address> => this.data("/customers/me/addresses", { method: "POST", body: a }),
      /** Send the full address. */
      update: (id: number, a: AddressInput): Promise<Address> =>
        this.data(`/customers/me/addresses/${id}`, { method: "PATCH", body: a }),
      remove: (id: number): Promise<void> => this.request(`/customers/me/addresses/${id}`, { method: "DELETE" }),
    },
    orders: {
      list: (q: { limit?: number; cursor?: string } = {}): Promise<List<OrderSummary>> =>
        this.request("/customers/me/orders", { query: q }),
      get: (number: string): Promise<Order> => this.data(`/customers/me/orders/${encodeURIComponent(number)}`),
    },
    wishlist: {
      get: (): Promise<Product[]> => this.data("/customers/me/wishlist"),
      /** Replaces the whole list (at most 200; unknown products are dropped). */
      set: (productIds: number[]): Promise<Product[]> =>
        this.data("/customers/me/wishlist", { method: "PUT", body: { product_ids: productIds } }),
    },
  };

  // ── Webhooks (private key) ─────────────────────────────────────────────

  readonly webhooks = {
    list: (): Promise<Webhook[]> => this.data("/webhooks"),
    /** The signing `secret` is returned only here. */
    create: (url: string, topics: WebhookTopic[]): Promise<Webhook & { secret: string }> =>
      this.data("/webhooks", { method: "POST", body: { url, topics } }),
    /** active: true switches a disabled webhook back on. */
    update: (id: number, input: { url?: string; topics?: WebhookTopic[]; active?: boolean }): Promise<Webhook> =>
      this.data(`/webhooks/${id}`, { method: "PATCH", body: input }),
    remove: (id: number): Promise<void> => this.request(`/webhooks/${id}`, { method: "DELETE" }),
    deliveries: (id: number): Promise<WebhookDelivery[]> => this.data(`/webhooks/${id}/deliveries`),
    test: (id: number): Promise<{ delivery_id: number; event_id: string }> =>
      this.data(`/webhooks/${id}/test`, { method: "POST" }),
  };
}

function cartHeader(cart: CartRef): Record<string, string> {
  return { "X-Estackly-Cart-Token": cart.token };
}

async function* paginate<T>(page: (cursor?: string) => Promise<List<T>>): AsyncGenerator<T> {
  let cursor: string | undefined;
  for (;;) {
    const res = await page(cursor);
    yield* res.data;
    if (!res.page.has_more || !res.page.next_cursor) return;
    cursor = res.page.next_cursor;
  }
}

export function createStorefrontClient(opts: ClientOptions): StorefrontClient {
  return new StorefrontClient(opts);
}
