# إعداد النشر

## الخطوة 1: أضف GitHub Secret

Settings → Secrets and variables → Actions → New repository secret

**اسم:** `ZAPIER_WEBHOOK_URL`
**القيمة:** رابط webhook من Zapier

## الخطوة 2: إعداد Zapier

1. اذهب إلى zapier.com
2. Create a Zap
3. ابحث عن "Webhooks by Zapier"
4. اختر "Catch Raw Hook"
5. انسخ الرابط وأضفه في GitHub Secret

## الخطوة 3: اختبار

```bash
git add .
git commit -m "test"
git push origin main
```

ستجد الـ build في GitHub Actions وسيتم إرسال webhook إلى Zapier تلقائياً.

## الخطوة 4: ربط Zapier بـ Supabase

في Zapier:
- اضغط Add Step
- اختر Supabase
- Upload file أو Insert row
- الخطوات ستظهر حسب احتياجاتك
