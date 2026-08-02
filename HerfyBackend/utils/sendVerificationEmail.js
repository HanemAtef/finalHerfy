const nodemailer = require("nodemailer");

let transporter;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
};

const sendVerificationEmail = async (email, otp) => {
  try {
    await getTransporter().sendMail({
      from: `"Harfey Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "تفعيل الحساب - Harfey",
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
          <h2>مرحبًا بك في حرفي</h2>
          <p>رمز تفعيل حسابك هو: <strong style="font-size: 24px; color: #4CAF50;">${otp}</strong></p>
          <p>هذا الرمز صالح لمدة <strong>10 دقائق</strong>.</p>
          <p>إذا لم تقم بإنشاء هذا الحساب، يرجى تجاهل هذه الرسالة.</p>
        </div>
      `,
    });
    console.log(`✅ Verification email sent to ${email}`);
  } catch (err) {
    console.error(`❌ Failed to send verification email to ${email}:`, err.message);
  }
};

module.exports = sendVerificationEmail;
