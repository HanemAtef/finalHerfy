require('dotenv').config();
const nodemailer = require('nodemailer');

const test = async () => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    console.log("transporter created with user:", process.env.EMAIL_USER);
    await transporter.sendMail({
      from: `"Harfey Support" <${process.env.EMAIL_USER}>`,
      to: "test@example.com",
      subject: "تفعيل الحساب - Harfey",
      html: `<h2>مرحبًا بك في حرفي</h2>`,
    });
    console.log("Email sent successfully!");
  } catch (err) {
    console.error("Email send failed:", err);
  }
};
test();
