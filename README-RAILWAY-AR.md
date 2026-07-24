# AEC Railway v1.2.2 — Amazon Template Parser Fix

هذه الحزمة مسطحة وجاهزة للرفع مباشرة إلى جذر GitHub.

## ما تم إصلاحه
- اعتماد صف العناوين في قالب Amazon من Row 4.
- تجاهل صف الحقول التقنية Row 5 وصف المثال Row 6.
- بدء تحليل المنتجات من Row 7.
- التعرف على `Parentage Level` وتصنيف Parent وChild بصورة صحيحة.
- عدم طلب اللون أو المقاس أو السعر من صف Parent.
- قراءة السعر من `Your Price EGP (Sell on Amazon, EG)`.
- قراءة اللون من `Color Map` أو `Color`.
- قراءة المقاس من `Size` أو `Footwear Size`.
- عرض Sheet وHeader Row وData Start Row وعدد Parent وChild.
- عرض نوع الصف داخل تفاصيل المشكلات.

## الرفع
1. فك الضغط.
2. ارفع كل الملفات الموجودة داخل المجلد إلى جذر GitHub.
3. Commit message:
   `Deploy AEC v1.2.2 parser fix`
4. Railway سيعمل Deploy تلقائيًا.
5. تحقق من `/api/health` وأن الإصدار `1.2.2`.

لا تغيّر `DATABASE_URL` أو إعدادات PostgreSQL أو `npm start`.
