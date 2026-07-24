# AEC Railway v1.3.0 — Consolidated Stable + AI Agent

هذه حزمة Flat Ready. ارفع كل الملفات إلى جذر GitHub واستبدل الملفات القديمة.

## الجديد
- AI Agent Center مع تشغيل محلي آمن، واتصال OpenAI اختياري من Railway Variables.
- إنشاء Drafts من أوامر عربية أو إنجليزية.
- تحليل الملفات والمنتجات والتحذيرات.
- لا يستطيع الـAI اعتماد أو نشر أي منتج.
- أدوار موسعة: Viewer, Analyst, Creator, Listing Specialist, Reviewer, Operations Manager, Publisher, Admin.
- كل إصلاحات Amazon Parser وFile Health وVariation Theme approvals.
- يحافظ على PostgreSQL والبيانات الحالية.

## متغيرات AI الاختيارية في Railway
OPENAI_API_KEY
OPENAI_MODEL=gpt-5-mini
AI_AGENT_ENABLED=true
AI_AGENT_PUBLISH_DISABLED=true

لا تضع المفتاح في GitHub أو المحادثة. بدون المفتاح يعمل Local Safe Agent.

## Commit message
Deploy AEC v1.3.0 consolidated AI agent
