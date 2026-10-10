import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Download,
  Check,
  X,
  RefreshCw,
  Plus,
  Copy,
  ChevronDown,
  ChevronUp,
  History,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  listCustomerDocumentRequests,
  reviewDocumentItem,
  getDocumentSignedUrl,
  manageDocumentRequest,
} from "@/lib/documents.functions";
import type { Customer } from "@/lib/wallet-types";

interface CustomerDocumentsSectionProps {
  customer: Customer;
  employeeId: string;
  collectorName?: string;
  onRequestNew: () => void;
}

export function CustomerDocumentsSection({
  customer,
  employeeId,
  collectorName,
  onRequestNew,
}: CustomerDocumentsSectionProps) {
  const listRequestsFn = useServerFn(listCustomerDocumentRequests);
  const reviewFn = useServerFn(reviewDocumentItem);
  const getUrlFn = useServerFn(getDocumentSignedUrl);
  const manageFn = useServerFn(manageDocumentRequest);

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Reject dialog state
  const [rejectItem, setRejectItem] = useState<{ id: string; label: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Preview dialog
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const customerKey = String(customer.customer_key || customer["رقم الحساب"] || customer.id || "");

  const loadRequests = useCallback(async () => {
    if (!customerKey) return;
    setLoading(true);
    try {
      const res = await listRequestsFn({
        data: {
          actor: { employeeId, name: collectorName },
          customerKey,
        },
      });
      setRequests(res || []);
    } catch (err: any) {
      console.warn("Error loading document requests:", err);
    } finally {
      setLoading(false);
    }
  }, [customerKey, employeeId, collectorName, listRequestsFn]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  // Active / most recent request
  const currentRequest = requests.length > 0 ? requests[0] : null;
  const previousRequests = requests.length > 1 ? requests.slice(1) : [];

  const handleApprove = async (itemId: string, itemLabel: string) => {
    try {
      await reviewFn({
        data: {
          actor: { employeeId, name: collectorName },
          itemId,
          decision: "approve",
        },
      });
      toast.success(`تم اعتماد المستند: ${itemLabel}`);
      void loadRequests();
    } catch (err: any) {
      toast.error(err?.message || "تعذر اعتماد المستند");
    }
  };

  const handleOpenReject = (item: { id: string; label: string }) => {
    setRejectItem(item);
    setRejectReason("المستند غير واضح، يرجى إعادة رفع نسخة حديثة ومقروءة.");
  };

  const handleConfirmReject = async () => {
    if (!rejectItem) return;
    setRejecting(true);
    try {
      await reviewFn({
        data: {
          actor: { employeeId, name: collectorName },
          itemId: rejectItem.id,
          decision: "reject",
          reason: rejectReason.trim(),
        },
      });
      toast.success("تم تسجيل رفض المستند وطلب إعادة الرفع من العميل");
      setRejectItem(null);
      void loadRequests();
    } catch (err: any) {
      toast.error(err?.message || "تعذر رفض المستند");
    } finally {
      setRejecting(false);
    }
  };

  const handleViewOrDownload = async (docId: string, label: string, isDownload = false) => {
    try {
      const res = await getUrlFn({
        data: {
          actor: { employeeId, name: collectorName },
          documentId: docId,
        },
      });
      if (res?.url) {
        if (isDownload) {
          const a = document.createElement("a");
          a.href = res.url;
          a.download = label;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          setPreviewTitle(label);
          setPreviewUrl(res.url);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "تعذر فتح المستند");
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await manageFn({
        data: {
          actor: { employeeId, name: collectorName },
          requestId,
          action: "cancel",
        },
      });
      toast.success("تم إلغاء الرابط");
      void loadRequests();
    } catch (err: any) {
      toast.error(err?.message || "تعذر إلغاء الرابط");
    }
  };

  const handleRenewRequest = async (requestId: string) => {
    try {
      await manageFn({
        data: {
          actor: { employeeId, name: collectorName },
          requestId,
          action: "renew",
          hours: 72,
        },
      });
      toast.success("تم تجديد الصلاحية 72 ساعة إضافية");
      void loadRequests();
    } catch (err: any) {
      toast.error(err?.message || "تعذر التجديد");
    }
  };

  // If no requests at all
  if (!loading && !currentRequest) {
    return (
      <div className="p-4 bg-emerald-50/40 border border-emerald-200/70 rounded-2xl space-y-3 text-right">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
              <FileText className="size-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#133E35]">المستندات المطلوبة والمرفقة</h4>
              <p className="text-[11px] text-muted-foreground">
                لم يتم إصدار رابط طلب مستندات لهذا العميل حتى الآن
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onRequestNew}
            className="bg-[#133E35] hover:bg-[#1a5146] text-white text-xs h-8 rounded-xl font-bold gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="size-3.5" />
            طلب مستندات
          </Button>
        </div>
      </div>
    );
  }

  // Calculate statistics for current request
  const items = currentRequest?.items || [];
  const totalCount = items.length;
  const receivedCount = items.filter(
    (i: any) => i.status === "received" || i.status === "approved",
  ).length;
  const remainingCount = totalCount - receivedCount;
  const completionPct = totalCount > 0 ? Math.round((receivedCount / totalCount) * 100) : 0;

  const lastActivityDate = currentRequest?.last_activity_at
    ? new Date(currentRequest.last_activity_at).toLocaleDateString("ar-SA")
    : "—";

  const getStatusBadge = (status: string, uploadStatus: string) => {
    if (status === "cancelled") {
      return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">ملغى</Badge>;
    }
    if (status === "expired") {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">منتهي</Badge>
      );
    }
    if (uploadStatus === "approved") {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
          معتمد بالكامل
        </Badge>
      );
    }
    if (uploadStatus === "complete") {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
          مكتمل الرفع – بانتظار المراجعة
        </Badge>
      );
    }
    if (uploadStatus === "partial") {
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
          رفع جزئي ({receivedCount}/{totalCount})
        </Badge>
      );
    }
    return (
      <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">
        بانتظار الرفع
      </Badge>
    );
  };

  const getItemStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="size-3" /> مقبول
          </span>
        );
      case "received":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            <Clock className="size-3" /> تم الاستلام
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
            <XCircle className="size-3" /> مرفوض
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
            بانتظار الرفع
          </span>
        );
    }
  };

  return (
    <div className="space-y-3 pt-3 border-t border-[#ececec]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-4.5 text-[#133E35]" />
          <h4 className="text-xs font-bold text-[#133E35]">المستندات المطلوبة والمرفقة</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadRequests}
            disabled={loading}
            className="h-7 text-[11px] px-2 text-slate-600 rounded-lg"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onRequestNew}
            className="bg-[#133E35] hover:bg-[#1a5146] text-white text-[11px] h-7 px-2.5 rounded-lg font-bold gap-1 cursor-pointer"
          >
            <Plus className="size-3" />
            طلب جديد
          </Button>
        </div>
      </div>

      {currentRequest && (
        <div className="bg-white border border-[#ececec] rounded-2xl p-3.5 shadow-sm space-y-3">
          {/* Summary Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#ececec]">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-700">
                طلب رقم #{currentRequest.ref_no || currentRequest.id.slice(0, 8)}
              </span>
              {getStatusBadge(currentRequest.status, currentRequest.upload_status)}
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              {currentRequest.status === "active" && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRenewRequest(currentRequest.id)}
                    className="h-6 text-[10px] text-blue-700 hover:bg-blue-50 px-2"
                  >
                    تجديد (+72h)
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelRequest(currentRequest.id)}
                    className="h-6 text-[10px] text-red-600 hover:bg-red-50 px-2"
                  >
                    إلغاء
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-[#f8faf9] p-2 rounded-xl border border-slate-100">
              <span className="text-[10px] text-muted-foreground block">المطلوب</span>
              <span className="font-bold text-[#133E35] text-sm tabular-nums">{totalCount}</span>
            </div>
            <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
              <span className="text-[10px] text-emerald-700 block">المستلم</span>
              <span className="font-bold text-emerald-800 text-sm tabular-nums">
                {receivedCount}
              </span>
            </div>
            <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100">
              <span className="text-[10px] text-amber-700 block">المتبقي</span>
              <span className="font-bold text-amber-800 text-sm tabular-nums">
                {remainingCount}
              </span>
            </div>
            <div className="bg-blue-50/60 p-2 rounded-xl border border-blue-100">
              <span className="text-[10px] text-blue-700 block">نسبة الإنجاز</span>
              <span className="font-bold text-blue-800 text-sm tabular-nums">
                {completionPct}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 transition-all duration-500 rounded-full"
              style={{ width: `${completionPct}%` }}
            />
          </div>

          {/* Document Items List */}
          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-bold text-slate-700 block">تفاصيل المستندات:</span>
            <div className="space-y-1.5">
              {items.map((item: any) => {
                const doc = item.document;
                const isReceived = item.status === "received" || item.status === "approved";
                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl border border-[#ececec] bg-[#FEFFFE] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-800">{item.label}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                            item.is_required
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-slate-50 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {item.is_required ? "إلزامي" : "اختياري"}
                        </span>
                        {getItemStatusBadge(item.status)}
                      </div>

                      {doc?.file_name && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          الملف: {doc.file_name} • {(doc.size_bytes / 1024).toFixed(0)} KB
                        </p>
                      )}

                      {item.rejection_reason && (
                        <p className="text-[10px] text-red-600 font-medium mt-1 bg-red-50 p-1 rounded border border-red-100">
                          سبب الرفض: {item.rejection_reason}
                        </p>
                      )}
                    </div>

                    {/* Action buttons for received docs: عرض | تحميل | قبول | رفض */}
                    {isReceived && doc && (
                      <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewOrDownload(doc.id, item.label, false)}
                          className="h-7 text-[10px] text-blue-700 hover:bg-blue-50 px-2 rounded-lg gap-1"
                        >
                          <Eye className="size-3" />
                          عرض
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewOrDownload(doc.id, item.label, true)}
                          className="h-7 text-[10px] text-slate-700 hover:bg-slate-100 px-2 rounded-lg gap-1"
                        >
                          <Download className="size-3" />
                          تحميل
                        </Button>

                        {item.status !== "approved" && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleApprove(item.id, item.label)}
                              className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 rounded-lg gap-1 font-bold"
                            >
                              <Check className="size-3" />
                              قبول
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenReject({ id: item.id, label: item.label })}
                              className="h-7 text-[10px] text-red-600 border-red-200 hover:bg-red-50 px-2 rounded-lg gap-1"
                            >
                              <X className="size-3" />
                              رفض
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground flex items-center justify-between pt-1 border-t border-[#ececec]">
            <span>آخر نشاط: {lastActivityDate}</span>
            <span>بواسطة: {currentRequest.collector_name || currentRequest.collector_employee_id}</span>
          </div>
        </div>
      )}

      {/* Previous Requests Accordion */}
      {previousRequests.length > 0 && (
        <div className="border border-[#ececec] rounded-xl overflow-hidden bg-slate-50/50">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="w-full p-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-100/70 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <History className="size-3.5 text-slate-500" />
              سجل الطلبات السابقة ({previousRequests.length})
            </span>
            {showHistory ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>

          {showHistory && (
            <div className="p-2.5 pt-0 space-y-2 border-t border-[#ececec]">
              {previousRequests.map((r: any) => (
                <div
                  key={r.id}
                  className="bg-white p-2.5 rounded-lg border border-[#ececec] text-xs flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-slate-700 block text-[11px]">
                      طلب #{r.ref_no || r.id.slice(0, 8)} •{" "}
                      {new Date(r.created_at).toLocaleDateString("ar-SA")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      المستندات: {r.items?.length || 0} • المنشئ: {r.collector_name || r.collector_employee_id}
                    </span>
                  </div>
                  <div>{getStatusBadge(r.status, r.upload_status)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reject Reason Dialog */}
      <Dialog open={!!rejectItem} onOpenChange={(o) => !o && setRejectItem(null)}>
        <DialogContent dir="rtl" className="max-w-sm bg-white p-5 rounded-2xl border shadow-xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-sm font-bold text-red-600">
              رفض مستند: {rejectItem?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-xs">
            <label className="text-xs font-semibold text-slate-700 block">
              سبب الرفض (سيظهر للعميل في الرابط لإعادة الرفع):
            </label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="اكتب سبب الرفض هنا..."
              rows={3}
              className="text-xs bg-slate-50"
            />
          </div>
          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRejectItem(null)}
              className="text-xs"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={rejecting || !rejectReason.trim()}
              onClick={handleConfirmReject}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
            >
              {rejecting ? "جارٍ الحفظ..." : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent
          dir="rtl"
          className="max-w-3xl max-h-[85vh] bg-white p-4 rounded-2xl flex flex-col border shadow-2xl"
        >
          <DialogHeader className="text-right pb-2 border-b">
            <DialogTitle className="text-sm font-bold text-[#133E35]">
              معاينة: {previewTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-[400px] overflow-auto flex items-center justify-center p-2 bg-slate-50 rounded-xl">
            {previewUrl && (
              previewUrl.startsWith("data:image/") ||
              previewUrl.endsWith(".jpg") ||
              previewUrl.endsWith(".jpeg") ||
              previewUrl.endsWith(".png") ? (
                <img
                  src={previewUrl}
                  alt={previewTitle}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-sm"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title={previewTitle}
                  className="w-full h-[70vh] rounded-lg border bg-white"
                />
              )
            )}
          </div>
          <DialogFooter className="pt-2 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewUrl(null)}
              className="text-xs"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
