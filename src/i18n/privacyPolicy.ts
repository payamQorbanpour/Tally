/**
 * Full privacy-policy text, bundled with the app.
 *
 * This lives outside `translations.ts` on purpose: it is long-form legal
 * prose rather than UI microcopy, it changes on its own cadence, and
 * keeping it here avoids growing the already-large `MessageTree` type by
 * a few dozen keys per locale.
 *
 * It must be readable **offline and before sign-up** — Cafe Bazaar's
 * publishing rules require the complete policy to be available to the
 * user before the app collects any personal data, so
 * {@link ../screens/PrivacyPolicyScreen} renders this from the bundle
 * rather than linking out to `public/legal/privacy.html`.
 *
 * Keep this in sync with `public/legal/privacy.html` (the App Store
 * Connect / web copy) whenever data handling changes.
 */
import type { AppLocale } from "./translations";

/** Contact address shown in the policy's "contact us" section. */
export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || "";

export type PrivacyPolicySection = {
  heading: string;
  /** Paragraphs rendered in order. */
  body?: string[];
  /** Rendered as a bulleted list under `body`. */
  bullets?: string[];
};

export type PrivacyPolicyDoc = {
  title: string;
  /** Human-readable date, already localised — not a parsed timestamp. */
  lastUpdated: string;
  intro: string[];
  sections: PrivacyPolicySection[];
};

const en: PrivacyPolicyDoc = {
  title: "Privacy Policy",
  lastUpdated: "Last updated: August 1, 2026",
  intro: [
    "Tally helps you record and split shared expenses with friends. This policy explains exactly which information the app collects, why it collects it, who processes it, and what we commit to never doing with it.",
    "You are reading this before creating an account on purpose: no personal information is sent anywhere until you choose to sign up or turn on cloud sync.",
  ],
  sections: [
    {
      heading: "What we collect",
      body: [
        "Tally only collects what a given feature actually needs. Nothing below is collected unless you use the feature it belongs to.",
      ],
      bullets: [
        "Email address — required to create an account, sign in, confirm your address, and reset your password.",
        "Display name (optional) — shown to other members of groups you join, so people can tell who paid what.",
        "Password — stored only as a salted hash by our authentication provider. Neither we nor anyone else can read your original password.",
        "Expense data — group names, expense titles, amounts, dates, categories, and how each expense is split. This is stored on your device by default and is uploaded only if you enable cloud sync.",
        "Receipt photos and voice notes — captured only when you actively use the AI features, and used solely to extract the items and amounts of that one expense.",
        "Account identifier and purchase status — an internal user id plus a flag recording whether you hold an active pass, so your purchase works across your devices.",
        "Crash and error diagnostics — if the app crashes, a technical report (error message, stack trace, app version, device model, OS version) is sent to our error-monitoring provider so we can fix the bug.",
      ],
    },
    {
      heading: "What we never collect",
      body: [
        "Tally does not ask for and does not receive your phone number, national ID number, date of birth, home or postal address, bank card or account details, precise location, contact list, SMS messages, or call history. No feature in the app requests them.",
        "Payments are handled entirely by the app store you installed Tally from. We never see your card details.",
      ],
    },
    {
      heading: "Why we collect it",
      bullets: [
        "To create and secure your account and let you sign back in on another device.",
        "To sync your groups and expenses across your devices when you turn cloud sync on.",
        "To show the right name next to each expense for other members of your groups.",
        "To read receipts and voice notes into expense entries when you use the AI features.",
        "To honour purchases you have made and keep premium features unlocked.",
        "To diagnose crashes and improve the app's stability.",
      ],
      body: [
        "We do not use your information for behavioural profiling or ad targeting. Tally does show optional rewarded ads — see the Advertising section below for exactly what that does and does not involve.",
      ],
    },
    {
      heading: "Device permissions",
      bullets: [
        "Camera — to scan receipts and to read group-invite QR codes. Images are processed only for the expense you are creating.",
        "Microphone — only while you are recording a voice note to describe an expense.",
        "Photo library — only when you pick an existing receipt image or a group icon yourself.",
      ],
      body: [
        "Each permission is requested at the moment you first use the corresponding feature, and you can decline it and keep using the rest of the app.",
      ],
    },
    {
      heading: "AI features",
      body: [
        "When you scan a receipt or record a voice note, that image or audio is sent over an encrypted connection to our server, which forwards it to an AI model provider purely to extract the text, items, and amounts. The result is returned to your device and prefilled into the expense form.",
        "This content is used for that single extraction and is not used to train any model. Please avoid submitting receipts or recordings that contain information you would rather not have processed by an external provider.",
      ],
    },
    {
      heading: "Advertising",
      body: [
        "Tally shows optional rewarded ads that you can choose to watch in exchange for AI credits. Nothing plays automatically, and skipping ads never blocks any feature.",
        "Ads are supplied by Google AdMob, except in builds distributed through Iranian app stores such as Cafe Bazaar, where Google's ad services are unavailable and Tapsell supplies ads instead, under the same limits described below.",
      ],
      bullets: [
        "Watching a rewarded ad earns you AI credits, used for the AI receipt-scanning and voice-note features.",
        "AdMob may collect your device's advertising identifier and coarse usage data to select and measure ads. See Google's advertising policy: https://policies.google.com/technologies/ads",
        "In builds where it is used instead of AdMob, Tapsell may similarly collect your device's advertising identifier and coarse usage data to select and measure ads.",
        "No expense, group, receipt, or contact data is ever shared with advertisers. The ad SDK receives only your account id, and only as a one-time reward identifier confirming you watched an ad.",
        "You can decline ad tracking at any time, through the iOS tracking prompt or your Android device's ad settings, and rewarded ads still work the same way.",
        "Ad-free AI use is planned as part of Tally passes but is not active yet — for now rewarded ads stay entirely optional for everyone, and declining them only means you do not earn extra AI credits.",
      ],
    },
    {
      heading: "Who processes your data",
      body: [
        "We keep the list of third parties deliberately short, and each one acts only as an infrastructure provider on our behalf — none of them is permitted to use your data for their own purposes.",
      ],
      bullets: [
        "Supabase — account authentication, database, and cloud sync storage.",
        "Our AI model provider — receipt and voice extraction, as described above.",
        "Google AdMob — shows rewarded ads and, only when you choose to watch one, processes your device's advertising identifier. See Advertising above.",
        "Tapsell — supplies rewarded ads instead of AdMob in builds distributed through Iranian app stores; same purpose and same data limits as AdMob above.",
        "Sentry — crash and error diagnostics, configured to exclude personal identifiers.",
        "The app store you purchased from (Cafe Bazaar, Google Play, or Apple) — payment processing and purchase verification.",
      ],
    },
    {
      heading: "Our commitment to you",
      body: [
        "We do not sell your personal information. We do not rent, trade, or share it with any third party for marketing purposes. We do not hand it to any other person or organisation, except where we are legally compelled to by a valid legal order.",
        "Access to production data is restricted to the developer maintaining the app, is used only to operate and support the service, and every request between the app and our servers is encrypted with TLS.",
      ],
    },
    {
      heading: "Retention and deletion",
      body: [
        "Local data stays on your device until you delete it or uninstall the app. Synced data is kept while your account exists so the app keeps working across your devices.",
        "You can turn cloud sync off at any time in Settings, sign out, or clear the app's local data. To have your account and all associated cloud data permanently deleted, contact us using the details below and we will action the request.",
      ],
    },
    {
      heading: "Children",
      body: [
        "Tally is not directed at children under 13, and we do not knowingly collect information from them.",
      ],
    },
    {
      heading: "Changes to this policy",
      body: [
        "If our data handling changes, we will update this text and the date at the top of this page, and it will ship with the next version of the app.",
      ],
    },
    {
      heading: "Contact us",
      body: [
        SUPPORT_EMAIL
          ? `If you have any question about this policy or your data, email us at ${SUPPORT_EMAIL} and we will respond.`
          : "If you have any question about this policy or your data, use Settings → Help & support inside the app to send us a message and we will respond.",
      ],
    },
  ],
};

const fa: PrivacyPolicyDoc = {
  title: "سیاست حفظ حریم خصوصی",
  lastUpdated: "آخرین به‌روزرسانی: ۱۰ مرداد ۱۴۰۵",
  intro: [
    "تالی برنامه‌ای برای ثبت و تقسیم هزینه‌های مشترک میان دوستان است. در این متن دقیقاً توضیح داده‌ایم که برنامه چه اطلاعاتی از شما دریافت می‌کند، چرا آن‌ها را دریافت می‌کند، چه کسانی آن‌ها را پردازش می‌کنند و ما متعهد می‌شویم که هرگز چه کارهایی با آن‌ها نکنیم.",
    "این متن عمداً پیش از ساخت حساب کاربری در اختیار شما قرار گرفته است: تا زمانی که خودتان ثبت‌نام نکنید یا همگام‌سازی ابری را روشن نکنید، هیچ اطلاعات شخصی‌ای به جایی ارسال نمی‌شود.",
  ],
  sections: [
    {
      heading: "چه اطلاعاتی دریافت می‌کنیم",
      body: [
        "تالی تنها همان چیزی را دریافت می‌کند که یک قابلیت مشخص واقعاً به آن نیاز دارد. هیچ‌کدام از موارد زیر دریافت نمی‌شود مگر آنکه شما از قابلیت مربوط به آن استفاده کنید.",
      ],
      bullets: [
        "نشانی ایمیل — برای ساخت حساب کاربری، ورود به برنامه، تأیید نشانی ایمیل و بازیابی رمز عبور لازم است.",
        "نام نمایشی (اختیاری) — به سایر اعضای گروه‌هایی که در آن‌ها عضو می‌شوید نشان داده می‌شود تا مشخص باشد هر هزینه را چه کسی پرداخت کرده است.",
        "رمز عبور — تنها به شکل درهم‌سازی‌شده (hash) نزد سرویس احراز هویت نگهداری می‌شود. نه ما و نه هیچ‌کس دیگری امکان خواندن رمز اصلی شما را ندارد.",
        "اطلاعات هزینه‌ها — نام گروه‌ها، عنوان هزینه‌ها، مبالغ، تاریخ‌ها، دسته‌بندی‌ها و نحوهٔ تقسیم هر هزینه. این اطلاعات به‌صورت پیش‌فرض فقط روی دستگاه خودتان ذخیره می‌شود و تنها در صورتی که همگام‌سازی ابری را فعال کنید، روی سرور بارگذاری می‌شود.",
        "تصویر رسید و پیام صوتی — فقط زمانی که خودتان از قابلیت‌های هوش مصنوعی استفاده کنید دریافت می‌شود و تنها برای استخراج اقلام و مبالغ همان یک هزینه به کار می‌رود.",
        "شناسهٔ حساب و وضعیت خرید — یک شناسهٔ داخلی کاربر به‌همراه نشانه‌ای که مشخص می‌کند اشتراک فعالی دارید یا نه، تا خریدتان روی همهٔ دستگاه‌هایتان معتبر باشد.",
        "گزارش خطا و بروز اشکال — اگر برنامه دچار خطا شود، یک گزارش فنی (پیام خطا، ردیابی خطا، نسخهٔ برنامه، مدل دستگاه و نسخهٔ سیستم‌عامل) برای سرویس پایش خطا ارسال می‌شود تا بتوانیم اشکال را برطرف کنیم.",
      ],
    },
    {
      heading: "چه اطلاعاتی هرگز دریافت نمی‌کنیم",
      body: [
        "تالی شمارهٔ تلفن همراه، کد ملی، تاریخ تولد، نشانی محل سکونت یا پستی، اطلاعات کارت و حساب بانکی، موقعیت مکانی دقیق، دفترچهٔ تماس، پیامک‌ها و سابقهٔ تماس شما را نه درخواست می‌کند و نه دریافت می‌کند. هیچ بخشی از برنامه این اطلاعات را نمی‌خواهد.",
        "پرداخت‌ها به‌طور کامل توسط همان فروشگاهی انجام می‌شود که برنامه را از آن نصب کرده‌اید و اطلاعات کارت بانکی شما هرگز در اختیار ما قرار نمی‌گیرد.",
      ],
    },
    {
      heading: "چرا این اطلاعات را دریافت می‌کنیم",
      bullets: [
        "برای ساخت حساب کاربری، حفظ امنیت آن و امکان ورود دوباره از دستگاهی دیگر.",
        "برای همگام‌سازی گروه‌ها و هزینه‌ها میان دستگاه‌های شما، در صورتی که همگام‌سازی ابری را روشن کنید.",
        "برای نمایش نام درست کنار هر هزینه به سایر اعضای گروه.",
        "برای تبدیل تصویر رسید و پیام صوتی به ردیف‌های هزینه، هنگام استفاده از قابلیت‌های هوش مصنوعی.",
        "برای پاسداشت خریدی که انجام داده‌اید و باز نگه‌داشتن قابلیت‌های ویژه.",
        "برای شناسایی خطاها و بهبود پایداری برنامه.",
      ],
      body: [
        "ما از اطلاعات شما برای پروفایل‌سازی رفتاری یا هدف‌گیری تبلیغاتی استفاده نمی‌کنیم. تالی تبلیغات پاداش‌دار اختیاری نشان می‌دهد — برای توضیح دقیق اینکه این کار شامل چه مواردی می‌شود و چه مواردی نمی‌شود، بخش «تبلیغات» را در پایین ببینید.",
      ],
    },
    {
      heading: "دسترسی‌های دستگاه",
      bullets: [
        "دوربین — برای اسکن رسید و خواندن کد QR دعوت به گروه. تصاویر تنها برای همان هزینه‌ای که در حال ثبت آن هستید پردازش می‌شود.",
        "میکروفن — فقط در زمانی که خودتان در حال ضبط یک پیام صوتی برای توصیف هزینه هستید.",
        "گالری تصاویر — فقط زمانی که خودتان تصویر رسید یا آیکون گروه را از میان تصاویر موجود انتخاب کنید.",
      ],
      body: [
        "هر دسترسی دقیقاً در لحظهٔ نخستین استفاده از قابلیت مربوط به آن درخواست می‌شود و در صورت رد کردن آن می‌توانید از بقیهٔ بخش‌های برنامه استفاده کنید.",
      ],
    },
    {
      heading: "قابلیت‌های هوش مصنوعی",
      body: [
        "وقتی رسیدی را اسکن می‌کنید یا پیام صوتی ضبط می‌کنید، آن تصویر یا صوت از طریق یک ارتباط رمزنگاری‌شده به سرور ما و از آنجا به ارائه‌دهندهٔ مدل هوش مصنوعی فرستاده می‌شود؛ صرفاً برای استخراج متن، اقلام و مبالغ. نتیجه به دستگاه شما بازمی‌گردد و در فرم ثبت هزینه پیش‌پر می‌شود.",
        "این محتوا فقط برای همان یک استخراج استفاده می‌شود و برای آموزش هیچ مدلی به کار نمی‌رود. با این حال، لطفاً رسید یا صوتی که حاوی اطلاعاتی است که مایل به پردازش آن توسط یک ارائه‌دهندهٔ بیرونی نیستید ارسال نکنید.",
      ],
    },
    {
      heading: "تبلیغات",
      body: [
        "تالی تبلیغات پاداش‌دار اختیاری‌ای را نمایش می‌دهد که شما می‌توانید در ازای دریافت اعتبار هوش مصنوعی آن‌ها را تماشا کنید. هیچ تبلیغی به‌طور خودکار پخش نمی‌شود و رد کردن تبلیغ هرگز هیچ قابلیتی را مسدود نمی‌کند.",
        "تبلیغات معمولاً توسط Google AdMob تأمین می‌شود، به‌جز در نسخه‌هایی که از فروشگاه‌های اپلیکیشن ایرانی مانند کافه‌بازار توزیع می‌شوند؛ در آن نسخه‌ها چون سرویس‌های تبلیغاتی گوگل در دسترس نیست، Tapsell به‌جای آن تبلیغات را تأمین می‌کند، با همان محدودیت‌هایی که در ادامه توضیح داده شده است.",
      ],
      bullets: [
        "تماشای یک تبلیغ پاداش‌دار به شما اعتبار هوش مصنوعی می‌دهد که برای قابلیت‌های اسکن رسید و پیام صوتی هوش مصنوعی استفاده می‌شود.",
        "AdMob ممکن است برای انتخاب و سنجش تبلیغات، شناسهٔ تبلیغاتی دستگاه شما و داده‌های کلی استفاده را دریافت کند. برای جزئیات به سیاست تبلیغاتی گوگل مراجعه کنید: https://policies.google.com/technologies/ads",
        "در نسخه‌هایی که به‌جای AdMob از Tapsell استفاده می‌شود، این سرویس نیز ممکن است به‌طور مشابه شناسهٔ تبلیغاتی دستگاه شما و داده‌های کلی استفاده را برای انتخاب و سنجش تبلیغات دریافت کند.",
        "هیچ‌گاه اطلاعات هزینه‌ها، گروه‌ها، رسیدها یا مخاطبین با تبلیغ‌دهندگان به اشتراک گذاشته نمی‌شود. کیت تبلیغاتی تنها شناسهٔ حساب شما را دریافت می‌کند، آن‌هم فقط به‌عنوان یک شناسهٔ یک‌بارمصرف برای تأیید تماشای تبلیغ.",
        "می‌توانید هر زمان که بخواهید ردیابی تبلیغات را از طریق درخواست ردیابی iOS یا تنظیمات تبلیغات دستگاه اندرویدی خود رد کنید و تبلیغات پاداش‌دار همچنان به همان شکل کار خواهند کرد.",
        "استفادهٔ بدون تبلیغ از هوش مصنوعی به‌عنوان بخشی از پاس‌های تالی برنامه‌ریزی شده اما هنوز فعال نیست — فعلاً تبلیغات پاداش‌دار برای همه کاملاً اختیاری است و رد کردن آن‌ها فقط یعنی اعتبار هوش مصنوعی اضافه دریافت نمی‌کنید.",
      ],
    },
    {
      heading: "چه کسانی اطلاعات شما را پردازش می‌کنند",
      body: [
        "فهرست اشخاص ثالث را عامدانه کوتاه نگه داشته‌ایم و هر یک از آن‌ها تنها به‌عنوان ارائه‌دهندهٔ زیرساخت و از طرف ما عمل می‌کند؛ هیچ‌کدام مجاز به استفاده از اطلاعات شما برای مقاصد خودشان نیستند.",
      ],
      bullets: [
        "Supabase — احراز هویت حساب، پایگاه داده و ذخیره‌سازی همگام‌سازی ابری.",
        "ارائه‌دهندهٔ مدل هوش مصنوعی — استخراج اطلاعات رسید و صوت، مطابق توضیح بالا.",
        "Google AdMob — نمایش تبلیغات پاداش‌دار و، تنها زمانی که خودتان انتخاب کنید تبلیغی را تماشا کنید، پردازش شناسهٔ تبلیغاتی دستگاه شما. برای جزئیات به بخش «تبلیغات» در بالا مراجعه کنید.",
        "Tapsell — در نسخه‌هایی که از فروشگاه‌های اپلیکیشن ایرانی توزیع می‌شوند، به‌جای AdMob تبلیغات پاداش‌دار را تأمین می‌کند؛ با همان هدف و همان محدودیت‌های داده‌ای AdMob در بالا.",
        "Sentry — گزارش خطا و اشکال، با پیکربندی‌ای که شناسه‌های شخصی را حذف می‌کند.",
        "فروشگاهی که خرید از آن انجام شده (کافه‌بازار، گوگل‌پلی یا اپل) — پردازش پرداخت و تأیید خرید.",
      ],
    },
    {
      heading: "تعهد ما به شما",
      body: [
        "ما اطلاعات شخصی شما را نمی‌فروشیم. آن را اجاره نمی‌دهیم، مبادله نمی‌کنیم و برای مقاصد تبلیغاتی در اختیار هیچ شخص ثالثی قرار نمی‌دهیم. این اطلاعات را به هیچ شخص یا سازمان دیگری نمی‌سپاریم، مگر در جایی که بر اساس یک دستور قانونی معتبر ملزم به آن باشیم.",
        "دسترسی به داده‌های محیط عملیاتی محدود به توسعه‌دهندهٔ نگهدارندهٔ برنامه است، تنها برای اداره و پشتیبانی سرویس به کار می‌رود، و تمام درخواست‌های میان برنامه و سرورهای ما با TLS رمزنگاری می‌شود.",
      ],
    },
    {
      heading: "نگهداری و حذف اطلاعات",
      body: [
        "اطلاعات محلی تا زمانی که خودتان آن‌ها را حذف کنید یا برنامه را پاک کنید روی دستگاه شما می‌مانند. اطلاعات همگام‌شده تا زمانی که حساب شما وجود دارد نگهداری می‌شود تا برنامه روی همهٔ دستگاه‌هایتان کار کند.",
        "هر زمان که بخواهید می‌توانید همگام‌سازی ابری را در بخش تنظیمات خاموش کنید، از حساب خارج شوید یا اطلاعات محلی برنامه را پاک کنید. برای حذف دائمی حساب و تمام اطلاعات ابری مرتبط با آن، از راه ارتباطی انتهای همین صفحه با ما تماس بگیرید تا درخواستتان را انجام دهیم.",
      ],
    },
    {
      heading: "کودکان",
      body: [
        "تالی برای کودکان زیر ۱۳ سال طراحی نشده است و ما آگاهانه اطلاعاتی از آنان دریافت نمی‌کنیم.",
      ],
    },
    {
      heading: "تغییرات این سیاست",
      body: [
        "اگر نحوهٔ مدیریت اطلاعات تغییر کند، این متن و تاریخ ابتدای صفحه را به‌روز می‌کنیم و نسخهٔ تازه همراه با به‌روزرسانی بعدی برنامه منتشر می‌شود.",
      ],
    },
    {
      heading: "ارتباط با ما",
      body: [
        SUPPORT_EMAIL
          ? `اگر دربارهٔ این سیاست یا اطلاعاتتان پرسشی دارید، به نشانی ${SUPPORT_EMAIL} ایمیل بزنید تا پاسخ دهیم.`
          : "اگر دربارهٔ این سیاست یا اطلاعاتتان پرسشی دارید، از مسیر تنظیمات ← راهنما و پشتیبانی در خود برنامه برای ما پیام بفرستید تا پاسخ دهیم.",
      ],
    },
  ],
};

const es: PrivacyPolicyDoc = {
  title: "Política de privacidad",
  lastUpdated: "Última actualización: 1 de agosto de 2026",
  intro: [
    "Tally te ayuda a registrar y dividir gastos compartidos con amigos. Esta política explica exactamente qué información recoge la aplicación, por qué la recoge, quién la procesa y qué nos comprometemos a no hacer nunca con ella.",
    "Estás leyendo esto antes de crear una cuenta a propósito: no se envía ninguna información personal a ningún sitio hasta que decidas registrarte o activar la sincronización en la nube.",
  ],
  sections: [
    {
      heading: "Qué recogemos",
      body: [
        "Tally solo recoge lo que cada función necesita realmente. Nada de lo siguiente se recoge salvo que uses la función correspondiente.",
      ],
      bullets: [
        "Correo electrónico: necesario para crear una cuenta, iniciar sesión, confirmar tu dirección y restablecer la contraseña.",
        "Nombre visible (opcional): se muestra a los demás miembros de tus grupos para saber quién pagó qué.",
        "Contraseña: se guarda únicamente como hash con sal en nuestro proveedor de autenticación. Ni nosotros ni nadie puede leer tu contraseña original.",
        "Datos de gastos: nombres de grupos, títulos de gastos, importes, fechas, categorías y cómo se divide cada gasto. Se guardan en tu dispositivo por defecto y solo se suben si activas la sincronización en la nube.",
        "Fotos de tickets y notas de voz: se capturan solo cuando usas activamente las funciones de IA, y sirven únicamente para extraer los conceptos e importes de ese gasto.",
        "Identificador de cuenta y estado de compra: un id interno de usuario y una marca que indica si tienes un pase activo, para que tu compra funcione en todos tus dispositivos.",
        "Diagnósticos de fallos: si la aplicación falla, se envía un informe técnico (mensaje de error, traza, versión de la app, modelo de dispositivo y versión del sistema) a nuestro proveedor de monitorización para poder corregirlo.",
      ],
    },
    {
      heading: "Qué no recogemos nunca",
      body: [
        "Tally no pide ni recibe tu número de teléfono, número de identidad nacional, fecha de nacimiento, dirección postal, datos bancarios o de tarjeta, ubicación precisa, lista de contactos, mensajes SMS ni registro de llamadas. Ninguna función de la aplicación los solicita.",
        "Los pagos los gestiona íntegramente la tienda desde la que instalaste Tally. Nunca vemos los datos de tu tarjeta.",
      ],
    },
    {
      heading: "Por qué la recogemos",
      bullets: [
        "Para crear y proteger tu cuenta y permitirte volver a entrar desde otro dispositivo.",
        "Para sincronizar tus grupos y gastos entre dispositivos cuando activas la sincronización.",
        "Para mostrar el nombre correcto junto a cada gasto al resto de miembros del grupo.",
        "Para convertir tickets y notas de voz en gastos cuando usas las funciones de IA.",
        "Para respetar las compras que has hecho y mantener desbloqueadas las funciones premium.",
        "Para diagnosticar fallos y mejorar la estabilidad de la aplicación.",
      ],
      body: [
        "No usamos tu información para perfilado ni segmentación conductual. Tally muestra anuncios recompensados opcionales — consulta la sección Publicidad más abajo para ver exactamente qué implica y qué no.",
      ],
    },
    {
      heading: "Permisos del dispositivo",
      bullets: [
        "Cámara: para escanear tickets y leer códigos QR de invitación a grupos.",
        "Micrófono: solo mientras grabas una nota de voz para describir un gasto.",
        "Galería de fotos: solo cuando eliges tú mismo una imagen de ticket o un icono de grupo.",
      ],
      body: [
        "Cada permiso se solicita en el momento en que usas por primera vez la función correspondiente, y puedes rechazarlo y seguir usando el resto de la aplicación.",
      ],
    },
    {
      heading: "Funciones de IA",
      body: [
        "Cuando escaneas un ticket o grabas una nota de voz, esa imagen o audio se envía por una conexión cifrada a nuestro servidor, que la reenvía a un proveedor de modelos de IA únicamente para extraer el texto, los conceptos y los importes. El resultado vuelve a tu dispositivo y se rellena en el formulario de gasto.",
        "Ese contenido se usa solo para esa extracción y no se utiliza para entrenar ningún modelo. Aun así, evita enviar tickets o grabaciones con información que prefieras que no procese un proveedor externo.",
      ],
    },
    {
      heading: "Publicidad",
      body: [
        "Tally muestra anuncios recompensados opcionales que puedes elegir ver a cambio de créditos de IA. Ningún anuncio se reproduce automáticamente, y omitir los anuncios nunca bloquea ninguna función.",
        "Los anuncios los proporciona normalmente Google AdMob, salvo en las versiones distribuidas a través de tiendas de aplicaciones iraníes como Cafe Bazaar, donde los servicios publicitarios de Google no están disponibles y es Tapsell quien los proporciona, con los mismos límites descritos a continuación.",
      ],
      bullets: [
        "Ver un anuncio recompensado te da créditos de IA, que se usan en las funciones de escaneo de tickets y notas de voz con IA.",
        "AdMob puede recoger el identificador de publicidad de tu dispositivo y datos de uso generales para seleccionar y medir los anuncios. Consulta la política de anuncios de Google: https://policies.google.com/technologies/ads",
        "En las versiones donde se usa Tapsell en lugar de AdMob, este puede recoger de forma similar el identificador de publicidad de tu dispositivo y datos de uso generales para seleccionar y medir los anuncios.",
        "Nunca se comparte con los anunciantes ningún dato de gastos, grupos, tickets o contactos. El SDK de anuncios solo recibe el id de tu cuenta, y únicamente como identificador de recompensa de un solo uso para confirmar que viste el anuncio.",
        "Puedes rechazar el seguimiento publicitario en cualquier momento, mediante el aviso de seguimiento de iOS o los ajustes de anuncios de tu dispositivo Android, y los anuncios recompensados seguirán funcionando igual.",
        "El uso de la IA sin anuncios está previsto como parte de los pases de Tally, pero aún no está activo: por ahora los anuncios recompensados son totalmente opcionales para todo el mundo, y rechazarlos solo significa que no ganas créditos de IA adicionales.",
      ],
    },
    {
      heading: "Quién procesa tus datos",
      body: [
        "Mantenemos deliberadamente corta la lista de terceros, y cada uno actúa solo como proveedor de infraestructura por cuenta nuestra; ninguno puede usar tus datos para sus propios fines.",
      ],
      bullets: [
        "Supabase: autenticación de la cuenta, base de datos y almacenamiento de sincronización.",
        "Nuestro proveedor de modelos de IA: extracción de tickets y voz, como se describe arriba.",
        "Google AdMob: muestra anuncios recompensados y, solo cuando eliges ver uno, procesa el identificador de publicidad de tu dispositivo. Consulta Publicidad más arriba.",
        "Tapsell: sustituye a AdMob para los anuncios recompensados en las versiones distribuidas a través de tiendas de aplicaciones iraníes; mismo propósito y mismos límites de datos que AdMob.",
        "Sentry: diagnóstico de fallos, configurado para excluir identificadores personales.",
        "La tienda donde compraste (Cafe Bazaar, Google Play o Apple): procesamiento y verificación del pago.",
      ],
    },
    {
      heading: "Nuestro compromiso contigo",
      body: [
        "No vendemos tu información personal. No la alquilamos, intercambiamos ni compartimos con ningún tercero con fines de marketing. No la entregamos a ninguna otra persona u organización, salvo obligación legal derivada de una orden válida.",
        "El acceso a los datos de producción está restringido al desarrollador que mantiene la aplicación, se usa solo para operar y dar soporte al servicio, y todas las peticiones entre la app y nuestros servidores van cifradas con TLS.",
      ],
    },
    {
      heading: "Conservación y borrado",
      body: [
        "Los datos locales permanecen en tu dispositivo hasta que los borres o desinstales la aplicación. Los datos sincronizados se conservan mientras exista tu cuenta.",
        "Puedes desactivar la sincronización en Ajustes, cerrar sesión o borrar los datos locales en cualquier momento. Para eliminar de forma permanente tu cuenta y todos los datos asociados en la nube, contáctanos con los datos de abajo y lo tramitaremos.",
      ],
    },
    {
      heading: "Menores",
      body: [
        "Tally no está dirigida a menores de 13 años y no recogemos conscientemente información de ellos.",
      ],
    },
    {
      heading: "Cambios en esta política",
      body: [
        "Si cambia nuestro tratamiento de datos, actualizaremos este texto y la fecha del encabezado, y se publicará con la siguiente versión de la aplicación.",
      ],
    },
    {
      heading: "Contacto",
      body: [
        SUPPORT_EMAIL
          ? `Si tienes cualquier duda sobre esta política o sobre tus datos, escríbenos a ${SUPPORT_EMAIL} y te responderemos.`
          : "Si tienes cualquier duda sobre esta política o sobre tus datos, usa Ajustes → Ayuda y soporte dentro de la aplicación para escribirnos y te responderemos.",
      ],
    },
  ],
};

export const privacyPolicies: Record<AppLocale, PrivacyPolicyDoc> = {
  en,
  fa,
  es,
};

export function getPrivacyPolicy(locale: AppLocale): PrivacyPolicyDoc {
  return privacyPolicies[locale] ?? en;
}
