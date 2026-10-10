# نظام «طلب المستندات» داخل ملف العميل

## ما سيتم إضافته (دون تغيير أي تصميم أو وظيفة قائمة)

1. **زر «طلب مستندات»** بجانب أزرار الإجراءات في ملف العميل، بنفس الحجم والألوان.
2. **نافذة «إصدار رابط طلب المستندات»**:
   - اسم العميل ورقم الحساب (للمحصل فقط).
   - المستندات الثمانية الأساسية بمربعات اختيار، غير محددة افتراضيًا، مع خيار إلزامي/اختياري لكل مستند.
   - «+ إضافة مستند آخر» مع تعديل وحذف قبل الإصدار، وخيار حفظه في مكتبة عامة (لا يؤثر على الطلبات السابقة).
   - مدة صلاحية افتراضية 72 ساعة قابلة للتعديل، ومنع الإصدار بدون مستند واحد على الأقل.
   - بعد الإصدار: نسخ الرابط، مشاركة عبر واتساب، تاريخ الإصدار والانتهاء، الحالة (نشط / منتهي / ملغى / مكتمل)، إلغاء، تجديد، إعادة إصدار (يُبطل السابق).
   - طلب نشط واحد فقط لكل عميل لمنع التكرار.
3. **قسم «المستندات المطلوبة والمرفقة»** داخل ملف العميل:
   - المطلوب / المستلم / المتبقي ونسبة الاكتمال.
   - حالة كل مستند: بانتظار الرفع، تم الاستلام، معتمد، مرفوض – مطلوب إعادة الرفع.
   - عرض/تنزيل الملف عبر رابط مؤقت، اعتماد أو رفض مع سبب.
   - سجل الطلبات السابقة وإضافة مستندات لطلب قائم.
   - تحديث فوري عند رفع العميل أي مستند.
4. **إشعار في لوحة تحكم المحصل** عند استلام مستند (اسم العميل، رقم الحساب، المستند، التاريخ) يفتح ملف العميل عند الضغط.
5. **صفحة العميل العامة** `/documents/<رمز>` مصممة للجوال أولًا:
   - بدون أي قوائم أو روابط إدارية.
   - «التحقق من بيانات العميل» مع اسم مخفي جزئيًا (ماجد ع**** السفياني) وحقل رقم الهوية/الإقامة.
   - تحقق من الخادم، رسالة عامة عند الخطأ، وحد لعدد المحاولات (مثلًا 5 محاولات ثم قفل مؤقت 30 دقيقة).
   - بعد التحقق: بطاقة لكل مستند مطلوب فقط، اختيار ملف أو التقاط صورة، PDF/JPG/PNG حتى 10MB، استبدال الملف قبل الاعتماد.
   - حفظ فوري لكل مستند على حدة، عداد «1 من 3»، ويمكن الرجوع لاحقًا خلال الصلاحية.
   - عند اكتمال الإلزامي: «مكتمل الرفع – بانتظار المراجعة».
   - رسائل الانتهاء والإلغاء والنجاح كما وردت حرفيًا في الطلب.
   - لا تظهر المديونية أو تفاصيل الحساب إطلاقًا.

## تنبيه مهم قبل التشغيل الفعلي

- **دخول المحصلين حاليًا يعتمد على الرقم الوظيفي فقط** دون كلمة مرور حقيقية. سأبني الميزة بحيث تتم كل العمليات من الخادم، لكن حماية جهة المحصل ستبقى بنفس مستوى الدخول الحالي. لحماية فعلية للمستندات الحساسة يلزم لاحقًا تفعيل دخول حقيقي (بريد/كلمة مرور) للمحصلين.
- التحقق برقم الهوية + الرابط ليس إثبات هوية قويًا؛ المستندات للمراجعة فقط ولا يُتخذ عبر الصفحة أي قرار مالي.
- لا يُنصح بتشغيله على بيانات عملاء حقيقية قبل موافقة جهة أمن المعلومات والامتثال وتحديد سياسة الاحتفاظ بالملفات.
- سأقدّم في النهاية تقريرًا بما تم وما يحتاج اعتمادًا.

## Technical details

- Tables: `document_requests` (token_hash sha256, customer_key, account_number, collector employee_id/name, status, expires_at, last_activity_at, failed_attempts, locked_until), `document_request_items` (label snapshot, is_required, status, rejection_reason), `customer_documents` (storage_path, mime, size, item_id), `document_activity_logs`, `document_library`. RLS enabled with no anon/authenticated policies; all access via server functions using the admin client (service_role grants only). Realtime-friendly status changes broadcast via a narrow read path for the collector UI (polling fallback every 15s).
- Private storage bucket `customer-documents`; downloads via short-lived signed URLs from a server function.
- Token: 32 random bytes (base64url) in the URL; only its SHA-256 stored. ID check compares against `customers.national_id` (normalized) server-side; never returned to client.
- After successful ID check the server issues a short-lived HMAC-signed upload session (stored in sessionStorage) scoped to the request id.
- Upload: server function receives file (base64/FormData), validates extension, MIME, magic bytes (PDF/JPEG/PNG) and 10MB limit, writes to storage, updates item and request status.
- Collector server functions: `createDocumentRequest`, `listCustomerDocumentRequests`, `cancel/renew/reissue`, `reviewDocument`, `getDocumentSignedUrl`, `listDocumentNotifications`. Public: `getPublicRequestInfo`, `verifyCustomerId`, `getUploadState`, `uploadDocument`.
- New files: `src/lib/documents.functions.ts`, `src/lib/documents.server.ts`, `src/components/DocumentRequestDialog.tsx`, `src/components/CustomerDocumentsSection.tsx`, `src/routes/documents.$token.tsx` (own head, noindex). Small insertions only in `WalletApp.tsx` (button + section) and `CollectorDashboard.tsx` (notifications).
- Verify with Playwright: issue link for 3 docs, wrong/right ID, partial upload, return later, reject + re-upload, cancel, expiry, cross-request access, 320px mobile layout.
