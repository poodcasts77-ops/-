import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, Wallet, Phone, X, User, CreditCard, Tag, IdCard, Building2, MapPin, Home, Gavel, ClipboardList, FileText, BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { getRfCustomers, updateRfCustomer } from "@/lib/rf-wallet.functions";
import { getSession } from "@/components/LoginGate";
import { formatMoney, formatMoneyInput, parseMoneyInput, normalizePhone } from "@/lib/wallet-types";
import najizVerifyBtn from "@/assets/najiz-verify-btn.png.asset.json";

export const Route = createFileRoute("/rf-wallet")({
  head: () => ({
    meta: [
      { title: "محفظة عملاء العقار (RF)" },
      { name: "description", content: "قائمة عملاء العقار المخصصة للمحصل." },
    ],
  }),
  component: RfWalletPage,
});

type RfRow = {
  id: string;
  account_number: string | null;
  amount: number | null;
  note: string | null;
  action: string | null;
  agent_employee_id: string | null;
  agent_name: string | null;
  supervisor_employee_id: string | null;
  supervisor_name: string | null;
  product: string | null;
  customer_name: string | null;
  national_id: string | null;
  phone: string | null;
  product_type: string | null;
  eviction_agency: string | null;
  eviction_action: string | null;
  property_city: string | null;
  property_kind: string | null;
  execution_action: string | null;
  case_number: string | null;
  payment: number | null;
  request_number: string | null;
  request_type: string | null;
  reserved_balance: number | null;
  description: string | null;
};

const ACTION_OPTIONS: { value: string; color: string }[] = [
  { value: "بيانات خاطئة", color: "#6B7280" },
  { value: "بدون إجابة", color: "#94A3B8" },
  { value: "Call Back", color: "#3B82F6" },
  { value: "الرقم خطأ", color: "#F97316" },
  { value: "تم السداد", color: "#22C55E" },
  { value: "خروج نهائي", color: "#0EA5A4" },
  { value: "متوفي", color: "#EF4444" },
  { value: "مشكلة غير محلولة", color: "#DC2626" },
  { value: "وعد سداد", color: "#8B5CF6" },
];

function actionStyle(v?: string | null): React.CSSProperties | undefined {
  if (!v) return undefined;
  const c = ACTION_OPTIONS.find((a) => a.value === v)?.color;
  return c ? { color: c, borderColor: c, backgroundColor: `${c}14` } : undefined;
}

// Column order: left → right (first column shows leftmost when wrapped in dir="ltr")
const COLUMNS: { key: keyof RfRow; label: string; money?: boolean; number?: boolean; kind?: "action" | "phone" }[] = [
  { key: "account_number", label: "رقم الحساب", number: true },
  { key: "amount", label: "مبلغ المديونية", money: true },
  { key: "note", label: "Note" },
  { key: "action", label: "الاكشن", kind: "action" },
  { key: "product", label: "المنتج" },
  { key: "product_type", label: "نوع المنتج" },
  { key: "national_id", label: "رقم الهوية", number: true },
  { key: "customer_name", label: "اسم العميل" },
  { key: "phone", label: "رقم الجوال", kind: "phone" },
  { key: "agent_name", label: "اسم المحصل" },
  { key: "supervisor_name", label: "اسم المشرف" },
  { key: "eviction_agency", label: "وكالة تنفيذ إخلاء العقار" },
  { key: "eviction_action", label: "أكشن الإخلاء" },
  { key: "property_city", label: "مدينة العقار" },
  { key: "property_kind", label: "شقة - فيلا - أرض" },
  { key: "execution_action", label: "أكشن تنفيذ" },
  { key: "case_number", label: "رقم القضية", number: true },
  { key: "request_number", label: "رقم طلب سيبل" },
  { key: "request_type", label: "نوع الطلب" },
  { key: "description", label: "الوصف" },
  { key: "reserved_balance", label: "أرصدة محجوزة", money: true },
  { key: "payment", label: "السداد", money: true },
];

function columnWidthClass(key: keyof RfRow): string {
  switch (key) {
    case "account_number": return "w-[175px] min-w-[175px] max-w-[175px]";
    case "amount": return "w-[120px] min-w-[120px] max-w-[120px]";
    case "note": return "w-[82px] min-w-[82px] max-w-[82px]";
    case "action": return "w-[130px] min-w-[130px] max-w-[130px]";
    case "product":
    case "product_type": return "w-[75px] min-w-[75px] max-w-[75px]";
    case "national_id": return "w-[160px] min-w-[160px] max-w-[160px]";
    case "customer_name": return "w-[240px] min-w-[240px] max-w-[240px]";
    case "phone": return "w-[160px] min-w-[160px] max-w-[160px]";
    case "agent_name":
    case "supervisor_name": return "w-[260px] min-w-[260px] max-w-[260px]";
    case "eviction_agency":
    case "eviction_action":
    case "execution_action": return "w-[160px] min-w-[160px] max-w-[160px]";
    case "property_city":
    case "property_kind": return "w-[110px] min-w-[110px] max-w-[110px]";
    case "case_number": return "w-[135px] min-w-[135px] max-w-[135px]";
    case "request_number": return "w-[120px] min-w-[120px] max-w-[120px]";
    case "request_type": return "w-[140px] min-w-[140px] max-w-[140px]";
    case "description": return "w-[220px] min-w-[220px] max-w-[220px]";
    case "reserved_balance": return "w-[130px] min-w-[130px] max-w-[130px]";
    case "payment": return "w-[120px] min-w-[120px] max-w-[120px]";
    default: return "w-[120px] min-w-[120px] max-w-[120px]";
  }
}

function cellWrap(key: keyof RfRow): string {
  switch (key) {
    case "customer_name":
    case "agent_name":
    case "supervisor_name":
    case "eviction_agency":
    case "eviction_action":
    case "execution_action":
    case "description":
      return "whitespace-normal break-words leading-relaxed";
    default:
      return "whitespace-nowrap";
  }
}

function formatPhone(v: string | null): string {
  if (!v) return "";
  const n = normalizePhone(v);
  if (!n) return "";
  return "+" + n;
}

function RfWalletPage() {
  const fetchRf = useServerFn(getRfCustomers);
  const [rows, setRows] = useState<RfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openRow, setOpenRow] = useState<RfRow | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      setError("الرجاء تسجيل الدخول أولاً");
      setLoading(false);
      return;
    }
    fetchRf({ data: { employeeId: session.employeeId, role: session.role } })
      .then((data) => setRows((data as any as RfRow[]) || []))
      .catch((e) => setError(e?.message || "فشل تحميل البيانات"))
      .finally(() => setLoading(false));
  }, [fetchRf]);

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return rows;
    return rows.filter((r) =>
      COLUMNS.some((c) => String(r[c.key] ?? "").includes(s))
    );
  }, [rows, q]);

  const applyPatch = (id: string, patch: Partial<RfRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setOpenRow((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-primary">
        <div className="max-w-[1600px] mx-auto px-4 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#133E35]">
            <Wallet className="size-4 text-primary" />
            <span className="font-bold text-sm">محفظة عملاء العقار (RF)</span>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 gap-1">
            <Link to="/">
              <ArrowRight className="size-4" />
              رجوع
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-2 py-3 space-y-2">
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <div className="text-xs font-bold text-[#133E35]">
            عدد السجلات: {filtered.length.toLocaleString("en-US")}
            {filtered.length !== rows.length && ` / ${rows.length.toLocaleString("en-US")}`}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث في كل الأعمدة..."
            className="pr-9 h-9"
          />
        </div>

        <div dir="ltr" className="border rounded-lg overflow-auto max-h-[calc(100vh-170px)] bg-white">
          {loading ? (
            <div dir="rtl" className="p-10 text-center text-sm text-muted-foreground">جاري تحميل المحفظة...</div>
          ) : error ? (
            <div dir="rtl" className="p-10 text-center text-sm text-red-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div dir="rtl" className="p-10 text-center text-sm text-muted-foreground">لا توجد بيانات</div>
          ) : (
            <Table className="text-[10.5px] border-collapse table-auto w-max min-w-full">
              <TableHeader className="sticky top-0 bg-secondary z-10">
                <TableRow>
                  <TableHead className="w-[38px] text-center font-bold text-[#133E35] whitespace-nowrap border border-[#d4ddd9] bg-secondary">#</TableHead>
                  {COLUMNS.map((c) => (
                    <TableHead
                      key={String(c.key)}
                      className={`text-center font-bold text-[#133E35] whitespace-nowrap border border-[#d4ddd9] bg-secondary ${columnWidthClass(c.key)}`}
                    >
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={r.id} className={`${i % 2 === 0 ? "bg-white" : "bg-[#f7f8f5]"} hover:bg-accent/30`}>
                    <TableCell className="tabular-nums text-muted-foreground border border-[#e5ebe8] text-center p-0.5 h-7">
                      {i + 1}
                    </TableCell>
                    {COLUMNS.map((c) => {
                      const value = r[c.key];
                      let display = "";
                      if (c.money) display = formatMoney(value as any);
                      else if (c.kind === "phone") display = formatPhone(value as any);
                      else display = value == null || value === "" ? "" : String(value);

                      const align = "text-center";
                      const baseCls = `${cellWrap(c.key)} text-[#133E35] border border-[#e5ebe8] ${align} ${columnWidthClass(c.key)}`;

                      if (c.key === "account_number") {
                        return (
                          <TableCell key={String(c.key)} dir="rtl" className={baseCls}>
                            <button
                              type="button"
                              className="text-primary hover:underline font-medium cursor-pointer bg-transparent border-0 p-0"
                              onClick={() => setOpenRow(r)}
                            >
                              {display}
                            </button>
                          </TableCell>
                        );
                      }

                      if (c.kind === "action" && display) {
                        return (
                          <TableCell key={String(c.key)} dir="rtl" className={baseCls}>
                            <span className="font-extrabold" style={actionStyle(display)}>{display}</span>
                          </TableCell>
                        );
                      }

                      return (
                        <TableCell
                          key={String(c.key)}
                          dir={c.kind === "phone" ? "ltr" : "rtl"}
                          className={`${baseCls} ${c.key === "payment" ? "font-bold text-emerald-700" : ""}`}
                        >
                          {display}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>

      <RfDetailDialog row={openRow} onClose={() => setOpenRow(null)} onPatched={applyPatch} />
    </div>
  );
}

function RfDetailDialog({
  row,
  onClose,
  onPatched,
}: {
  row: RfRow | null;
  onClose: () => void;
  onPatched: (id: string, patch: Partial<RfRow>) => void;
}) {
  const updateFn = useServerFn(updateRfCustomer);
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<RfRow | null>(null);

  useEffect(() => {
    setLocal(row);
  }, [row]);

  if (!local) return null;

  const set = <K extends keyof RfRow>(k: K, v: RfRow[K]) => setLocal({ ...local, [k]: v } as RfRow);

  const save = async (patch: Partial<RfRow>) => {
    if (!local) return;
    setSaving(true);
    try {
      await updateFn({ data: { id: local.id, patch: patch as any } });
      onPatched(local.id, patch);
    } finally {
      setSaving(false);
    }
  };

  const phoneDigits = normalizePhone(local.phone) || "";
  const waHref = phoneDigits ? `https://wa.me/${phoneDigits}` : "";
  const telHref = phoneDigits ? `tel:+${phoneDigits}` : "";

  const hasRequest = !!(local.request_number || local.request_type);

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-md overflow-y-auto [&>button.absolute]:left-3 [&>button.absolute]:right-auto [&>button.absolute]:top-3 p-2 sm:p-3 pt-12 sm:pt-12 bg-[#FBFAF7] border-[#e8e6e1]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{local.customer_name || local.account_number || ""}</SheetTitle>
        </SheetHeader>

        <div className="mt-2 space-y-2" dir="rtl">
          {/* Header pill cards: name + debt */}
          <div className="grid grid-cols-[1.45fr_0.85fr] gap-2">
            <PillCard icon={<User className="size-3.5 text-[#5a6b63]" />} label="اسم العميل :">
              <span className="text-[10.5px] text-[#3a3a3a] font-semibold overflow-hidden whitespace-nowrap">
                {local.customer_name || ""}
              </span>
            </PillCard>
            <PillCard icon={<Wallet className="size-3.5 text-[#5a6b63]" />} label="مبلغ المديونية :">
              <span className="text-[11px] font-bold text-[#0E8F4F] tabular-nums text-right w-full pr-1">
                {formatMoney(local.amount) || ""}
              </span>
            </PillCard>
          </div>

          {/* Action buttons: WhatsApp | Call | Najiz */}
          <div dir="rtl" className="grid grid-cols-3 items-stretch gap-1.5 sm:gap-2 py-1">
            <ActionBtn
              disabled={!waHref}
              onClick={() => waHref && window.open(waHref, "_blank")}
              tone="emerald"
              icon={<WA />}
              label="إرسال واتساب"
            />
            <ActionBtn
              disabled={!telHref}
              onClick={() => telHref && (window.location.href = telHref)}
              tone="blue"
              icon={<Phone className="size-4 sm:size-4.5" />}
              label="إجراء إتصال"
            />
            <ActionBtn
              onClick={() => window.open("https://najiz.sa/applications/iexecution/Inquiry", "_blank")}
              tone="amber"
              icon={<Gavel className="size-4 sm:size-4.5" />}
              label="التحقق - ناجز"
            />
          </div>

          {/* الصف 1: بيانات الحساب */}
          <SectionCard>
            <div className="grid grid-cols-2 gap-2">
              <ReadField label="رقم الحساب" icon={<CreditCard className="size-3" />} value={local.account_number} dir="ltr" />
              <ReadField label="رقم الهوية" icon={<IdCard className="size-3" />} value={local.national_id} dir="ltr" />
              <ReadField label="المنتج" icon={<Tag className="size-3" />} value={local.product} />
              <ReadField label="نوع المنتج" icon={<Tag className="size-3" />} value={local.product_type} />
            </div>
          </SectionCard>

          {/* الصف 2: بيانات المحصل / المشرف */}
          <SectionCard>
            <div className="grid grid-cols-2 gap-2">
              <ReadField label="اسم المحصل" icon={<User className="size-3" />} value={local.agent_name} />
              <ReadField label="اسم المشرف" icon={<User className="size-3" />} value={local.supervisor_name} />
            </div>
          </SectionCard>

          {/* الصف 3: العقار */}
          <SectionCard>
            <div className="grid grid-cols-2 gap-2">
              <ReadField label="مدينة العقار" icon={<MapPin className="size-3" />} value={local.property_city} />
              <ReadField label="نوع العقار" icon={<Home className="size-3" />} value={local.property_kind} />
              <ReadField label="وكالة إخلاء العقار" icon={<Building2 className="size-3" />} value={local.eviction_agency} />
              <ReadField label="أكشن الإخلاء" icon={<ClipboardList className="size-3" />} value={local.eviction_action} />
              <div className="col-span-2">
                <ReadField label="أكشن تنفيذ" icon={<Gavel className="size-3" />} value={local.execution_action} />
              </div>
            </div>
          </SectionCard>

          {/* الصف 4: رقم الجوال + الاكشن */}
          <SectionCard>
            <div className="grid grid-cols-2 gap-2">
              <EditFieldLbl label="رقم الجوال" icon={<Phone className="size-3" />}>
                <Input
                  dir="ltr"
                  value={local.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                  onBlur={() => save({ phone: local.phone })}
                  placeholder="05xxxxxxxx"
                  className={inputCls + " text-left"}
                />
              </EditFieldLbl>
              <EditFieldLbl label="الاكشن" icon={<BadgeCheck className="size-3" />}>
                <Select
                  value={local.action ?? undefined}
                  onValueChange={(v) => { set("action", v); void save({ action: v }); }}
                >
                  <SelectTrigger className={inputCls + " font-extrabold"} style={actionStyle(local.action)}>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {ACTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} style={{ color: o.color }} className="font-extrabold text-[11px]">
                        {o.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditFieldLbl>
            </div>
          </SectionCard>

          {/* الصف 5: رقم القضية + السداد */}
          <SectionCard>
            <div className="grid grid-cols-2 gap-2">
              <EditFieldLbl label="رقم القضية" icon={<FileText className="size-3" />}>
                <Input
                  value={local.case_number ?? ""}
                  onChange={(e) => set("case_number", e.target.value)}
                  onBlur={() => save({ case_number: local.case_number })}
                  className={inputCls + " tabular-nums"}
                  inputMode="numeric"
                />
              </EditFieldLbl>
              <EditFieldLbl label="السداد" icon={<Wallet className="size-3" />}>
                <Input
                  dir="ltr"
                  value={formatMoneyInput(String(local.payment ?? ""))}
                  onChange={(e) => {
                    const raw = parseMoneyInput(e.target.value);
                    set("payment", raw === "" ? null : (Number(raw) as any));
                  }}
                  onBlur={() => save({ payment: local.payment == null ? null : Number(local.payment) })}
                  className={inputCls + " tabular-nums font-bold text-emerald-700 text-left"}
                  inputMode="decimal"
                />
              </EditFieldLbl>
            </div>
          </SectionCard>

          {/* الصف 6: يوجد طلبات */}
          <SectionCard>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11.5px] font-bold text-[#3a3a3a]">يوجد طلبات</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                hasRequest ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-500 border-gray-200"
              }`}>
                {hasRequest ? "نعم" : "لا"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <EditFieldLbl label="رقم الطلب" icon={<FileText className="size-3" />}>
                <Input
                  value={local.request_number ?? ""}
                  onChange={(e) => set("request_number", e.target.value)}
                  onBlur={() => save({ request_number: local.request_number })}
                  className={inputCls + " tabular-nums"}
                  inputMode="numeric"
                />
              </EditFieldLbl>
              <EditFieldLbl label="نوع الطلب" icon={<Tag className="size-3" />}>
                <Input
                  value={local.request_type ?? ""}
                  onChange={(e) => set("request_type", e.target.value)}
                  onBlur={() => save({ request_type: local.request_type })}
                  className={inputCls}
                  placeholder="—"
                />
              </EditFieldLbl>
            </div>
          </SectionCard>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving} className="h-8 text-[11px]">
              <X className="size-3.5 ml-1" />
              إغلاق
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const inputCls =
  "h-8 text-[10.5px] text-center bg-white border border-[#e8e6e1] rounded-md focus-visible:ring-1 focus-visible:ring-[#234E45]/30 focus-visible:ring-offset-0";

function PillCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-3 pt-2 pb-2.5 shadow-[0_2px_6px_rgba(0,0,0,0.05)] border border-[#ececec]">
      <div dir="rtl" className="flex flex-row items-center justify-start gap-1.5 text-[#3a3a3a] font-bold text-[12px] mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <div dir="rtl" className="h-7 rounded-xl bg-white shadow-inner border border-[#ececec] px-2 flex items-center justify-start text-right overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[#e8e6e1] bg-white p-1.5">{children}</div>;
}

function EditFieldLbl({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[9.5px] font-bold text-[#5a6b63] mb-0.5 px-0.5">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function ReadField({ label, icon, value, dir: d }: { label: string; icon?: React.ReactNode; value: React.ReactNode; dir?: "ltr" | "rtl" }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[9.5px] font-bold text-[#5a6b63] mb-0.5 px-0.5">
        {icon}
        <span>{label}</span>
      </div>
      <div dir={d || "rtl"} className={`${inputCls} flex items-center justify-center text-[#3a3a3a] font-semibold overflow-hidden whitespace-nowrap px-2`}>
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function WA() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 sm:size-4.5 fill-current" aria-hidden>
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .17 5.32.17 11.88c0 2.09.55 4.13 1.6 5.93L0 24l6.35-1.66a11.88 11.88 0 0 0 5.71 1.45h.01c6.56 0 11.88-5.32 11.88-11.88 0-3.17-1.24-6.16-3.43-8.43ZM12.07 21.3h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.77.99 1-3.67-.22-.38a9.44 9.44 0 0 1-1.44-4.85c0-5.22 4.25-9.47 9.48-9.47 2.53 0 4.9.99 6.69 2.78a9.4 9.4 0 0 1 2.77 6.7c0 5.22-4.25 9.48-9.47 9.48Zm5.48-7.09c-.3-.15-1.77-.87-2.05-.97-.28-.1-.48-.15-.68.15s-.78.97-.96 1.17c-.18.2-.35.22-.65.07s-1.27-.47-2.42-1.49c-.9-.8-1.5-1.78-1.68-2.08-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.68-1.63-.93-2.24-.24-.58-.5-.5-.68-.51h-.58c-.2 0-.52.07-.8.37-.28.3-1.05 1.02-1.05 2.5s1.08 2.9 1.22 3.1c.15.2 2.11 3.23 5.11 4.53.71.31 1.27.49 1.71.63.72.23 1.37.2 1.88.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.43-.07-.13-.27-.2-.57-.35Z"/>
    </svg>
  );
}

function ActionBtn({
  icon, label, onClick, disabled, tone,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean;
  tone: "emerald" | "blue" | "amber";
}) {
  const tones = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", hoverBg: "hover:bg-emerald-100", hoverBorder: "hover:border-emerald-250", hoverPanel: "hover:bg-emerald-50/50" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", hoverBg: "hover:bg-blue-100", hoverBorder: "hover:border-blue-250", hoverPanel: "hover:bg-blue-50/50" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", hoverBg: "hover:bg-amber-100", hoverBorder: "hover:border-amber-250", hoverPanel: "hover:bg-amber-50/50" },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full h-full flex flex-col items-center justify-center gap-1.5 p-1.5 sm:p-2.5 bg-white ${tones.hoverPanel} border border-[#ececec] ${tones.hoverBorder} rounded-2xl shadow-[0_2px_6px_rgba(0,0,0,0.04)] transition-all duration-300 hover:scale-[1.04] active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none cursor-pointer group min-h-[72px] sm:min-h-[88px]`}
    >
      <div className={`size-8 sm:size-10 rounded-full ${tones.bg} flex items-center justify-center ${tones.text} ${tones.hoverBg} transition-colors`}>
        {icon}
      </div>
      <span className="text-[9px] sm:text-[10px] font-bold text-[#133E35] text-center line-clamp-1">
        {label}
      </span>
    </button>
  );
}

