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

const sendEmail = async (email, otp) => {
  try {
    await getTransporter().sendMail({
      from: `"Harfey Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset OTP - Harfey",
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>Your OTP code is: <strong style="font-size: 24px; color: #4CAF50;">${otp}</strong></p>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
    console.log(` Password reset email sent to ${email}`);
  } catch (err) {
    console.error(` Failed to send reset email to ${email}:`, err.message);
  }
};

module.exports = sendEmail;