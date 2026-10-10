import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Plus,
  Trash2,
  Copy,
  Share2,
  Clock,
  RefreshCw,
  XCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  BASE_DOCUMENTS,
  createDocumentRequest,
  listDocumentLibrary,
  manageDocumentRequest,
} from "@/lib/documents.functions";
import type { Customer } from "@/lib/wallet-types";

interface DocumentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  employeeId: string;
  collectorName?: string;
  onSuccess?: () => void;
}

interface DocSelection {
  label: string;
  selected: boolean;
  isRequired: boolean;
  isCustom?: boolean;
  saveToLibrary?: boolean;
}

export function DocumentRequestDialog({
  open,
  onOpenChange,
  customer,
  employeeId,
  collectorName,
  onSuccess,
}: DocumentRequestDialogProps) {
  const createFn = useServerFn(createDocumentRequest);
  const listLibraryFn = useServerFn(listDocumentLibrary);
  const manageFn = useServerFn(manageDocumentRequest);

  const [docs, setDocs] = useState<DocSelection[]>([]);
  const [newDocLabel, setNewDocLabel] = useState("");
  const [saveToLib, setSaveToLib] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [hours, setHours] = useState<number>(72);
  const [submitting, setSubmitting] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState<string[]>([]);

  // Generated Link state
  const [issuedResult, setIssuedResult] = useState<{
    id: string;
    token: string;
    expiresAt: Date;
    url: string;
  } | null>(null);

  // Initialize documents list when dialog opens
  useEffect(() => {
    if (open) {
      setIssuedResult(null);
      setShowAddInput(false);
      setNewDocLabel("");
      setHours(72);

      // Load base docs (unselected by default as per rule 3)
      const initial: DocSelection[] = BASE_DOCUMENTS.map((label) => ({
        label,
        selected: false,
        isRequired: true,
      }));
      setDocs(initial);

      // Fetch general library
      void listLibraryFn({ data: { actor: { employeeId, name: collectorName } } })
        .then((items) => {
          if (items && items.length) {
            setLibraryDocs(items.map((i) => i.label));
          }
        })
        .catch(() => {});
    }
  }, [open, employeeId, collectorName]);

  const toggleSelect = (index: number) => {
    setDocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, selected: !d.selected } : d)),
    );
  };

  const toggleRequired = (index: number) => {
    setDocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, isRequired: !d.isRequired } : d)),
    );
  };

  const handleAddCustom = () => {
    const trimmed = newDocLabel.trim();
    if (!trimmed) return;
    if (docs.some((d) => d.label.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("هذا المستند موجود بالفعل في القائمة");
      return;
    }
    setDocs((prev) => [
      ...prev,
      {
        label: trimmed,
        selected: true,
        isRequired: true,
        isCustom: true,
        saveToLibrary: saveToLib,
      },
    ]);
    setNewDocLabel("");
    setSaveToLib(false);
    setShowAddInput(false);
    toast.success("تمت إضافة المستند للقائمة");
  };

  const handleAddFromLibrary = (label: string) => {
    if (docs.some((d) => d.label === label)) {
      toast.error("المستند مضاف بالفعل");
      return;
    }
    setDocs((prev) => [
      ...prev,
      {
        label,
        selected: true,
        isRequired: true,
        isCustom: true,
      },
    ]);
  };

  const handleRemoveDoc = (index: number) => {
    setDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const selectedCount = docs.filter((d) => d.selected).length;

  const handleIssueLink = async () => {
    const selected = docs.filter((d) => d.selected);
    if (selected.length === 0) {
      toast.error("يرجى اختيار مستند واحد على الأقل لإصدار الرابط");
      return;
    }
    const customerKey = String(customer.customer_key || customer["رقم الحساب"] || customer.id || "");
    if (!customerKey) {
      toast.error("معرف العميل غير متوفر");
      return;
    }

    setSubmitting(true);
    try {
      const saveList = docs.filter((d) => d.saveToLibrary && d.label).map((d) => d.label);

      const res = await createFn({
        data: {
          actor: { employeeId, name: collectorName },
          customerKey,
          items: selected.map((d) => ({
            label: d.label,
            is_required: d.isRequired,
          })),
          hours: Number(hours) || 72,
          saveToLibrary: saveList.length ? saveList : undefined,
        },
      });

      const url = `${window.location.origin}/documents/${res.token}`;
      setIssuedResult({
        id: res.id,
        token: res.token,
        expiresAt: new Date(Date.now() + (Number(hours) || 72) * 3600 * 1000),
        url,
      });

      toast.success("تم إصدار رابط طلب المستندات بنجاح");
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "تعذر إصدار الرابط، يرجى المحاولة مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!issuedResult) return;
    navigator.clipboard.writeText(issuedResult.url);
    toast.success("تم نسخ الرابط بنجاح");
  };

  const handleShareWhatsApp = () => {
    if (!issuedResult) return;
    // Strict compliance rule: Do NOT put customer name or national id in whatsapp text
    const text = `السلام عليكم ورحمة الله،\nيرجى تزويدنا بالمستندات المطلوبة لاستكمال دراسة طلبكم عبر الرابط الآمن التالي:\n${issuedResult.url}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  };

  const handleCancelLink = async () => {
    if (!issuedResult) return;
    try {
      await manageFn({
        data: {
          actor: { employeeId, name: collectorName },
          requestId: issuedResult.id,
          action: "cancel",
        },
      });
      toast.success("تم إلغاء الرابط بنجاح");
      setIssuedResult(null);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "تعذر إلغاء الرابط");
    }
  };

  const handleRenewLink = async () => {
    if (!issuedResult) return;
    try {
      await manageFn({
        data: {
          actor: { employeeId, name: collectorName },
          requestId: issuedResult.id,
          action: "renew",
          hours: 72,
        },
      });
      setIssuedResult((prev) =>
        prev
          ? {
              ...prev,
              expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
            }
          : null,
      );
      toast.success("تم تجديد صلاحية الرابط لمدة 72 ساعة");
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "تعذر تجديد الرابط");
    }
  };

  const customerName = customer["اسم العميل"] || customer.name || "—";
  const accountNumber = customer["رقم الحساب"] || customer.account_number || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-lg max-h-[90vh] overflow-y-auto bg-white p-5 sm:p-6 rounded-2xl shadow-xl border border-[#ececec]"
      >
        <DialogHeader className="text-right pb-2 border-b border-[#ececec]">
          <DialogTitle className="text-lg font-bold text-[#133E35] flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            إصدار رابط طلب المستندات
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            تحديد المستندات المطلوبة وإصدار رابط آمن خاص بالعميل لمشاركتها عبر واتساب
          </DialogDescription>
        </DialogHeader>

        {/* Customer Info (internal reference for collector only) */}
        <div className="bg-[#f8faf9] border border-emerald-100/60 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <span className="text-muted-foreground block text-[11px]">اسم العميل:</span>
            <span className="font-bold text-[#133E35]">{customerName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">رقم الحساب:</span>
            <span className="font-mono font-semibold text-slate-700">{accountNumber}</span>
          </div>
        </div>

        {/* If Link has been issued */}
        {issuedResult ? (
          <div className="space-y-4 py-2 animate-in fade-in duration-300">
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  تم إنشاء الرابط بنجاح
                </span>
                <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                  نشط
                </Badge>
              </div>

              <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-emerald-200 text-xs font-mono text-slate-700 break-all select-all">
                <span className="flex-1 text-[11px]">{issuedResult.url}</span>
              </div>

              <div className="text-[11px] text-emerald-900/80 flex items-center justify-between pt-1">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  ينتهي في: {issuedResult.expiresAt.toLocaleDateString("ar-SA")}{" "}
                  {issuedResult.expiresAt.toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>المدة: {hours} ساعة</span>
              </div>
            </div>

            {/* Link Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={handleCopyLink}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-9 rounded-xl flex items-center gap-1.5 font-bold"
              >
                <Copy className="size-3.5" />
                نسخ الرابط
              </Button>
              <Button
                type="button"
                onClick={handleShareWhatsApp}
                className="bg-[#25D366] hover:bg-[#20ba59] text-white text-xs h-9 rounded-xl flex items-center gap-1.5 font-bold"
              >
                <Share2 className="size-3.5" />
                مشاركة عبر واتساب
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#ececec]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRenewLink}
                className="text-[11px] h-8 text-blue-700 border-blue-200 hover:bg-blue-50"
              >
                <RefreshCw className="size-3 ml-1" />
                تجديد الصلاحية
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelLink}
                className="text-[11px] h-8 text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="size-3 ml-1" />
                إلغاء الرابط
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIssuedResult(null)}
                className="text-[11px] h-8 text-muted-foreground hover:bg-slate-100"
              >
                إصدار طلب جديد
              </Button>
            </div>
          </div>
        ) : (
          /* Selection & Configuration Screen */
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#133E35]">
                اختر المستندات المطلوبة ({selectedCount} محددة):
              </span>
              <span className="text-[10px] text-muted-foreground">
                * يجب اختيار مستند واحد على الأقل
              </span>
            </div>

            {/* Document Checklist */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto p-1 pr-1.5">
              {docs.map((doc, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all text-xs ${
                    doc.selected
                      ? "bg-emerald-50/40 border-emerald-300 shadow-sm"
                      : "bg-[#FEFFFE] border-[#ececec] hover:border-slate-300"
                  }`}
                >
                  <label
                    className="flex items-center gap-2 flex-1 cursor-pointer select-none"
                    onClick={() => toggleSelect(idx)}
                  >
                    <Checkbox
                      checked={doc.selected}
                      onCheckedChange={() => toggleSelect(idx)}
                      className="size-4 data-[state=checked]:bg-emerald-600"
                    />
                    <span
                      className={`text-xs ${
                        doc.selected ? "font-bold text-[#133E35]" : "text-slate-700"
                      }`}
                    >
                      {doc.label}
                    </span>
                  </label>

                  {/* Required / Optional Toggle & Custom Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {doc.selected && (
                      <button
                        type="button"
                        onClick={() => toggleRequired(idx)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${
                          doc.isRequired
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-slate-100 text-slate-600 border border-slate-300"
                        }`}
                      >
                        {doc.isRequired ? "إلزامي" : "اختياري"}
                      </button>
                    )}

                    {doc.isCustom && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDoc(idx)}
                        className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                        title="حذف المستند"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Custom Document */}
            {showAddInput ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-slate-800 block text-xs">إضافة مستند مخصص:</span>
                <Input
                  value={newDocLabel}
                  onChange={(e) => setNewDocLabel(e.target.value)}
                  placeholder="مثال: إفادة من جهة العمل، صك ملكية..."
                  className="text-xs bg-white text-right h-8"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddCustom();
                  }}
                />
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600">
                    <Checkbox
                      checked={saveToLib}
                      onCheckedChange={(c) => setSaveToLib(Boolean(c))}
                      className="size-3.5"
                    />
                    حفظ في مكتبة المستندات العامة لاستخدامه مستقبلاً
                  </label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAddInput(false)}
                      className="h-7 text-xs text-muted-foreground"
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddCustom}
                      className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
                    >
                      إضافة
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddInput(true)}
                  className="text-xs h-8 text-emerald-700 border-emerald-300 hover:bg-emerald-50 rounded-xl flex items-center gap-1 font-bold"
                >
                  <Plus className="size-3.5" />
                  إضافة مستند آخر
                </Button>

                {/* Library Quick Add if available */}
                {libraryDocs.length > 0 && (
                  <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                      <BookOpen className="size-3 text-slate-400" />
                      المكتبة:
                    </span>
                    {libraryDocs.slice(0, 3).map((lib, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleAddFromLibrary(lib)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[10px] shrink-0"
                      >
                        + {lib}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Expiration Hours Setting */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock className="size-3.5 text-slate-500" />
                مدة صلاحية الرابط:
              </span>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={hours}
                  onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 h-7 text-center font-bold text-xs bg-white"
                />
                <span className="text-slate-600 text-xs">ساعة (افتراضي 72)</span>
              </div>
            </div>

            {/* Issue Button */}
            <div className="pt-2 border-t border-[#ececec]">
              <Button
                type="button"
                onClick={handleIssueLink}
                disabled={selectedCount === 0 || submitting}
                className="w-full bg-[#133E35] hover:bg-[#1a5146] text-white font-bold text-xs h-10 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                إصدار رابط المستندات ({selectedCount})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
