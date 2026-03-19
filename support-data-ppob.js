const nodemailer = require("nodemailer");
const client = require("./mysql");
const moment = require("moment");
require("dotenv").config();
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
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

const mailOptions = {
  from: {
    name: "Product RTS",
    address: process.env.EMAIL,
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
    const query = `SELECT th.TANGGAL, th.NamaReseller, th.JAM, p.NAMAPRODUK, th.IdTransaksiClient, th.idtransaksi, p.KodeProduk, th.Tujuan, th.HARGAJUAL, th.HARGABELI, th.STATUSTRANSAKSI, th.SN, mr.email, th.namaterminal, th.JENISTRANSAKSI 
      FROM transaksi th
      JOIN produk p
      ON p.KodeProduk = th.KodeProduk
      JOIN masterreseller mr
      ON mr.idreseller = th.IDRESELLER
      WHERE TANGGAL = ?
      `;
    // Get yesterday's date
    const values = [yesterday];

    const rows = db.query(query, values).stream();

    worksheet.columns = [
      { header: "Date", key: "date", width: 30 },
      { header: "Trx Reff Id", key: "trxReffId", width: 30 },
      { header: "Partner Reff", key: "partnerReff", width: 30 },
      { header: "Transaction Date", key: "transactionDate", width: 30 },
      { header: "Nama Reseller", key: "namaReseller", width: 30 },
      { header: "Tujuan", key: "tujuan", width: 30 },
      { header: "Kode Produk", key: "kodeProduk", width: 30 },
      { header: "Product Name", key: "productName", width: 30 },
      { header: "Harga Beli", key: "hargaBeli", width: 30 },
      { header: "Harga Jual", key: "hargaJual", width: 30 },
      { header: "Status", key: "status", width: 30 },
      { header: "Serial Number", key: "serialNumber", width: 30 },
      { header: "Nama Terminal", key: "namaTerminal", width: 30 },
      { header: "Begin Balance", key: "beginBalance", width: 30 },
      { header: "Email Reseller", key: "emailReseller", width: 30 },
      { header: "Jenis Transaksi", key: "jenisTransaksi", width: 30 },
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

    for await (const row of rows) {
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

      const getJenisTransaksi = (jenisTransaksi) => {
        if (jenisTransaksi === "1") {
          return "BELI";
        } else if (jenisTransaksi === "5") {
          return "CEK";
        } else if (jenisTransaksi === "6") {
          return "BAYAR";
        } else {
          return "LAINNYA";
        }
      };

      worksheet.addRow({
        date: formatTanggal,
        trxReffId: row.idtransaksi,
        partnerReff: row.IdTransaksiClient,
        transactionDate: `${formatTanggal} ${formatJam}`,
        namaReseller: row.NamaReseller,
        tujuan: row.Tujuan,
        kodeProduk: row.KodeProduk,
        productName: row.NAMAPRODUK,
        hargaBeli: row.HARGABELI,
        hargaJual: row.HARGAJUAL,
        status: row.STATUSTRANSAKSI === 1 ? "SUKSES" : "GAGAL",
        serialNumber: row.SN,
        namaTerminal: row.namaterminal,
        beginBalance: getBalance(
          row.STATUSTRANSAKSI,
          row.NamaReseller,
          row.HARGAJUAL,
        ),
        emailReseller: row.email,
        jenisTransaksi: getJenisTransaksi(row.JENISTRANSAKSI),
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
    }

    worksheet.getColumn("I").numFmt = '"Rp"#,##0';
    worksheet.getColumn("J").numFmt = '"Rp"#,##0';
    worksheet.getColumn("N").numFmt = '"Rp"#,##0';

    const fileName = `FILE DATABASE PPOB ${moment(yesterday).format(
      "DDMMYYYY",
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

console.log("Cron job started" + moment().format("YYYY-MM-DD HH:mm:ss"));

cron.schedule("1 9 * * *", async () => {
  await sendEmail();
});

// (async () => {
//   await sendEmail();
// })();
