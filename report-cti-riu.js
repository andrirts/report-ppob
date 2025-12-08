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
    const query = `SELECT th.TANGGAL, th.NamaReseller, th.JAM, p.NAMAPRODUK, th.IdTransaksiClient, th.idtransaksi, p.KodeProduk, th.Tujuan, th.HARGABELI, th.STATUSTRANSAKSI, th.SN, mr.email, th.namaterminal, th.HARGAJUAL 
      FROM transaksi th
      JOIN produk p
      ON p.KodeProduk = th.KodeProduk
      JOIN masterreseller mr
      ON mr.idreseller = th.IDRESELLER
      WHERE TANGGAL = ?
      AND p.KodeProduk IN ('TDF500','TDF1','TDF2','TD2.5GB5D','TD3GB5D','TD7GB7D','TD10GB30D','TD5GB30D','TD15GB30D','TD5GB30DR','TD15GB30DR','TD5GB30DC','TD15GB30DC')
      `;
    // Get yesterday's date
    const values = [yesterday];

    const [rows] = await db.query(query, values);

    worksheet.columns = [
      { header: "IDTRX", key: "trxReffId", width: 30 },
      { header: "ReffClient", key: "partnerReff", width: 30 },
      { header: "Waktu Trx", key: "transactionDate", width: 30 },
      { header: "Nama Reseller", key: "namaReseller", width: 30 },
      { header: "Tujuan", key: "tujuan", width: 30 },
      { header: "Produk", key: "productName", width: 30 },
      { header: "Harga", key: "harga", width: 30 },
      { header: "Status", key: "status", width: 30 },
      { header: "Serial Number", key: "serialNumber", width: 30 },
      { header: "Date", key: "date", width: 30 },
      { header: "Final Status", key: "finalStatus", width: 30 },
      { header: "Serial Number", key: "finalSerialNumber", width: 30 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    worksheet.getRow(1).eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    rows.forEach((row) => {
      const formatTanggal = moment(row.TANGGAL).format("YYYY-MM-DD");
      const formatJam = moment(row.JAM, "HH:mm:ss").format("HH:mm:ss");

      const getResellerName = (resellerName) => {
        const resellerList = ["PT VIA YOTTA BYTE", "PT SATRIA ABADI TERPADU"];
        if (resellerList.includes(resellerName)) {
          return resellerName;
        } else {
          return "RTS";
        }
      };
      const getPrice = (resellerName) => {
        const resellerList = ["PT VIA YOTTA BYTE", "PT SATRIA ABADI TERPADU"];
        if (resellerList.includes(resellerName)) {
          return row.HARGAJUAL;
        } else {
          return row.HARGABELI;
        }
      };
      worksheet.addRow({
        date: formatTanggal,
        transactionDate: `${formatTanggal} ${formatJam}`,
        namaReseller: getResellerName(row.NamaReseller),
        productName: row.NAMAPRODUK,
        partnerReff: row.IdTransaksiClient,
        trxReffId: row.idtransaksi,
        tujuan: row.Tujuan,
        harga: getPrice(row.NamaReseller),
        status: row.STATUSTRANSAKSI === 1 ? "SUKSES" : "GAGAL",
        serialNumber: row.SN,
        finalStatus: "",
        finalSerialNumber: "",
      });

      worksheet.getRow(worksheet.lastRow.number).eachCell((cell) => {
        cell.font = { name: "Tahoma", size: 8 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    worksheet.getColumn("G").numFmt = '"Rp"#,##0';

    const fileName = `Report Telkomsel ${moment(yesterday).format(
      "DD MMMM YYYY"
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
        filename: `Report Telkomsel ${dateSubject}.xlsx`,
        path: `./Report Telkomsel ${dateSubject}.xlsx`,
      },
    ];
    mailOptions.subject = `Transaksi CTI-RIU-Nexzen-GST Tanggal ${dateSubject}`;
    mailOptions.html = `<p>Dear Tim Ops,<br><br> Berikut kami lampirkan data transaksi CTI-RIU-Nexzen-GST untuk tanggal ${dateSubject}.<br><br>Terima kasih.</p>
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
    fs.unlinkSync(`./Report Telkomsel ${dateSubject}.xlsx`);

    console.log("Script finished at " + moment().format("YYYY-MM-DD HH:mm:ss"));
  } catch (err) {
    console.error("Error:", err);
  }
};

console.log("Cron job started");

cron.schedule("5 9 * * *", async () => {
  await sendEmail();
});

// (async () => {
//   await sendEmail();
// })();
