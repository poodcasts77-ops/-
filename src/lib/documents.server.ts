// Server-only helpers for the document request feature.
const enc = new TextEncoder();

export function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toB64Url(b);
}

export async function sha256(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return toB64Url(new Uint8Array(d));
}

export function normalizeId(v: unknown): string {
  return String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "");
}

async function hmacKey() {
  const secret =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    "docs-internal-secret-key-fallback";
  return crypto.subtle.importKey("raw", enc.encode("docs-session:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(requestId: string, ttlSec = 2 * 3600): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${requestId}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  return `${payload}.${toB64Url(new Uint8Array(sig))}`;
}

export async function verifySession(session: string, requestId: string): Promise<boolean> {
  const parts = session.split(".");
  if (parts.length !== 3) return false;
  const [rid, exp, sig] = parts;
  if (rid !== requestId || Number(exp) < Date.now() / 1000) return false;
  const expected = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`${rid}.${exp}`));
  return toB64Url(new Uint8Array(expected)) === sig;
}

export function maskName(name: string | null | undefined): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 1) + "****";
  return parts
    .map((p, i) => (i === 0 || i === parts.length - 1 ? p : p.slice(0, 1) + "****"))
    .filter((p, i, arr) => !(i > 1 && i < arr.length - 1))
    .join(" ");
}

export function detectFileType(bytes: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Recompute request status flags based on items. */
export async function refreshRequestStatus(admin: any, requestId: string) {
  const { data: items } = await admin.from("document_request_items").select("is_required,status").eq("request_id", requestId);
  const req = (items || []).filter((i: any) => i.is_required);
  const done = (s: string) => s === "received" || s === "approved";
  const allReq = req.length ? req.every((i: any) => done(i.status)) : (items || []).some((i: any) => done(i.status));
  const allApproved = (items || []).length > 0 && (items || []).every((i: any) => i.status === "approved" || (!i.is_required && i.status === "pending"));
  const upload_status = allApproved && allReq ? "approved" : allReq ? "complete" : (items || []).some((i: any) => done(i.status)) ? "partial" : "pending";
  await admin.from("document_requests").update({ upload_status, last_activity_at: new Date().toISOString() }).eq("id", requestId);
  return upload_status;
}
