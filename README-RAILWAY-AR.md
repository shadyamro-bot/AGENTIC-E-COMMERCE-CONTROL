# AEC Railway Unified v1.2

## الجديد

- File Center حقيقي لرفع وتحليل XLSX وXLSM وXLS وCSV.
- حفظ بيانات الملف ونتيجة الفحص في PostgreSQL، مع عدم الاحتفاظ بالملف الثنائي على قرص Railway المؤقت.
- اكتشاف الملف المكرر باستخدام SHA-256.
- فحص مبدئي لملفات Listing وProcessing Summary وTransactions.
- Image Manager لإضافة روابط الصور لكل Child SKU.
- Notifications محفوظة في PostgreSQL.
- صفحة WhatsApp وn8n مع اختبار Simulation آمن.
- Amazon Connection Wizard يعرض جاهزية الربط دون كشف الأسرار.
- ترقية تلقائية لقاعدة البيانات دون حذف المنتجات أو الموافقات الحالية.

## الرفع إلى GitHub

ارفع محتويات المجلد إلى جذر Repository مع الحفاظ على:

```text
package.json
src/server.js
src/db.js
src/parser.js
public/index.html
public/app.js
public/styles.css
```

Commit message:

```text
Deploy AEC Railway Unified v1.2
```

Railway سيبدأ النشر تلقائيًا. بعد النجاح افتح:

```text
https://agentic-e-commerce-control-production.up.railway.app/api/health
```

يجب أن تكون النسخة `1.2.0`.

## الأمان

لا تضف بيانات Amazon أو WhatsApp إلى GitHub. توضع لاحقًا في Railway Variables فقط. يظل:

```text
SIMULATION_MODE=true
EMERGENCY_LOCK=true
```
