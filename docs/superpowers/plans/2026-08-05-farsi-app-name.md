# Farsi App Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hardcoded `"Tally"` occurrence inside `translations.ts`'s `fa` locale object with `"یلات"`.

**Architecture:** Pure content edit. There is no shared `appName` key that these 38 occurrences reference — each is an independently hardcoded literal string inside the `fa` object (confirmed: `grep -rn "\.appName" src --include="*.ts*"` outside `translations.ts` returns zero matches, so nothing is driven by interpolation). Every occurrence is edited directly; `en` and `es` objects, `app.json`, and every hardcoded `"Tally"` reference outside `translations.ts` are untouched.

**Tech Stack:** TypeScript content edit (JSON-like object literal).

## Global Constraints

- Only the `fa` object (`src/i18n/translations.ts:2298-3342`) is touched. `en` (`:1254-2297`) and `es` (`:3343-...`) keep `"Tally"` verbatim.
- Only **string values** change. Object **keys** are never translated — two of the 38 lines have a key that itself contains the substring `Tally` (`rowAboutTally`, and `tally` — see Task 1 Step 1's note); those keys must remain byte-for-byte identical.
- The filename reference `supabase/tally_remote_schema.sql` inside one string (line 2351) is a lowercase file path, not the brand word — it is left untouched. (A case-sensitive replacement of the literal `Tally` — capital T — naturally skips it, since the filename is all-lowercase.)
- This is a translation-content change only, not a rebrand — no logic, no key renames, no new keys.

---

### Task 1: Replace all 38 `"Tally"` occurrences in the `fa` locale object

**Files:**
- Modify: `src/i18n/translations.ts` (38 lines within `2298-3342`, listed below)

**Interfaces:** none — string literal content only, no signature changes.

No unit test: this is content-only with no new logic (per the design doc's testing section). Verify with the grep counts in Step 3 and the existing test suite in Step 4.

- [ ] **Step 1: Apply each replacement**

Every line below currently reads exactly as the "Old" value (confirmed via `sed -n '<line>p' src/i18n/translations.ts` immediately before writing this plan). Replace each with its "New" value. **Two lines need special care**: line 2449's key is `rowAboutTally` and line 2757's key is `tally` — in both, only the **quoted value** changes; the key before the colon is copied through unchanged.

| Line | Old | New |
|---|---|---|
| 2300 | `    appName: "Tally",` | `    appName: "یلات",` |
| 2351 | `      "همگام ابر به ایمیل در پروفایل نیاز دارد. پایین وارد و ذخیره کنید، یا دوباره سوییچ را بزنید. SQL جدول‌های Tally را در Supabase اجرا کنید (فایل supabase/tally_remote_schema.sql در ریپو).",` | `      "همگام ابر به ایمیل در پروفایل نیاز دارد. پایین وارد و ذخیره کنید، یا دوباره سوییچ را بزنید. SQL جدول‌های یلات را در Supabase اجرا کنید (فایل supabase/tally_remote_schema.sql در ریپو).",` |
| 2354 | `    authTitle: "Tally",` | `    authTitle: "یلات",` |
| 2374 | `      "همگام‌سازی و پشتیبان‌گیری ابری نیاز به حساب Tally فعال دارد.",` | `      "همگام‌سازی و پشتیبان‌گیری ابری نیاز به حساب یلات فعال دارد.",` |
| 2375 | `    gateOverlaySignInCta: "ورود با Tally",` | `    gateOverlaySignInCta: "ورود با یلات",` |
| 2382 | `      "این ایمیل قبلاً در Tally ثبت شده اما رمز درست نیست. دوباره تلاش کنید یا روی «فراموشی رمز» بزنید.",` | `      "این ایمیل قبلاً در یلات ثبت شده اما رمز درست نیست. دوباره تلاش کنید یا روی «فراموشی رمز» بزنید.",` |
| 2414 | `      "به Tally خوش آمدید! لینک تأیید به ایمیل شما فرستاده شد — برای تکمیل ورود روی آن کلیک کنید.",` | `      "به یلات خوش آمدید! لینک تأیید به ایمیل شما فرستاده شد — برای تکمیل ورود روی آن کلیک کنید.",` |
| 2449 | `    rowAboutTally: "درباره Tally",` | `    rowAboutTally: "درباره یلات",` |
| 2452 | `    aboutTitle: "درباره Tally",` | `    aboutTitle: "درباره یلات",` |
| 2474 | `      "بازخوردتان را ارسال کنید تا Tally بهتر شود. اگر برنامه کرش کند یا خطایی رخ دهد، گزارش خطای خودکار به‌صورت جداگانه ذخیره می‌شود.",` | `      "بازخوردتان را ارسال کنید تا یلات بهتر شود. اگر برنامه کرش کند یا خطایی رخ دهد، گزارش خطای خودکار به‌صورت جداگانه ذخیره می‌شود.",` |
| 2512 | `    premiumTitle: "Tally پریمیوم",` | `    premiumTitle: "یلات پریمیوم",` |
| 2521 | `      "همگام‌سازی ابری بین دستگاه‌ها با Tally پریمیوم است. اینجا اشتراک بگیرید، دوباره همگام ابری را روشن کنید.",` | `      "همگام‌سازی ابری بین دستگاه‌ها با یلات پریمیوم است. اینجا اشتراک بگیرید، دوباره همگام ابری را روشن کنید.",` |
| 2544 | `    inviteBody: "دوستانتان را به Tally دعوت کنید و هزینه‌ها را به‌سادگی تقسیم کنید.",` | `    inviteBody: "دوستانتان را به یلات دعوت کنید و هزینه‌ها را به‌سادگی تقسیم کنید.",` |
| 2546 | `    inviteShareMessage: "به من در Tally بپیوند — تقسیم و تسویهٔ هزینه‌ها بسیار ساده.",` | `    inviteShareMessage: "به من در یلات بپیوند — تقسیم و تسویهٔ هزینه‌ها بسیار ساده.",` |
| 2630 | `    tallyFiguresOut: "Tally می‌فهمد چه کسی پرداخت کرده، چه کسانی در آن هستند و حساب را انجام می‌دهد.",` | `    tallyFiguresOut: "یلات می‌فهمد چه کسی پرداخت کرده، چه کسانی در آن هستند و حساب را انجام می‌دهد.",` |
| 2658 | `    libraryDenied: "دسترسی به گالری خاموش است. در تنظیمات سیستم برای Tally می‌توانید روشن کنید.",` | `    libraryDenied: "دسترسی به گالری خاموش است. در تنظیمات سیستم برای یلات می‌توانید روشن کنید.",` |
| 2702 | `      "اسکن رسید با هوش مصنوعی با Tally پریمیوم است. برای اشتراک یا بازیابی خریدها تنظیمات را باز کنید.",` | `      "اسکن رسید با هوش مصنوعی با یلات پریمیوم است. برای اشتراک یا بازیابی خریدها تنظیمات را باز کنید.",` |
| 2706 | `      "اسکن رسید و ثبت هزینه صوتی نیاز به حساب Tally فعال دارد.",` | `      "اسکن رسید و ثبت هزینه صوتی نیاز به حساب یلات فعال دارد.",` |
| 2757 | `    tally: "Tally",` | `    tally: "یلات",` |
| 2824 | `      "مانده‌ها می‌توانند زنجیره شوند. با روشن بودن این گزینه، Tally بدهی‌ها را طوری ادغام می‌کند که با جابه‌جایی کمتر تسویه کنید.",` | `      "مانده‌ها می‌توانند زنجیره شوند. با روشن بودن این گزینه، یلات بدهی‌ها را طوری ادغام می‌کند که با جابه‌جایی کمتر تسویه کنید.",` |
| 3018 | `      "Tally با ساده‌سازی مانده گروه، {{count}} جابه‌جایی را کمتر کرده است.",` | `      "یلات با ساده‌سازی مانده گروه، {{count}} جابه‌جایی را کمتر کرده است.",` |
| 3144 | `      "Tally برای اسکن کد QR دعوت گروه به دوربین نیاز دارد.",` | `      "یلات برای اسکن کد QR دعوت گروه به دوربین نیاز دارد.",` |
| 3148 | `    unrecognizedBody: "این کد QR شبیه لینک دعوت Tally نیست.",` | `    unrecognizedBody: "این کد QR شبیه لینک دعوت یلات نیست.",` |
| 3152 | `    pointAtCode: "دوربین را روی کد QR Tally نگه دارید",` | `    pointAtCode: "دوربین را روی کد QR یلات نگه دارید",` |
| 3207 | `      "Plus ابزارهای راحتی را باز می‌کند — استفادهٔ رایگان از Tally بدون محدودیت زمانی ادامه دارد.",` | `      "Plus ابزارهای راحتی را باز می‌کند — استفادهٔ رایگان از یلات بدون محدودیت زمانی ادامه دارد.",` |
| 3213 | `      "از هر رسیدی عکس بگیرید و Tally آیتم‌ها را بین افراد تقسیم می‌کند — بدون ورود دستی.",` | `      "از هر رسیدی عکس بگیرید و یلات آیتم‌ها را بین افراد تقسیم می‌کند — بدون ورود دستی.",` |
| 3235 | `      "برای گرفتن اعتبار بیشتر از اپلیکیشن موبایل Tally استفاده کنید، یا ببینید پاس‌های Tally شامل چه چیزهایی می‌شوند.",` | `      "برای گرفتن اعتبار بیشتر از اپلیکیشن موبایل یلات استفاده کنید، یا ببینید پاس‌های یلات شامل چه چیزهایی می‌شوند.",` |
| 3236 | `    passCta: "دیدن پاس‌های Tally",` | `    passCta: "دیدن پاس‌های یلات",` |
| 3240 | `    title: "پاس‌های Tally",` | `    title: "پاس‌های یلات",` |
| 3283 | `      "خریدهای یک‌باره. Tally هرگز به‌صورت خودکار از شما مبلغی برداشت نمی‌کند — هر زمان بخواهید پاس را تمدید یا یک پاس جدید بخرید.",` | `      "خریدهای یک‌باره. یلات هرگز به‌صورت خودکار از شما مبلغی برداشت نمی‌کند — هر زمان بخواهید پاس را تمدید یا یک پاس جدید بخرید.",` |
| 3292 | `    page1Title: "به Tally خوش آمدید",` | `    page1Title: "به یلات خوش آمدید",` |
| 3297 | `      "مبلغ، پرداخت‌کننده و اعضا را وارد کنید؛ Tally سهم هرکس را خودکار محاسبه می‌کند.",` | `      "مبلغ، پرداخت‌کننده و اعضا را وارد کنید؛ یلات سهم هرکس را خودکار محاسبه می‌کند.",` |
| 3300 | `      "Tally بدهی‌های زنجیره‌ای را ادغام می‌کند تا همه با کمترین پرداخت تسویه کنند.",` | `      "یلات بدهی‌های زنجیره‌ای را ادغام می‌کند تا همه با کمترین پرداخت تسویه کنند.",` |
| 3303 | `      "از Tally فقط روی این دستگاه استفاده کنید، یا وارد شوید تا داده‌هایتان بین دستگاه‌ها همگام باشد.",` | `      "از یلات فقط روی این دستگاه استفاده کنید، یا وارد شوید تا داده‌هایتان بین دستگاه‌ها همگام باشد.",` |
| 3304 | `    intentTitle: "به Tally خوش آمدید",` | `    intentTitle: "به یلات خوش آمدید",` |
| 3308 | `      "هزینه‌های مشترک را با هر کسی پیگیری کنید — سفر، هم‌خانه‌ای، قرار. Tally حساب می‌کند، هوش مصنوعی رسید را می‌خواند.",` | `      "هزینه‌های مشترک را با هر کسی پیگیری کنید — سفر، هم‌خانه‌ای، قرار. یلات حساب می‌کند، هوش مصنوعی رسید را می‌خواند.",` |
| 3327 | `      "بدون تأیید هم می‌توانید فقط روی این دستگاه از Tally استفاده کنید — روی «استفاده محلی» بزنید.",` | `      "بدون تأیید هم می‌توانید فقط روی این دستگاه از یلات استفاده کنید — روی «استفاده محلی» بزنید.",` |
| 3338 | `    body: "این نسخه از Tally دیگر پشتیبانی نمی‌شود. برای ادامه استفاده، به‌روزرسانی کنید.",` | `    body: "این نسخه از یلات دیگر پشتیبانی نمی‌شود. برای ادامه استفاده، به‌روزرسانی کنید.",` |

- [ ] **Step 2: Confirm every replacement landed and nothing outside `fa` moved**

Run:

```bash
sed -n '2298,3342p' src/i18n/translations.ts | grep -c 'Tally'
```
Expected: `0` (every capital-`Tally` occurrence inside the `fa` object is gone — the lowercase `tally_remote_schema.sql` filename on line 2351 does not match this pattern and is unaffected).

Run:

```bash
grep -c 'Tally' src/i18n/translations.ts
```
Expected: the same count the file had before this task, **minus 38** (only the `en` and `es` objects' `"Tally"` occurrences remain, plus the lowercase filename reference).

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no new errors (string literal content changes only; `MessageTree`'s shape is unchanged).

Run: `npx vitest run`
Expected: all tests pass (nothing under `src` reads `translations.ts`'s `fa` object in a test — confirmed no `.test.ts` file imports from `./translations` for locale content).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "fix(i18n): use یلات as the Farsi app name"
```

## Self-Review Notes

- **Spec coverage:** the design doc's single requirement — replace every hardcoded `"Tally"` in the `fa` object with `"یلات"`, leave `en`/`es`/`app.json`/other hardcoded references untouched — is fully covered by Task 1's 38-line table (verified exhaustive via `grep -n 'Tally' src/i18n/translations.ts` restricted to lines 2298-3342 during planning).
- **Risk caught during planning:** a naive find-and-replace of the substring `Tally` would have corrupted the object key `rowAboutTally` (line 2449) into `rowAboutیلات`, breaking every `t("...rowAboutTally")` call site. The table above keeps that key (and `tally` on line 2757, which is a coincidental lowercase match that a case-sensitive replace correctly leaves alone) byte-for-byte unchanged — only the quoted value changes.
