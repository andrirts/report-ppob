const nodemailer = require("nodemailer");
const client = require("./db");
const moment = require("moment");
const ENV = require("./env");
const ExcelJs = require("exceljs");
require("dotenv").config();
const fs = require("fs");
const cron = require("node-cron");

//Set moment to indonesia
moment.locale("id");

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
  to: ["operation@rts.id"],
  cc: ["ops@rts.id", "prod@rts.id"],
};

const sendMail = async (transporter, mailOptions) => {
  try {
    await transporter.sendMail(mailOptions);
    console.log("Email has been sent");
  } catch (err) {
    console.log(err);
  }
};

const getDataFromDatabase = async (yesterday) => {
  console.log("Script run at " + moment().format("YYYY-MM-DD HH:mm:ss"));
  const workbook = new ExcelJs.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  try {
    const db = await client();
    const query = `SELECT th.TANGGAL, th.NamaReseller, th.JAM, p.NAMAPRODUK, th.IdTransaksiClient, th.idtransaksi, p.KodeProduk, th.Tujuan, th.HARGAJUAL, th.STATUSTRANSAKSI, th.SN, mr.email 
      FROM transaksi th
      JOIN produk p
      ON p.KodeProduk = th.KodeProduk
      JOIN masterreseller mr
      ON mr.idreseller = th.IDRESELLER
      WHERE TANGGAL = ?
      `;
    // Get yesterday's date
    const values = [yesterday];

    const [rows] = await db.query(query, values);

    worksheet.columns = [
      { header: "Date", key: "date", width: 30 },
      { header: "Transaction Date", key: "transactionDate", width: 30 },
      { header: "Nama Reseller", key: "namaReseller", width: 30 },
      { header: "Product Name", key: "productName", width: 30 },
      { header: "Partner Reff", key: "partnerReff", width: 30 },
      { header: "Trx Reff Id", key: "trxReffId", width: 30 },
      { header: "Kode Produk", key: "kodeProduk", width: 30 },
      { header: "Tujuan", key: "tujuan", width: 30 },
      { header: "Harga", key: "harga", width: 30 },
      { header: "Status", key: "status", width: 30 },
      { header: "Serial Number", key: "serialNumber", width: 30 },
      { header: "Begin Balance", key: "beginBalance", width: 30 },
      { header: "Email Reseller", key: "emailReseller", width: 30 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { horizontal: "center" };
    worksheet.getRow(1).eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    const resellerBalance = {};

    rows.forEach((row) => {
      const formatTanggal = moment(row.TANGGAL).format("YYYY-MM-DD");
      const formatJam = moment(row.JAM, "HH:mm:ss").format("HH:mm:ss");

      const getBalance = (statusTransaksi, namaReseller, harga) => {
        if (statusTransaksi === 1) {
          if (!resellerBalance[namaReseller]) {
            resellerBalance[namaReseller] = harga;
          } else {
            resellerBalance[namaReseller] += harga;
          }
        } else {
          if (!resellerBalance[namaReseller]) {
            resellerBalance[namaReseller] = 0;
          }
        }
        return resellerBalance[namaReseller];
      };

      worksheet.addRow({
        date: formatTanggal,
        transactionDate: `${formatTanggal} ${formatJam}`,
        namaReseller: row.NamaReseller,
        productName: row.NAMAPRODUK,
        partnerReff: row.IdTransaksiClient,
        trxReffId: row.idtransaksi,
        kodeProduk: row.KodeProduk,
        tujuan: row.Tujuan,
        harga: row.HARGAJUAL,
        status: row.STATUSTRANSAKSI === 1 ? "Success" : "Failed",
        serialNumber: row.SN,
        beginBalance: getBalance(
          row.STATUSTRANSAKSI,
          row.NamaReseller,
          row.HARGAJUAL
        ),
        emailReseller: row.email,
      });

      worksheet.getRow(worksheet.lastRow.number).eachCell((cell) => {
        cell.font = { name: "Tahoma", size: 8 };
        cell.alignment = { horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    worksheet.getColumn("I").numFmt = '"Rp"#,##0';
    worksheet.getColumn("L").numFmt = '"Rp"#,##0';

    const fileName = `FILE DATABASE PPOB ${moment(yesterday).format(
      "DDMMYYYY"
    )}.xlsx`;
    await workbook.xlsx.writeFile(fileName);
    console.log(`File saved as ${fileName}`);

    db.end();
  } catch (err) {
    console.error("Error fetching data from database:", err);
    throw err;
  }
};

const sendEmail = async () => {
  try {
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
    const nameYesterday = moment().subtract(1, "days").format("DDMMYYYY");
    const dateSubject = moment().subtract(1, "days").format("DD MMMM YYYY");
    await getDataFromDatabase(yesterday);
    mailOptions.attachments = [
      {
        filename: `FILE DATABASE PPOB ${nameYesterday}.xlsx`,
        path: `./FILE DATABASE PPOB ${nameYesterday}.xlsx`,
      },
    ];
    mailOptions.subject = `Transaksi PPOB Tanggal ${dateSubject}`;
    mailOptions.html = `<p>Dear Team Ops,<br><br> Berikut kami lampirkan data transaksi PPOB untuk tanggal ${dateSubject}.<br><br>Terima kasih.</p>
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
    console.log("Mengirimkan data");
    await transporter.sendMail(mailOptions);
    console.log("Data berhasil dikirim");
    fs.unlinkSync(`./FILE DATABASE PPOB ${nameYesterday}.xlsx`);

    console.log("Script finished at " + moment().format("YYYY-MM-DD HH:mm:ss"));
  } catch (err) {
    console.error("Error:", err);
  }
};

console.log("Cron job started");

cron.schedule("0 9 * * *", async () => {
  await sendEmail();
});

// (async () => {
//   await sendEmail();
// })();
