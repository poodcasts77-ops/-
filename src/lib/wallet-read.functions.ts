import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const WalletInput = z.object({
  role: z.string(),
  employeeId: z.string(),
  forceAll: z.boolean().optional(),
});

export const getWalletCustomers = createServerFn({ method: "POST" })
  .inputValidator((input) => WalletInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const PAGE = 1000;
      const all: any[] = [];
      let from = 0;
      // PostgREST caps a single response at ~1000 rows regardless of .limit(),
      // so we page through with .range() until exhausted.
      // Safety cap of 200k rows.
      while (from < 200000) {
        let query = supabaseAdmin
          .from("customers")
          .select("*")
          .order("amount", { ascending: false })
          .range(from, from + PAGE - 1);

        if (data.role === "collector" && !data.forceAll) {
          query = query.eq("agent_employee_id", data.employeeId);
        }

        const { data: rows, error } = await query;
        if (error) {
          console.error("Supabase query error in getWalletCustomers:", error);
          throw new Error(error.message);
        }
        if (!rows || rows.length === 0) break;
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    } catch (err) {
      console.warn("Failed fetching from Supabase in getWalletCustomers, falling back to local data:", err);
      const defaultData = (await import("@/data/wallet.json")).default;
      let list = (defaultData as any[]) || [];
      if (data.role === "collector" && !data.forceAll) {
        list = list.filter((c: any) => String(c.agent_employee_id) === String(data.employeeId));
      }
      return list;
    }
  });
