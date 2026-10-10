import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  FileText,
  Upload,
  Camera,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ShieldCheck,
  Loader2,
  RefreshCw,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Toaster, toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  getPublicRequestInfo,
  verifyCustomerId,
  getUploadState,
  uploadCustomerDocument,
} from "@/lib/documents.functions";

export const Route = createFileRoute("/documents/$token")({
  head: () => ({
    meta: [
      { title: "رفع المستندات المطلوبة — نظام خدمة العملاء" },
      { name: "description", content: "بوابة إلكترونية آمنة لرفع وتحديث المستندات للعملاء." },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
    ],
  }),
  component: DocumentsPage,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.split(",")[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function DocumentsPage() {
  const { token } = Route.useParams();

  const getInfoFn = useServerFn(getPublicRequestInfo);
  const verifyIdFn = useServerFn(verifyCustomerId);
  const getUploadStateFn = useServerFn(getUploadState);
  const uploadDocFn = useServerFn(uploadCustomerDocument);

  // Flow states
  const [initLoading, setInitLoading] = useState(true);
  const [linkStatus, setLinkStatus] = useState<"active" | "expired" | "cancelled" | "invalid">("active");
  const [maskedName, setMaskedName] = useState("");

  // Verification state
  const [nationalId, setNationalId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Upload screen state
  const [uploadState, setUploadState] = useState<{
    upload_status: string;
    items: Array<{
      id: string;
      label: string;
      is_required: boolean;
      status: string;
      rejection_reason?: string | null;
      file_name?: string | null;
    }>;
  } | null>(null);

  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [justUploadedItem, setJustUploadedItem] = useState<string | null>(null);

  // Hidden inputs for file / camera
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Session storage key
  const sessionKey = `doc_session_${token}`;

  // 1. Initial Load: Check Link Validity
  useEffect(() => {
    async function loadInfo() {
      setInitLoading(true);
      try {
        const res = await getInfoFn({ data: { token } });
        setLinkStatus(res.state);
        setMaskedName(res.maskedName || "");

        // Check if there is already an active session in sessionStorage
        const savedSession = sessionStorage.getItem(sessionKey);
        if (savedSession && res.state === "active") {
          try {
            const upState = await getUploadStateFn({
              data: { token, session: savedSession },
            });
            setSessionToken(savedSession);
            setUploadState(upState);
          } catch {
            sessionStorage.removeItem(sessionKey);
          }
        }
      } catch (err) {
        setLinkStatus("invalid");
      } finally {
        setInitLoading(false);
      }
    }
    void loadInfo();
  }, [token, getInfoFn, getUploadStateFn, sessionKey]);

  // Handle Identification Verification
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nationalId.trim()) {
      setVerifyError("يرجى إدخال رقم الهوية الوطنية أو الإقامة");
      return;
    }

    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await verifyIdFn({
        data: { token, nationalId: nationalId.trim() },
      });

      if (!res.ok) {
        if (res.state !== "active") {
          setLinkStatus(res.state as any);
        }
        setVerifyError(res.error || "تعذر التحقق من البيانات المدخلة");
        return;
      }

      // Success
      if (res.session) {
        sessionStorage.setItem(sessionKey, res.session);
        setSessionToken(res.session);

        const upState = await getUploadStateFn({
          data: { token, session: res.session },
        });
        setUploadState(upState);
        toast.success("تم التحقق بنجاح، مرحباً بك");
      }
    } catch (err: any) {
      setVerifyError("تعذر التحقق من البيانات المدخلة");
    } finally {
      setVerifying(false);
    }
  };

  // Handle Single File Upload
  const handleFileSelected = async (itemId: string, itemLabel: string, file: File) => {
    if (!sessionToken) return;

    // Check size limit (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الملف يتجاوز الحد الأقصى المسموح (10MB)");
      return;
    }

    // Check extensions
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "jpg", "jpeg", "png"].includes(ext)) {
      toast.error("صيغة الملف غير مدعومة. الصيغ المسموحة: PDF, JPG, PNG");
      return;
    }

    setUploadingItemId(itemId);
    setJustUploadedItem(null);

    try {
      const base64 = await fileToBase64(file);
      const res = await uploadDocFn({
        data: {
          token,
          session: sessionToken,
          itemId,
          fileName: file.name,
          base64,
        },
      });

      if (res.ok) {
        setJustUploadedItem(itemId);

        // Refresh upload state
        const refreshed = await getUploadStateFn({
          data: { token, session: sessionToken },
        });
        setUploadState(refreshed);

        // Check if all required items are uploaded
        const allReqDone = refreshed.items
          .filter((i) => i.is_required)
          .every((i) => i.status === "received" || i.status === "approved");

        if (allReqDone) {
          toast.success("تم استلام جميع المستندات المطلوبة بنجاح", {
            description: "شكرًا لك، تم استلام المستندات وإحالتها للمراجعة.",
          });
        } else {
          toast.success("تم رفع المستند بنجاح", {
            description:
              "تم حفظ المستند بنجاح. يمكنك استكمال رفع المستندات المتبقية الآن أو العودة لاحقًا خلال صلاحية الرابط.",
          });
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء رفع الملف، يرجى المحاولة مرة أخرى");
    } finally {
      setUploadingItemId(null);
    }
  };

  // Loading Screen
  if (initLoading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center p-4"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="size-12 rounded-full border-4 border-emerald-600/30 border-t-emerald-600 animate-spin" />
          <span className="text-xs font-semibold text-[#133E35]">جارٍ التحقق من الرابط...</span>
        </div>
      </div>
    );
  }

  // Link Expired Screen
  if (linkStatus === "expired") {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center p-4"
      >
        <Card className="max-w-md w-full p-6 text-center space-y-4 rounded-3xl border border-amber-200 shadow-md bg-white">
          <div className="size-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock className="size-7" />
          </div>
          <h2 className="text-base font-bold text-[#133E35]">صلاحية الرابط منتهية</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            انتهت صلاحية رابط رفع المستندات. يرجى التواصل مع المسؤول عن طلبك للحصول على رابط جديد.
          </p>
        </Card>
      </div>
    );
  }

  // Link Cancelled Screen
  if (linkStatus === "cancelled" || linkStatus === "invalid") {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center p-4"
      >
        <Card className="max-w-md w-full p-6 text-center space-y-4 rounded-3xl border border-red-200 shadow-md bg-white">
          <div className="size-14 mx-auto rounded-full bg-red-50 flex items-center justify-center text-red-600">
            <XCircle className="size-7" />
          </div>
          <h2 className="text-base font-bold text-[#133E35]">الرابط غير متاح</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            هذا الرابط لم يعد متاحًا.
          </p>
        </Card>
      </div>
    );
  }

  // Stage 1: ID Verification Screen
  if (!sessionToken || !uploadState) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#F7F9F8] flex flex-col justify-between py-6 px-4 font-sans selection:bg-emerald-100"
      >
        <Toaster position="top-center" richColors />

        {/* Top Header */}
        <div className="max-w-md w-full mx-auto space-y-4">
          <div className="text-center space-y-1.5 pt-4">
            <div className="size-12 mx-auto rounded-2xl bg-emerald-100/70 border border-emerald-300 flex items-center justify-center text-emerald-800 shadow-sm">
              <ShieldCheck className="size-6" />
            </div>
            <h1 className="text-lg font-extrabold text-[#133E35]">التحقق من بيانات العميل</h1>
            <p className="text-xs text-muted-foreground leading-relaxed px-4">
              يرجى التحقق من بياناتك للوصول إلى المستندات المطلوبة واستكمال طلبك.
            </p>
          </div>

          {/* Form Card */}
          <Card className="p-5 sm:p-6 bg-white border border-[#ececec] rounded-3xl shadow-sm space-y-4">
            {/* Masked Customer Name */}
            {maskedName && (
              <div className="bg-[#f8faf9] p-3 rounded-2xl border border-emerald-100/80 text-xs">
                <span className="text-[11px] text-muted-foreground block mb-0.5">اسم العميل:</span>
                <span className="text-xs font-bold text-[#133E35]">{maskedName}</span>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block text-right">
                  رقم الهوية الوطنية أو الإقامة
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={nationalId}
                  onChange={(e) => {
                    setNationalId(e.target.value);
                    if (verifyError) setVerifyError(null);
                  }}
                  placeholder="10XXXXXXXX"
                  className="h-11 text-center font-mono text-sm tracking-wider rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  يرجى إدخال رقم الهوية أو الإقامة للتحقق من بياناتك.
                </p>
              </div>

              {verifyError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{verifyError}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={verifying || !nationalId.trim()}
                className="w-full h-11 bg-[#133E35] hover:bg-[#1a5146] text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    جارٍ التحقق...
                  </>
                ) : (
                  "تحقق ومتابعة"
                )}
              </Button>
            </form>
          </Card>
        </div>

        {/* Footer Security Notice */}
        <div className="text-center text-[10px] text-muted-foreground py-4">
          نظام رفع المستندات الآمن • اتصال مشفر بالكامل
        </div>
      </div>
    );
  }

  // Stage 2: Mobile-First Document Upload Screen
  const items = uploadState.items || [];
  const totalCount = items.length;
  const receivedCount = items.filter(
    (i) => i.status === "received" || i.status === "approved",
  ).length;
  const allRequiredDone = items
    .filter((i) => i.is_required)
    .every((i) => i.status === "received" || i.status === "approved");

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#F7F9F8] flex flex-col justify-between py-5 px-3.5 sm:px-4 font-sans selection:bg-emerald-100"
    >
      <Toaster position="top-center" richColors />

      <div className="max-w-md w-full mx-auto space-y-4">
        {/* Header */}
        <div className="text-center space-y-1.5 pt-2">
          <div className="size-11 mx-auto rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 shadow-sm">
            <FileText className="size-5" />
          </div>
          <h1 className="text-base sm:text-lg font-extrabold text-[#133E35]">
            رفع المستندات المطلوبة
          </h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed px-2">
            يرجى إرفاق المستندات المحددة لاستكمال دراسة طلبك. يمكنك رفع المستندات الآن أو استكمال
            المتبقي لاحقًا خلال صلاحية الرابط.
          </p>
        </div>

        {/* Counter & Progress Banner */}
        <div className="bg-white border border-[#ececec] rounded-2xl p-3 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#133E35] flex items-center gap-1.5">
              <FileCheck2 className="size-4 text-emerald-600" />
              حالة اكتمال الرفع:
            </span>
            <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px]">
              {receivedCount} من {totalCount} مستلمة
            </span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-600 h-2 transition-all duration-500 rounded-full"
              style={{
                width: `${totalCount > 0 ? (receivedCount / totalCount) * 100 : 0}%`,
              }}
            />
          </div>

          {allRequiredDone && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-right space-y-0.5">
              <span className="text-xs font-bold text-emerald-900 block flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                تم استلام جميع المستندات المطلوبة بنجاح
              </span>
              <span className="text-[11px] text-emerald-800 block">
                شكرًا لك، تم استلام المستندات وإحالتها للمراجعة.
              </span>
            </div>
          )}
        </div>

        {/* Document Cards */}
        <div className="space-y-3">
          {items.map((item, idx) => {
            const isReceived = item.status === "received" || item.status === "approved";
            const isApproved = item.status === "approved";
            const isRejected = item.status === "rejected";
            const isUploading = uploadingItemId === item.id;

            return (
              <Card
                key={item.id}
                className={`p-4 rounded-2xl border transition-all shadow-xs ${
                  isApproved
                    ? "bg-emerald-50/30 border-emerald-300"
                    : isReceived
                      ? "bg-blue-50/20 border-blue-200"
                      : isRejected
                        ? "bg-red-50/30 border-red-200"
                        : "bg-white border-[#ececec]"
                }`}
              >
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={(el) => (fileInputRefs.current[item.id] = el)}
                  accept="application/pdf,image/jpeg,image/png,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFileSelected(item.id, item.label, f);
                    e.target.value = "";
                  }}
                />

                {/* Hidden Camera Input */}
                <input
                  type="file"
                  ref={(el) => (cameraInputRefs.current[item.id] = el)}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFileSelected(item.id, item.label, f);
                    e.target.value = "";
                  }}
                />

                <div className="space-y-3">
                  {/* Title & Requirement Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="size-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">{item.label}</h3>
                    </div>

                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                        item.is_required
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {item.is_required ? "إلزامي" : "اختياري"}
                    </span>
                  </div>

                  {/* Status & Details */}
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      {isApproved && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                          تم الاعتماد
                        </span>
                      )}
                      {!isApproved && isReceived && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700">
                          <Clock className="size-3.5 text-blue-600" />
                          تم الاستلام
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700">
                          <XCircle className="size-3.5 text-red-600" />
                          مرفوض – مطلوب إعادة الرفع
                        </span>
                      )}
                      {!isReceived && !isRejected && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          بانتظار الرفع
                        </span>
                      )}
                    </div>

                    {item.file_name && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                        {item.file_name}
                      </span>
                    )}
                  </div>

                  {/* Rejection Reason Notice */}
                  {isRejected && item.rejection_reason && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-right">
                      <span className="text-[11px] font-bold text-red-800 block">سبب الرفض:</span>
                      <span className="text-[10px] text-red-700 block">
                        {item.rejection_reason}
                      </span>
                    </div>
                  )}

                  {/* Upload Action Buttons */}
                  {!isApproved && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploading}
                        onClick={() => fileInputRefs.current[item.id]?.click()}
                        className="h-10 text-xs rounded-xl border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 flex items-center justify-center gap-1.5 font-bold cursor-pointer"
                      >
                        {isUploading ? (
                          <Loader2 className="size-3.5 animate-spin text-emerald-600" />
                        ) : (
                          <Upload className="size-3.5 text-emerald-700" />
                        )}
                        {isReceived ? "استبدال الملف" : "اختيار ملف"}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploading}
                        onClick={() => cameraInputRefs.current[item.id]?.click()}
                        className="h-10 text-xs rounded-xl border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 flex items-center justify-center gap-1.5 font-bold cursor-pointer"
                      >
                        <Camera className="size-3.5 text-emerald-700" />
                        التقاط صورة
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Supported formats guidance */}
        <div className="p-3 bg-slate-100/70 rounded-2xl text-center text-[10px] text-slate-500 space-y-1">
          <p>الصيغ المدعومة: PDF / JPG / JPEG / PNG • الحد الأقصى للملف: 10MB</p>
          <p>يتم حفظ كل مستند تلقائياً فور رفعه بنجاح</p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-muted-foreground pt-4 pb-2">
        نظام التحصيل الذكي • جميع الحقوق محفوظة
      </div>
    </div>
  );
}
