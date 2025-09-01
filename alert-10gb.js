const nodemailer = require("nodemailer");
const client = require("./db");
const moment = require("moment");
const ENV = require("./env");
const fs = require("fs");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: ENV.EMAIL,
    pass: ENV.PASSWORD,
  },
});

const mailOptions = {
  from: {
    name: "Product RTS",
    address: ENV.EMAIL,
  },
  to: ["prod@rts.id"],
  subject: "RTS Sync: Alert 10 GB Stock ",
};

const sendMail = async (transporter, mailOptions) => {
  try {
    await transporter.sendMail(mailOptions);
    console.log("Email has been sent");
  } catch (err) {
    console.log(err);
  }
};

const getDataFromDatabase = async () => {
  console.log("Script run at " + moment().format("YYYY-MM-DD HH:mm:ss"));
  const db = await client();
  try {
    console.log("starting query");
    mailOptions.html = `<p>Dear Team,<br><br> Transaksi untuk produk 10 GB sudah melebihi 20.000 transaksi, mohon dibantu pengecekan untuk stocknya <br>

<br>
<br>Terima kasih.</p>
    <table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333; line-height: 1.3;">
  <tr>
    <td><strong style="font-size: 13px;">Salam,</strong></td>
  </tr>
  <tr>
    <td style="padding: 2px 0 0 0;">
      <strong style="font-size: 16px; color: #333;">Product & Solution</strong>
    </td>
  </tr>
  <tr>
    <td><span style="color: #5c9bd3;">PT. Rajawali Telekomunikasi Selular</span></td>
  </tr>
  <tr>
    <td>0811-1987-827</td>
  </tr>
  <tr>
    <td>
      <a href="https://rts.id" style="color: #0073e6; text-decoration: none;">https://rts.id</a>
    </td>
  </tr>
  <tr>
    <td>Atria @Sudirman - Lt. 22, Jakarta Pusat, Indonesia 10220</td>
  </tr>
</table>
`;
    const countSuccessTransaction = `
    SELECT 
        (SELECT COUNT(idtransaksi)
        FROM avr.transaksi
        WHERE KodeProduk = 'TD10GB30D'
        AND YEAR(tanggal) = YEAR(CURDATE())
        AND MONTH(tanggal) = MONTH(CURDATE())
        and STATUSTRANSAKSI = 1)
        + 
        (SELECT COUNT(idtransaksi)
        FROM avr.transaksi_his
        WHERE KodeProduk = 'TD10GB30D'
        AND YEAR(tanggal) = YEAR(CURDATE())
        AND MONTH(tanggal) = MONTH(CURDATE())
        and STATUSTRANSAKSI = 1)
    AS total_transaksi;
    `;
    const [totalSuccessTransaction] = await db.query(countSuccessTransaction);
    console.log(
      "TOTAL TRANSACTION",
      totalSuccessTransaction[0].total_transaksi
    );
    console.log("query finished", moment().format("YYYY-MM-DD HH:mm:ss"));
    if (totalSuccessTransaction[0].total_transaksi > 20000) {
      await sendMail(transporter, mailOptions);
    }
    console.log("Finished query", moment().format("YYYY-MM-DD HH:mm:ss"));
    await db.end();
  } catch (err) {
    console.log(err);
    await db.end();
  }
};

// cron.schedule("5 8 * * *", async () => {
//   await getDataFromDatabase();
// });

// (async () => {
//   await getDataFromDatabase();
// })();

// Run this script every 10 minute but not using cron, and when the first time run it should be running
(async () => {
  await getDataFromDatabase();
  setInterval(async () => {
    await getDataFromDatabase();
  }, 10 * 60 * 1000);
})();
