# AEC v1.4.0 Stable — Railway

هذا إصدار موحد للاستقرار، وليس تحديثًا جزئيًا.

## أهم ما تم إصلاحه
- توحيد الصلاحيات باستخدام Capability Matrix.
- حفظ ملف Amazon الأصلي داخل PostgreSQL لإعادة التحليل والتصدير.
- إعادة تحليل ملف واحد أو جميع الملفات المحفوظة.
- تصدير Excel مصحح بعد اعتماد الـPatches.
- Diagnostics وSystem Self-Test داخل الواجهة.
- تحسين AI Agent للأوامر متعددة الرسائل، إعادة التحليل، وتجهيز موافقات Variation Theme.
- عدم إعادة الملف الثنائي الكبير داخل JSON عند فتح Review.
- الحفاظ على Simulation Mode وEmergency Lock.

## الرفع
1. فك الضغط.
2. ارفع كل الملفات الموجودة داخل المجلد إلى جذر GitHub.
3. Commit message: `Deploy AEC v1.4.0 stable release`
4. Railway سيعمل Deploy تلقائيًا.

## التحقق
افتح `/api/health` وتأكد من `version: 1.4.0`.
ثم افتح صفحة Diagnostics وشغّل System Self-Test.

## ملاحظة للملفات القديمة
الملفات التي رُفعت قبل v1.4 لم يتم حفظ Binary الخاص بها. ارفع كل ملف قديم مرة واحدة فقط، وسيتم تحديث السجل القديم بدل إنشاء Duplicate، وبعدها تعمل Re-analyze وExport corrected.

## الأمان
لا تضف Amazon أو OpenAI أو WhatsApp secrets إلى GitHub. استخدم Railway Variables فقط.
