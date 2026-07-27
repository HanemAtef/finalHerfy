const nodemailer = require("nodemailer");

const sendVerificationEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Harfey Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "تفعيل الحساب - Harfey",
    html: `
      <h2>مرحبًا بك في حرفي</h2>
      <p>رمز تفعيل حسابك هو: <strong>${otp}</strong></p>
      <p>هذا الرمز صالح لمدة <strong>10 دقائق</strong>.</p>
      <p>إذا لم تقم بإنشاء هذا الحساب، تجاهل هذه الرسالة.</p>
    `,
  });
};

module.exports = sendVerificationEmail;
