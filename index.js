const nodemailer = require("nodemailer");
const client = require("./db");
const moment = require("moment");
const cron = require("node-cron");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

const mailOptions = {
  from: {
    name: "Product RTS",
    address: process.env.EMAIL,
  },
  to: ["prod@rts.id", "biz@rts.id", "ops@rts.id", "sm@rts.id"],
  subject: "RTS Sync : PPOB Transactions Summary",
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
    const summaryPerMonth = `
        SELECT masterreseller.NAMARESELLER, 
        COUNT(idtransaksi) as JumlahTransaksi, 
        COALESCE(SUM(HARGAJUAL-HARGABELI), 0) as Total
        FROM masterreseller
        LEFT JOIN transaksi_his
        ON transaksi_his.NamaReseller = masterreseller.NAMARESELLER
        AND TANGGAL BETWEEN ? AND ?
        and transaksi_his.STATUSTRANSAKSI = 1
        and (transaksi_his.JENISTRANSAKSI in (0,1,6))
        and transaksi_his.NamaReseller not regexp 'DEV|TEST'
        GROUP BY NamaReseller
        ORDER BY JumlahTransaksi DESC;`;
    const summaryPerDay = `
        SELECT masterreseller.NAMARESELLER, 
        COUNT(idtransaksi) as JumlahTransaksi, 
		    COALESCE(SUM(HARGAJUAL-HARGABELI), 0) as Total
        FROM masterreseller 
        LEFT JOIN transaksi
        ON transaksi.NamaReseller = masterreseller.NAMARESELLER
        AND TANGGAL = ?
        and transaksi.STATUSTRANSAKSI = 1
		    and (transaksi.JENISTRANSAKSI in (0,1,6))
        and transaksi.NamaReseller not regexp 'DEV|TEST'
        GROUP BY masterreseller.NAMARESELLER
        ORDER BY JumlahTransaksi desc;`;
    const startOfMonth = moment()
      .subtract(1, "days")
      .startOf("month")
      .format("YYYY-MM-DD");
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
    const values = [startOfMonth, yesterday];
    const [rowsSummaryPerMonth] = await db.query(summaryPerMonth, values);
    const [rowsSummaryPerDay] = await db.query(summaryPerDay, yesterday);
    const dataPerMonth = await generateEmailData(rowsSummaryPerMonth);
    const dataPerDay = await generateEmailData(rowsSummaryPerDay);
    const emailBody = `
            <p><b>Dear Team RTS<b>,</p>
            <p>Summary Daily Transaction PPOB through RTS Sync : <strong>${moment(
              yesterday
            ).format("DD/MM/YYYY")}</strong></p>
            ${dataPerDay}
            <p>Summary Monthly Transaction PPOB through RTS Sync : <strong>MTD ${moment(
              startOfMonth
            ).format("MMM YYYY")}</strong></p>
            ${dataPerMonth}
            <p>Best regards,</p>
            <p>Product RTS</p>
            `;
    await sendMail(transporter, { ...mailOptions, html: emailBody });
    await db.end();
  } catch (err) {
    console.log(err);
    await db.end();
  }
};

const generateEmailData = async (data) => {
  let table = `
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">
      <thead>
        <tr>
          <th>Client</th>
          <th>Transactions</th>
          <th>Revenue RTS</th>
        </tr>
      </thead>
      <tbody>`;

  data.forEach((item) => {
    table += `
      <tr>
        <td>${item.NAMARESELLER}</td>
        <td>${item.JumlahTransaksi}</td>
        <td>${item.Total}</td>
      </tr>`;
  });
  let totalTransactions = data.reduce(
    (acc, item) => acc + item.JumlahTransaksi,
    0
  );
  let totalRevenue = data.reduce((acc, item) => acc + item.Total, 0);

  let formattedTotalRevenue = new Intl.NumberFormat("de-DE").format(
    totalRevenue
  );
  table += `
        <tr style="border: 1px solid black;">
          <td style="border: 1px solid black;"><strong>Total</strong></td>
          <td style="border: 1px solid black;"><strong>${totalTransactions.toLocaleString()}</strong></td>
          <td style="border: 1px solid black;"><strong>${formattedTotalRevenue}</strong></td>
        </tr>
        `;
  table += `
      </tbody>
    </table>`;

  return table;
};

console.log("Scheduling daily email at 08:00 AM");

cron.schedule("0 8 * * *", async () => {
  await getDataFromDatabase();
});

// (async () => {
//   await getDataFromDatabase();
// })();
