import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ADMIN_EMPLOYEE_ID = "666666";
const BUCKET = "customer-documents";
const MAX_BYTES = 10 * 1024 * 1024;

export const BASE_DOCUMENTS = [
  "خطاب تعريف براتب حديث",
  "كشف حساب بنكي لآخر ثلاثة شهور",
  "شهادة مدد وأجور",
  "خطاب أو إفادة توضح سبب التعثر",
  "إرفاق إثبات التزامات أخرى (إن وجد)",
  "تقرير طبي يوضح العجز وعدم اللياقة الطبية للعمل",
  "وثيقة إنهاء الخدمة",
  "قرار التقاعد",
];

const Actor = z.object({ employeeId: z.string().min(1).max(32), name: z.string().max(120).optional() });
const ItemIn = z.object({ label: z.string().trim().min(2).max(150), is_required: z.boolean() });

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function assertCanAccessCustomer(db: any, employeeId: string, customerKey: string) {
  const { data } = await db.from("customers").select("customer_key,agent_employee_id,customer_name,account_number,national_id").eq("customer_key", customerKey).limit(1).maybeSingle();
  if (!data) throw new Error("لم يتم العثور على العميل");
  if (employeeId !== ADMIN_EMPLOYEE_ID && String(data.agent_employee_id || "") !== employeeId) throw new Error("غير مصرح");
  return data;
}

async function assertCanAccessRequest(db: any, employeeId: string, requestId: string) {
  const { data } = await db.from("document_requests").select("*").eq("id", requestId).maybeSingle();
  if (!data) throw new Error("الطلب غير موجود");
  if (employeeId !== ADMIN_EMPLOYEE_ID && data.collector_employee_id !== employeeId) {
    await assertCanAccessCustomer(db, employeeId, data.customer_key);
  }
  return data;
}

async function log(db: any, requestId: string, event: string, actor: string, details?: any) {
  await db.from("document_activity_logs").insert({ request_id: requestId, event, actor, details: details ?? null });
}

function effectiveStatus(r: any) {
  if (r.status === "active" && new Date(r.expires_at).getTime() < Date.now()) return "expired";
  if (r.status === "active" && (r.upload_status === "complete" || r.upload_status === "approved")) return "completed";
  return r.status;
}

// ---------------- Collector side ----------------

export const createDocumentRequest = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      actor: Actor,
      customerKey: z.string().min(1).max(100),
      items: z.array(ItemIn).min(1).max(40),
      hours: z.number().int().min(1).max(24 * 30),
      saveToLibrary: z.array(z.string().trim().min(2).max(150)).max(40).optional(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { randomToken, sha256, normalizeId } = await import("./documents.server");
    const db = await admin();
    const cust = await assertCanAccessCustomer(db, data.actor.employeeId, data.customerKey);
    const nid = normalizeId(cust.national_id);
    if (!nid) throw new Error("لا يوجد رقم هوية مسجل لهذا العميل، لا يمكن إصدار رابط");
    // Invalidate previous active requests for this customer (one active link per customer)
    const { data: prev } = await db.from("document_requests").select("id").eq("customer_key", data.customerKey).eq("status", "active");
    for (const p of prev || []) {
      await db.from("document_requests").update({ status: "cancelled" }).eq("id", p.id);
      await log(db, p.id, "superseded", data.actor.employeeId);
    }
    const token = randomToken();
    const { data: req, error } = await db
      .from("document_requests")
      .insert({
        token_hash: await sha256(token),
        customer_key: data.customerKey,
        account_number: cust.account_number,
        customer_name: cust.customer_name,
        national_id_hash: await sha256("nid:" + nid),
        collector_employee_id: data.actor.employeeId,
        collector_name: data.actor.name ?? null,
        expires_at: new Date(Date.now() + data.hours * 3600 * 1000).toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    const rows = data.items
      .filter((it) => (seen.has(it.label) ? false : (seen.add(it.label), true)))
      .map((it, idx) => ({ request_id: req.id, label: it.label, is_required: it.is_required, sort_order: idx }));
    const { error: e2 } = await db.from("document_request_items").insert(rows);
    if (e2) throw new Error(e2.message);
    if (data.saveToLibrary?.length) {
      await db.from("document_library").upsert(data.saveToLibrary.map((label) => ({ label, created_by: data.actor.employeeId })), { onConflict: "label", ignoreDuplicates: true });
    }
    await log(db, req.id, "issued", data.actor.employeeId, { items: rows.length, hours: data.hours });
    return { id: req.id, token };
  });

export const listDocumentLibrary = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ actor: Actor }).parse(i))
  .handler(async () => {
    const db = await admin();
    const { data } = await db.from("document_library").select("id,label").order("created_at");
    return (data || []) as { id: string; label: string }[];
  });

export const listCustomerDocumentRequests = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ actor: Actor, customerKey: z.string().min(1).max(100) }).parse(i))
  .handler(async ({ data }) => {
    const db = await admin();
    await assertCanAccessCustomer(db, data.actor.employeeId, data.customerKey);
    const { data: reqs } = await db.from("document_requests").select("*").eq("customer_key", data.customerKey).order("created_at", { ascending: false }).limit(30);
    const ids = (reqs || []).map((r: any) => r.id);
    const [{ data: items }, { data: docs }] = ids.length
      ? await Promise.all([
          db.from("document_request_items").select("*").in("request_id", ids).order("sort_order"),
          db.from("customer_documents").select("id,request_id,item_id,file_name,mime,size_bytes,uploaded_at,is_current").in("request_id", ids).eq("is_current", true),
        ])
      : [{ data: [] }, { data: [] }];
    // mark seen
    if (ids.length) await db.from("customer_documents").update({ seen_by_collector: true }).in("request_id", ids).eq("seen_by_collector", false);
    return (reqs || []).map((r: any) => ({
      id: r.id,
      ref_no: r.ref_no,
      status: effectiveStatus(r),
      upload_status: r.upload_status,
      created_at: r.created_at,
      expires_at: r.expires_at,
      last_activity_at: r.last_activity_at,
      collector_name: r.collector_name,
      collector_employee_id: r.collector_employee_id,
      items: (items || [])
        .filter((i: any) => i.request_id === r.id)
        .map((i: any) => ({ ...i, document: (docs || []).find((d: any) => d.item_id === i.id) || null })),
    }));
  });

export const manageDocumentRequest = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      actor: Actor,
      requestId: z.string().uuid(),
      action: z.enum(["cancel", "renew", "reissue", "add_items"]),
      hours: z.number().int().min(1).max(24 * 30).optional(),
      items: z.array(ItemIn).max(40).optional(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { randomToken, sha256, refreshRequestStatus } = await import("./documents.server");
    const db = await admin();
    const r = await assertCanAccessRequest(db, data.actor.employeeId, data.requestId);
    const hours = data.hours ?? 72;
    if (data.action === "cancel") {
      await db.from("document_requests").update({ status: "cancelled" }).eq("id", r.id);
      await log(db, r.id, "cancelled", data.actor.employeeId);
      return { ok: true };
    }
    if (r.status === "cancelled") throw new Error("هذا الرابط ملغى، أصدر طلبًا جديدًا");
    if (data.action === "renew") {
      await db.from("document_requests").update({ status: "active", expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), failed_attempts: 0, locked_until: null }).eq("id", r.id);
      await log(db, r.id, "renewed", data.actor.employeeId, { hours });
      return { ok: true };
    }
    if (data.action === "reissue") {
      const token = randomToken();
      await db.from("document_requests").update({ token_hash: await sha256(token), status: "active", expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), failed_attempts: 0, locked_until: null }).eq("id", r.id);
      await log(db, r.id, "reissued", data.actor.employeeId);
      return { ok: true, token };
    }
    // add_items
    const { data: existing } = await db.from("document_request_items").select("label,sort_order").eq("request_id", r.id);
    const have = new Set((existing || []).map((e: any) => e.label));
    let order = Math.max(0, ...(existing || []).map((e: any) => e.sort_order)) + 1;
    const rows = (data.items || []).filter((i) => !have.has(i.label)).map((i) => ({ request_id: r.id, label: i.label, is_required: i.is_required, sort_order: order++ }));
    if (rows.length) await db.from("document_request_items").insert(rows);
    await refreshRequestStatus(db, r.id);
    await log(db, r.id, "items_added", data.actor.employeeId, { count: rows.length });
    return { ok: true };
  });

export const reviewDocumentItem = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ actor: Actor, itemId: z.string().uuid(), decision: z.enum(["approve", "reject"]), reason: z.string().max(300).optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { refreshRequestStatus } = await import("./documents.server");
    const db = await admin();
    const { data: item } = await db.from("document_request_items").select("*").eq("id", data.itemId).maybeSingle();
    if (!item) throw new Error("المستند غير موجود");
    await assertCanAccessRequest(db, data.actor.employeeId, item.request_id);
    if (data.decision === "approve") {
      if (item.status !== "received") throw new Error("لا يوجد ملف مستلم لاعتماده");
      await db.from("document_request_items").update({ status: "approved", rejection_reason: null, updated_at: new Date().toISOString() }).eq("id", item.id);
    } else {
      await db.from("document_request_items").update({ status: "rejected", rejection_reason: data.reason || "يرجى إعادة رفع المستند", updated_at: new Date().toISOString() }).eq("id", item.id);
    }
    await refreshRequestStatus(db, item.request_id);
    await log(db, item.request_id, data.decision === "approve" ? "approved" : "rejected", data.actor.employeeId, { item: item.label, reason: data.reason });
    return { ok: true };
  });

export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ actor: Actor, documentId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: doc } = await db.from("customer_documents").select("*").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("الملف غير موجود");
    await assertCanAccessRequest(db, data.actor.employeeId, doc.request_id);
    if (doc.storage_path && doc.storage_path.startsWith("data:")) {
      return { url: doc.storage_path };
    }
    const { data: s, error } = await db.storage.from(BUCKET).createSignedUrl(doc.storage_path, 120);
    if (error || !s?.signedUrl) {
      if (doc.storage_path) return { url: doc.storage_path };
      throw new Error(error?.message || "تعذر إنشاء رابط الملف");
    }
    await log(db, doc.request_id, "viewed", data.actor.employeeId, { document: doc.id });
    return { url: s.signedUrl as string };
  });

export const listDocumentNotifications = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ actor: Actor }).parse(i))
  .handler(async ({ data }) => {
    const db = await admin();
    let q = db.from("document_requests").select("id,customer_key,customer_name,account_number").order("last_activity_at", { ascending: false }).limit(200);
    if (data.actor.employeeId !== ADMIN_EMPLOYEE_ID) q = q.eq("collector_employee_id", data.actor.employeeId);
    const { data: reqs } = await q;
    const ids = (reqs || []).map((r: any) => r.id);
    if (!ids.length) return [];
    const { data: docs } = await db.from("customer_documents").select("id,request_id,item_id,uploaded_at").in("request_id", ids).eq("seen_by_collector", false).order("uploaded_at", { ascending: false }).limit(30);
    const itemIds = (docs || []).map((d: any) => d.item_id);
    const { data: items } = itemIds.length ? await db.from("document_request_items").select("id,label").in("id", itemIds) : { data: [] };
    return (docs || []).map((d: any) => {
      const r = (reqs || []).find((x: any) => x.id === d.request_id);
      return {
        id: d.id as string,
        customer_key: r?.customer_key as string,
        customer_name: r?.customer_name as string | null,
        account_number: r?.account_number as string | null,
        label: (items || []).find((i: any) => i.id === d.item_id)?.label as string,
        uploaded_at: d.uploaded_at as string,
      };
    });
  });

// ---------------- Public (customer) side ----------------

const TokenIn = z.string().min(20).max(100);

async function findByToken(db: any, token: string) {
  const { sha256 } = await import("./documents.server");
  const { data } = await db.from("document_requests").select("*").eq("token_hash", await sha256(token)).maybeSingle();
  return data;
}

function publicState(r: any): "active" | "expired" | "cancelled" | "invalid" {
  if (!r) return "invalid";
  if (r.status === "cancelled") return "cancelled";
  if (new Date(r.expires_at).getTime() < Date.now()) return "expired";
  return "active";
}

export const getPublicRequestInfo = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ token: TokenIn }).parse(i))
  .handler(async ({ data }) => {
    const { maskName } = await import("./documents.server");
    const db = await admin();
    const r = await findByToken(db, data.token);
    const state = publicState(r);
    return { state, maskedName: state === "active" ? maskName(r.customer_name) : "" };
  });

export const verifyCustomerId = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ token: TokenIn, nationalId: z.string().max(20) }).parse(i))
  .handler(async ({ data }) => {
    const { sha256, normalizeId, signSession } = await import("./documents.server");
    const db = await admin();
    const r = await findByToken(db, data.token);
    const state = publicState(r);
    if (state !== "active") return { ok: false as const, state };
    if (r.locked_until && new Date(r.locked_until).getTime() > Date.now()) {
      return { ok: false as const, state, error: "تم تجاوز عدد المحاولات المسموح. يرجى المحاولة لاحقًا." };
    }
    const nid = normalizeId(data.nationalId);
    const match = !!nid && (await sha256("nid:" + nid)) === r.national_id_hash;
    if (!match) {
      const attempts = (r.failed_attempts || 0) + 1;
      const lock = attempts >= 5;
      await db.from("document_requests").update({ failed_attempts: lock ? 0 : attempts, locked_until: lock ? new Date(Date.now() + 30 * 60e3).toISOString() : null }).eq("id", r.id);
      await log(db, r.id, "verify_failed", "customer");
      return { ok: false as const, state, error: "تعذر التحقق من البيانات المدخلة" };
    }
    await db.from("document_requests").update({ failed_attempts: 0, locked_until: null, last_activity_at: new Date().toISOString() }).eq("id", r.id);
    await log(db, r.id, "verified", "customer");
    return { ok: true as const, state, session: await signSession(r.id) };
  });

async function authPublic(db: any, token: string, session: string) {
  const { verifySession } = await import("./documents.server");
  const r = await findByToken(db, token);
  if (publicState(r) !== "active") throw new Error("هذا الرابط لم يعد متاحًا.");
  if (!(await verifySession(session, r.id))) throw new Error("انتهت جلسة التحقق، يرجى التحقق مرة أخرى");
  return r;
}

export const getUploadState = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ token: TokenIn, session: z.string().max(300) }).parse(i))
  .handler(async ({ data }) => {
    const db = await admin();
    const r = await authPublic(db, data.token, data.session);
    const { data: items } = await db.from("document_request_items").select("id,label,is_required,status,rejection_reason").eq("request_id", r.id).order("sort_order");
    const { data: docs } = await db.from("customer_documents").select("item_id,file_name").eq("request_id", r.id).eq("is_current", true);
    return {
      upload_status: r.upload_status as string,
      items: (items || []).map((i: any) => ({ ...i, file_name: (docs || []).find((d: any) => d.item_id === i.id)?.file_name ?? null })),
    };
  });

export const uploadCustomerDocument = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      token: TokenIn,
      session: z.string().max(300),
      itemId: z.string().uuid(),
      fileName: z.string().max(200),
      base64: z.string().max(Math.ceil((MAX_BYTES * 4) / 3) + 16),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { b64ToBytes, detectFileType, refreshRequestStatus } = await import("./documents.server");
    const db = await admin();
    const r = await authPublic(db, data.token, data.session);
    const { data: item } = await db.from("document_request_items").select("*").eq("id", data.itemId).eq("request_id", r.id).maybeSingle();
    if (!item) throw new Error("المستند غير متاح");
    if (item.status === "approved") throw new Error("تم اعتماد هذا المستند ولا يمكن استبداله");
    const ext = (data.fileName.split(".").pop() || "").toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) throw new Error("صيغة الملف غير مدعومة. الصيغ المسموحة: PDF, JPG, PNG");
    const bytes = b64ToBytes(data.base64);
    if (bytes.length > MAX_BYTES) throw new Error("حجم الملف يتجاوز 10MB");
    if (bytes.length < 100) throw new Error("الملف فارغ أو تالف");
    const mime = detectFileType(bytes);
    if (!mime) throw new Error("محتوى الملف غير صالح أو غير مدعوم");
    const fileExt = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
    const path = `${r.id}/${item.id}/${crypto.randomUUID()}.${fileExt}`;
    let finalPath = path;
    try {
      const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (upErr) {
        console.warn("Storage upload failed, falling back to data URL storage:", upErr);
        finalPath = `data:${mime};base64,${data.base64}`;
      }
    } catch {
      finalPath = `data:${mime};base64,${data.base64}`;
    }
    await db.from("customer_documents").update({ is_current: false }).eq("item_id", item.id);
    await db.from("customer_documents").insert({
      request_id: r.id,
      item_id: item.id,
      customer_key: r.customer_key,
      storage_path: finalPath,
      file_name: data.fileName.slice(0, 200),
      mime,
      size_bytes: bytes.length,
    });
    await db.from("document_request_items").update({ status: "received", rejection_reason: null, updated_at: new Date().toISOString() }).eq("id", item.id);
    const upload_status = await refreshRequestStatus(db, r.id);
    await log(db, r.id, "uploaded", "customer", { item: item.label, size: bytes.length });
    return { ok: true, upload_status };
  });
