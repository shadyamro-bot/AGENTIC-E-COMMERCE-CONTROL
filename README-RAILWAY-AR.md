# AEC Railway v1.2.3 — File Health & Status Fix

## التحديثات
- فصل النتائج إلى Valid وAccepted with warnings وBlocked وIgnored بدون احتساب الصف مرتين.
- إضافة File Health Score.
- عرض أكثر 3 تحذيرات تكرارًا لكل ملف.
- تحسين شاشة Review وتمييز Error عن Warning.
- ترقية PostgreSQL تلقائيًا دون حذف البيانات.

## الرفع
1. فك الضغط.
2. ارفع كل الملفات إلى جذر GitHub واستبدل الملفات السابقة.
3. Commit message: `Deploy AEC v1.2.3 file health fix`
4. تحقق من `/api/health` وأن الإصدار `1.2.3`.
