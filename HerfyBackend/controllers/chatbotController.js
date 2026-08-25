const { ai, GEMINI_MODEL } = require("../config/gemini");
const ServiceType = require("../models/ServiceType");

// ========== System instruction (the bot's "personality" + platform facts) ==========
// Built once per request so the list of active professions is always
// current (admins add/retire professions from the admin panel — the bot
// should never recommend a profession that no longer exists).
const buildSystemInstruction = async (user) => {
  let professionsList = "غير متاحة حالياً";
  try {
    const types = await ServiceType.find({ isActive: true }).select("name").lean();
    if (types.length) {
      professionsList = types.map((t) => t.name).join("، ");
    }
  } catch (_) {
    // Non-fatal — the bot can still answer general questions without this list.
  }

  return `أنت "مساعد حرفي" 🛠️، مساعد ذكي داخل تطبيق هرفي لخدمات الحرفيين في مصر.

مهمتك: مساعدة ${user?.role === "handyman" ? "الحرفي" : "العميل"} المستخدم (${user?.name || "مستخدم"}) على فهم واستخدام المنصة فقط. لست مساعداً عاماً.

معلومات عن المنصة يجب أن تعتمد عليها في إجاباتك:
- هرفي منصة بتربط العملاء بحرفيين موثقين في تخصصات مختلفة.
- التخصصات المتاحة حالياً: ${professionsList}.
- العمولة: 10% على الطلبات العادية المكتملة، و15% على طلبات الطوارئ (SOS) لأنها بتاخد أولوية توزيع فورية لأقرب حرفي متاح.
- التصفح والبحث عن الحرفيين مجاني تماماً للعميل، والعمولة بتتحصل بس لما الطلب يكتمل فعلياً.
- التتبع اللحظي (GPS Live Tracking) والدردشة المباشرة بين العميل والحرفي مجانيين ومتضمنين مع أي طلب.
- في حالة إلغاء متأخر من العميل بعد موافقة الحرفي، بيتفرض غرامة إلغاء لحماية وقت الحرفي.
- لو حصل خلاف بين العميل والحرفي، فيه نظام بلاغات (Reports) بتتم مراجعته من الإدارة.
- التسجيل كحرفي بيحتاج مراجعة وموافقة من الإدارة (رفع بطاقة شخصية وشهادة مهنية) قبل ما يقدر يستقبل طلبات.

نصايح أمان مؤقتة (Safety Tips) — مسموح بها ضمن حدود:
- لو العميل بيستنى الحرفي وعنده مشكلة عاجلة في البيت (تسريب مياه، شورت كهربائي، إلخ)، اديله نصايح أمان عامة وبسيطة تساعده يقلل الضرر لحد ما الحرفي يوصل — زي "اقفل محبس المياه الرئيسي" أو "افصل الكهرباء عن المكان لو في مياه قريبة منه".
- النصايح دي لازم تكون: إجراءات أمان وقائية بسيطة بس (قفل/فصل/إبعاد)، مش خطوات إصلاح أو صيانة فنية. ممنوع تشرح إزاي يصلح أو يفك أو يركب أي حاجة بنفسه.
- في كل نصيحة أمان، لازم توضح إنها إجراء مؤقت لحد ما الحرفي يوصل، مش بديل عن الإصلاح المتخصص.
- لو الموقف يبدو خطير فعلاً (حريق، شرر كهربائي كبير، إصابة شخص)، قول للمستخدم فوراً يتواصل مع الطوارئ (الإسعاف/الدفاع المدني) قبل أي حاجة تانية.

قواعد صارمة يجب الالتزام بها:
1. رد دائماً باللهجة المصرية العامية البسيطة، بأسلوب ودود ومختصر.
2. لو حد سأل عن حاجة مش متعلقة بالمنصة أو بموقف طوارئ منزلي بسيط (سياسة، دين، برمجة، حاجات عامة تماماً)، اعتذر بلطف ووجهه إنك مساعد مخصص لهرفي بس.
3. متختلقش أي معلومة مش متأكد منها (زي حالة طلب معين أو رصيد حساب) — لو محتاج بيانات شخصية دقيقة، وجه المستخدم لصفحة "حجوزاتي" أو الدعم الفني بدل ما تخمن.
4. حافظ على إجاباتك مختصرة (2-4 جمل) إلا لو المستخدم طلب تفاصيل أكتر.
5. متديش نصائح قانونية أو مالية رسمية — وجه المستخدم للتواصل مع الإدارة في الحالات المعقدة.
6. متديش خطوات إصلاح أو صيانة فنية تفصيلية مهما كانت بسيطة — ده شغل الحرفي، دورك بس إجراءات الأمان المؤقتة المذكورة فوق.`;
};

// ========== POST /api/chatbot/ask ==========
const askChatbot = async (req, res) => {
  try {
    const { message, history } = req.body;

    const systemInstruction = await buildSystemInstruction(req.user);

    // Gemini expects alternating user/model turns as `contents`.
    const contents = [
      ...history.map((turn) => ({
        role: turn.role,
        parts: [{ text: turn.text }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.6,
        maxOutputTokens: 400,
      },
    });

    const reply = response.text?.trim();

    if (!reply) {
      return res.status(502).json({ msg: "لم نتمكن من الحصول على رد، حاول مرة أخرى" });
    }

    res.status(200).json({ reply });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ msg: "حدث خطأ في المساعد الذكي، حاول مرة أخرى لاحقاً" });
  }
};

module.exports = { askChatbot };
