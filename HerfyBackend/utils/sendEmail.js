const nodemailer = require("nodemailer");

const sendEmail = async (email, otp) => {
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
    subject: "Password Reset OTP - Harfey",
    html: `
      <h2>Password Reset Request</h2>
      <p>Your OTP code is: <strong>${otp}</strong></p>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  });
};

module.exports = sendEmail;