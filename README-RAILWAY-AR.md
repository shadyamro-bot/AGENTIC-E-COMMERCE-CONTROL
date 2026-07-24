# AEC Railway Unified v1.1

## الجديد
- واجهة احترافية محسنة ومتجاوبة.
- اختيار المستخدم والدور من أعلى الواجهة.
- صلاحيات Creator / Reviewer / Publisher / Admin على API.
- صفحة تفاصيل المنتج والـVariants.
- Product Editor يحفظ التعديلات في PostgreSQL.
- كل تعديل ينشئ Approval جديد مع Before / Proposed values.
- Validation Issues محفوظة في قاعدة البيانات.
- Dashboard أكثر وضوحًا وسجل نشاط حديث.
- بحث في المنتجات.
- ترقية قاعدة البيانات تلقائيًا بدون حذف البيانات الحالية.

## الرفع على GitHub
ارفع محتويات الحزمة في جذر المستودع مع الحفاظ على:

```
src/server.js
src/db.js
src/parser.js
public/index.html
public/app.js
public/styles.css
package.json
```

Railway سيعمل Deploy تلقائيًا. لا تغيّر:

```
Start Command: npm start
Root Directory: فارغ
```

لا تضف بيانات Amazon السرية حتى الآن. النشر الحقيقي يظل مقفولًا.
