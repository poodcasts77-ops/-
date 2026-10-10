import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ADMIN_EMPLOYEE_ID = "666666";

const RfRowSchema = z.object({
  account_number: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  agent_employee_id: z.string().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  supervisor_employee_id: z.string().nullable().optional(),
  supervisor_name: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  national_id: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  product_type: z.string().nullable().optional(),
  eviction_agency: z.string().nullable().optional(),
  eviction_action: z.string().nullable().optional(),
  property_city: z.string().nullable().optional(),
  property_kind: z.string().nullable().optional(),
  execution_action: z.string().nullable().optional(),
  case_number: z.string().nullable().optional(),
  payment: z.number().nullable().optional(),
  request_number: z.string().nullable().optional(),
  request_type: z.string().nullable().optional(),
  reserved_balance: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  imported_by: z.string().nullable().optional(),
});



export type RfRow = z.infer<typeof RfRowSchema>;

const ListInput = z.object({
  employeeId: z.string(),
  role: z.string(),
});

export const getRfCustomers = createServerFn({ method: "POST" })
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let query = supabaseAdmin.from("rf_customers" as any).select("*").order("amount", { ascending: false }).limit(5000);
      if (data.role !== "admin") {
        query = query.eq("agent_employee_id", data.employeeId);
      }
      const { data: rows, error } = await query;
      if (error) {
        console.warn("Error fetching rf_customers:", error);
        return [];
      }
      return rows || [];
    } catch (err) {
      console.warn("Supabase error in getRfCustomers:", err);
      return [];
    }
  });

const ReplaceInput = z.object({
  employeeId: z.string(),
  rows: z.array(RfRowSchema).max(20000),
});

export const replaceRfCustomers = createServerFn({ method: "POST" })
  .inputValidator((input) => ReplaceInput.parse(input))
  .handler(async ({ data }) => {
    if (data.employeeId !== ADMIN_EMPLOYEE_ID) throw new Error("Unauthorized");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin.from("rf_customers" as any).delete().not("id", "is", null);
    if (delErr) throw new Error(delErr.message);
    const CHUNK = 500;
    for (let i = 0; i < data.rows.length; i += CHUNK) {
      const slice = data.rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("rf_customers" as any).insert(slice as any);
      if (error) throw new Error(error.message);
    }
    return { inserted: data.rows.length };
  });

const ClearInput = z.object({ employeeId: z.string() });
export const clearRfCustomers = createServerFn({ method: "POST" })
  .inputValidator((input) => ClearInput.parse(input))
  .handler(async ({ data }) => {
    if (data.employeeId !== ADMIN_EMPLOYEE_ID) throw new Error("Unauthorized");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("rf_customers" as any).delete().not("id", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateInput = z.object({
  id: z.string(),
  patch: z.object({
    action: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    payment: z.number().nullable().optional(),
    request_number: z.string().nullable().optional(),
    request_type: z.string().nullable().optional(),
    case_number: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    reserved_balance: z.number().nullable().optional(),
    description: z.string().nullable().optional(),
  }),
});

export const updateRfCustomer = createServerFn({ method: "POST" })
  .inputValidator((input) => UpdateInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("rf_customers" as any)
      .update(data.patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
