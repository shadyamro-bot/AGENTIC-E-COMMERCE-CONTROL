# AEC Railway Unified v1.0

هذه نسخة Backend حقيقية تستخدم PostgreSQL وليست Demo تعتمد على Local Storage.

## ما تعمل عليه
- حفظ Products وVariants في PostgreSQL.
- إنشاء Parent وChildren من Command Center.
- Validation محلي.
- Approvals حقيقية.
- Audit Log حقيقي.
- واجهة Single Page بدون روابط صفحات مكسورة.
- Simulation Mode وEmergency Lock.
- النشر الحقيقي على Amazon غير مفعّل في هذا الإصدار.

## رفعها إلى GitHub
1. فك ضغط الحزمة.
2. ارفع **محتويات المجلد** إلى جذر Repository الحالي.
3. تأكد من وجود `package.json` و`src` و`public` في الجذر.
4. GitHub Commit.
5. Railway سيعمل Deploy تلقائيًا.

## إعداد Railway
المتغيرات الموجودة عندك كافية:
- DATABASE_URL (Reference إلى Postgres)
- NODE_ENV=production
- SIMULATION_MODE=true
- EMERGENCY_LOCK=true
- SP_API_BASE_URL=https://sellingpartnerapi-eu.amazon.com
- SP_API_MARKETPLACE_ID=ARBP9OOSHTCHU

لا تضف أسرار Amazon الآن.

## فحص النشر
- افتح `/api/health`
- يجب أن يظهر `ok: true` و`database: true`.
- افتح رابط الموقع الرئيسي.
