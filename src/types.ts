// Shapes returned by the Estackly Storefront API (version 2026-11).
// The OpenAPI spec at https://api.estackly.com/storefront/openapi.yaml is canonical.

export type Scope =
  | "catalog:read"
  | "content:read"
  | "cart:write"
  | "customer:write"
  | "checkout:write"
  | "webhooks:write";

export interface Money {
  /** Integer minor units (paise, cents, pence). */
  amount_minor: number;
  currency: string;
  /** The amount the way the store prints it, e.g. "₹1,799.00". */
  formatted: string | null;
}

export interface Page {
  next_cursor: string | null;
  has_more: boolean;
  total: number;
}

export interface List<T> {
  data: T[];
  page: Page;
}

export interface KeyInfo {
  store_id: string;
  kind: "public" | "private";
  scopes: Scope[];
}

export interface Variant {
  id: number;
  name: string;
  options: Record<string, string>;
  price: Money;
  compare_at_price: Money | null;
  in_stock: boolean;
  available_quantity: number | null;
  image_url: string | null;
}

export interface ProductImage {
  url: string;
  thumb_url: string;
  options: Record<string, string>;
}

export interface Product {
  id: number;
  name: string;
  slug: string | null;
  sku: string | null;
  brand: { name: string; slug: string | null } | null;
  category: string | null;
  price: Money;
  compare_at_price: Money | null;
  sale_ends_at: string | null;
  in_stock: boolean;
  /** null = stock is not counted. */
  available_quantity: number | null;
  min_order_quantity: number;
  max_order_quantity: number | null;
  max_per_customer: number | null;
  is_digital: boolean;
  rating: { average: number; count: number } | null;
  image_url: string | null;
  images: ProductImage[];
  variants: Variant[];
  /** The product page on the store. */
  url: string | null;
}

export interface ProductDetail extends Product {
  description_html: string | null;
  summary: string | null;
  meta_title: string | null;
  meta_description: string | null;
  barcode: string | null;
  country_of_origin: string | null;
}

export interface Review {
  id: number;
  rating: number;
  title: string | null;
  body: string | null;
  author: string | null;
  verified_purchase: boolean;
  created_at: string | null;
}

export interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string | null;
  description: string | null;
  image_url: string | null;
  product_count: number;
  meta_title: string | null;
  meta_description: string | null;
  url: string | null;
  children: Category[];
}

export interface Brand {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  website: string | null;
  featured: boolean;
  logo_url: string | null;
  product_count: number;
}

export interface Store {
  id: string;
  name: string;
  tagline: string | null;
  url: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  colors: { primary: string; accent: string };
  theme: string | null;
  country: string;
  locale: string;
  locales: string[];
  base_currency: string;
  currencies: string[];
  contact: {
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    support_hours: string | null;
  };
  social: Record<string, string>;
  policies: { type: string; title: string; slug: string; url: string | null }[];
  test_mode: boolean;
}

export interface MenuLink {
  label: string;
  type: "home" | "products" | "cart" | "category" | "product" | "page" | "url" | "heading";
  slug: string | null;
  url: string | null;
  new_tab: boolean;
  children: MenuLink[];
}

export interface PageSummary {
  title: string;
  slug: string;
  policy_type: string | null;
  in_footer: boolean;
  updated_at: string | null;
  url: string | null;
}

export interface StorePage {
  title: string;
  slug: string;
  policy_type: string | null;
  content: string;
  paragraphs: string[];
  updated_at: string | null;
  url: string | null;
}

export type BannerPlacement =
  | "announcement"
  | "home_top"
  | "home_below_hero"
  | "home_middle"
  | "home_bottom"
  | "catalogue_top"
  | "category_top"
  | "product_top";

export interface Banner {
  id: number;
  placement: string;
  title: string | null;
  subtitle: string | null;
  link_url: string | null;
  link_label: string | null;
  image_url: string | null;
}

export interface LineInput {
  product_id: number;
  /** Required when the product has options. */
  variant_id?: number;
  quantity?: number;
  /** The personalised message, for products that take one. */
  message?: string;
}

export interface CartLine {
  key: string;
  product_id: number;
  variant_id: number | null;
  name: string;
  sku: string | null;
  image_url: string | null;
  quantity: number;
  max_quantity: number;
  unit_price: Money;
  line_total: Money;
  message: string | null;
  message_label: string | null;
  is_digital: boolean;
}

export interface ShippingRate {
  id: number | null;
  name: string;
  fee: Money;
  eta: string | null;
  pickup: boolean;
}

export interface Cart {
  id: string;
  /** Only on the response that created the cart. */
  token?: string;
  version: number;
  currency: string;
  item_count: number;
  lines: CartLine[];
  coupon: { code: string | null; accepted: boolean; automatic: boolean; message: string | null } | null;
  totals: {
    subtotal: Money;
    discount: Money;
    shipping: Money;
    tax_lines: { label: string; rate: string; amount: Money; included: boolean }[];
    grand_total: Money;
    requires_shipping: boolean;
    shipping_pending: boolean;
    tax_pending: boolean;
  };
  /** Only on a shipping estimate. */
  shipping?: { available: boolean; selected_rate_id: number | null; rates: ShippingRate[] };
  warnings?: { code: "quantity_capped"; line: string; quantity: number; message: string }[];
  expires_at: string;
}

export interface CheckoutLink {
  checkout_url: string;
  expires_at: string;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  email_verified: boolean;
  created_at: string | null;
}

export interface SignedIn {
  customer: Customer;
  customer_access_token: string;
  expires_at: string;
}

export interface AddressInput {
  label?: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  /** Required where the country has states. */
  state?: string;
  postal_code: string;
  is_default?: boolean;
}

export interface Address extends Required<Omit<AddressInput, "label" | "line2" | "state">> {
  id: number;
  label: string | null;
  line2: string | null;
  state: string | null;
  country: string;
}

export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned";

export interface OrderSummary {
  number: string;
  status: OrderStatus;
  payment_status: string;
  placed_at: string | null;
  grand_total: Money;
  item_count: number;
}

export interface Order {
  number: string;
  status: OrderStatus;
  payment_method: string;
  payment_status: "pending" | "paid" | "partially_refunded" | "refunded" | "failed";
  placed_at: string | null;
  items: {
    product_id: number | null;
    variant_id: number | null;
    name: string;
    sku: string | null;
    quantity: number;
    unit_price: Money;
    line_total: Money;
    is_digital: boolean;
    message: string | null;
  }[];
  totals: { subtotal: Money; discount: Money; shipping: Money; tax: Money; tax_included: Money; grand_total: Money };
  shipping_method: string | null;
  shipping_address: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country_code: string | null;
    phone: string | null;
  } | null;
  delivery: { date: string; slot: string | null } | null;
  shipments: {
    status: string;
    courier: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
  }[];
}

export type WebhookTopic =
  | "order.created"
  | "order.updated"
  | "order.paid"
  | "order.shipped"
  | "order.delivered"
  | "order.cancelled"
  | "order.refunded"
  | "product.created"
  | "product.updated"
  | "product.deleted"
  | "customer.created"
  | "ping";

export interface Webhook {
  id: number;
  url: string;
  topics: WebhookTopic[];
  active: boolean;
  disabled_reason: string | null;
  created_at: string;
}

export interface WebhookDelivery {
  id: number;
  topic: string;
  event_id: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  response_status: number | null;
  error: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  topic: WebhookTopic;
  created_at: string;
  store_id: string;
  data: T;
}

export type ProductSort = "featured" | "newest" | "price_asc" | "price_desc" | "name" | "rating" | "discount";

export interface ProductQuery {
  category?: string;
  brand?: string;
  q?: string;
  ids?: number[];
  price_min?: number;
  price_max?: number;
  in_stock?: boolean;
  featured?: boolean;
  sort?: ProductSort;
  limit?: number;
  cursor?: string;
}
