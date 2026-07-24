# AEC Railway v1.2.1 — Amazon Template Parser Fix

إصدار مسطح جاهز للرفع إلى جذر GitHub دون إنشاء مجلدات.

## التحسينات
- اكتشاف أفضل Sheet داخل ملف Amazon تلقائيًا.
- اكتشاف Header Row الحقيقي ضمن أول 35 صفًا.
- تجاهل صفوف التعليمات والصفوف الفارغة.
- الاحتفاظ برقم صف Excel الحقيقي في نتائج الأخطاء.
- فصل Parent عن Child ومتطلبات كل نوع.
- الصورة والسعر الناقصان في Child تحذيرات، وليس رفضًا تلقائيًا.
- أخطاء SKU واللون والمقاس وعلاقة Parent تعتبر Blocking.
- عرض Parent Rows وChild Rows وWarnings وBlocked.
- دعم Processing Summary وTransactions بصورة أفضل.
- قاعدة البيانات تترقى تلقائيًا دون حذف الملفات السابقة.

## الرفع
ارفع كل محتويات هذا المجلد إلى جذر GitHub ثم استخدم Commit:
`Deploy AEC v1.2.1 Amazon parser fix`
