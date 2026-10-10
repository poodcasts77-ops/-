import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ employeeId: z.string() });

export const getCollectorsStats = createServerFn({ method: "POST" })
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data }) => {
    if (data.employeeId !== "666666") {
      throw new Error("forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let customers: any[] = [];
    let states: any[] = [];

    try {
      const { data: cData, error: e1 } = await supabaseAdmin
        .from("customers")
        .select("customer_key, agent_employee_id, amount, raw")
        .limit(50000);
      if (!e1 && cData) customers = cData;

      const { data: sData, error: e2 } = await supabaseAdmin
        .from("customer_states")
        .select("customer_key, edits")
        .limit(50000);
      if (!e2 && sData) states = sData;
    } catch (err) {
      console.warn("Supabase error in getCollectorsStats:", err);
    }

    if (customers.length === 0) {
      const defaultData = (await import("@/data/wallet.json")).default as any[];
      customers = defaultData || [];
    }

    const stMap = new Map<string, any>();
    for (const s of states || []) stMap.set(s.customer_key, s);

    type Agg = {
      employeeId: string;
      accounts: number;
      walletTotal: number;
      promises: number;
      exemptions: number;
      reschedules: number;
      collected: number;
    };
    const acc = new Map<string, Agg>();

    const nonEmpty = (v: any) => v != null && String(v).trim() !== "";

    for (const c of customers || []) {
      const eid = c.agent_employee_id ? String(c.agent_employee_id) : "";
      if (!eid) continue;
      const cur = acc.get(eid) || {
        employeeId: eid,
        accounts: 0,
        walletTotal: 0,
        promises: 0,
        exemptions: 0,
        reschedules: 0,
        collected: 0,
      };
      cur.accounts++;
      cur.walletTotal += Number(c.amount) || 0;

      const st = stMap.get(c.customer_key);
      const edits: any = st?.edits || {};
      const raw: any = c.raw || {};

      const action = edits["الاكشن"] ?? raw["الاكشن"];
      if (action === "وعد سداد") cur.promises++;

      const reqType = String(edits["نوع الطلب"] ?? raw["نوع الطلب"] ?? raw["طلب الطلب"] ?? "");
      const isExemption =
        /اعفاء|إعفاء/.test(reqType) || nonEmpty(edits["طلب اعفاء"] ?? raw["طلب اعفاء"]);
      const isReschedule = /جدول/.test(reqType) || nonEmpty(edits["طلب جدولة"] ?? raw["طلب جدولة"]);
      if (isExemption) cur.exemptions++;
      if (isReschedule) cur.reschedules++;

      const pay = Number(edits.paymentAmount);
      if (Number.isFinite(pay)) cur.collected += pay;

      acc.set(eid, cur);
    }

    return Array.from(acc.values());
  });
