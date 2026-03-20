const nodemailer = require("nodemailer");
const client = require("./mysql");
const moment = require("moment");
require("dotenv").config();
const ExcelJs = require("exceljs");
const fs = require("fs");
const cron = require("node-cron");

// Set moment to Indonesia
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
  // to: ["andri@rts.id"], // adjust as needed
};

const getDataFromDatabase = async (yesterday) => {
  console.log("Script run at " + moment().format("YYYY-MM-DD HH:mm:ss"));

  const fileName = `FILE DATABASE PPOB ${moment(yesterday).format("DDMMYYYY")}.xlsx`;

  const workbook = new ExcelJs.stream.xlsx.WorkbookWriter({
    filename: fileName,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet("Sheet1");

  try {
    const db = await client();

    const query = `
      SELECT th.TANGGAL, th.NamaReseller, th.JAM, p.NAMAPRODUK, 
             th.IdTransaksiClient, th.idtransaksi, p.KodeProduk, 
             th.Tujuan, th.HARGAJUAL, th.HARGABELI, th.STATUSTRANSAKSI, 
             th.SN, mr.email, th.namaterminal, th.JENISTRANSAKSI 
      FROM transaksi th
      JOIN produk p ON p.KodeProduk = th.KodeProduk
      JOIN masterreseller mr ON mr.idreseller = th.IDRESELLER
      WHERE TANGGAL = ?
    `;

    const rows = db.query(query, [yesterday]).stream();

    worksheet.columns = [
      { header: "Date", key: "date", width: 20 },
      { header: "Trx Reff Id", key: "trxReffId", width: 25 },
      { header: "Partner Reff", key: "partnerReff", width: 25 },
      { header: "Transaction Date", key: "transactionDate", width: 25 },
      { header: "Nama Reseller", key: "namaReseller", width: 25 },
      { header: "Tujuan", key: "tujuan", width: 25 },
      { header: "Kode Produk", key: "kodeProduk", width: 20 },
      { header: "Product Name", key: "productName", width: 25 },
      { header: "Harga Beli", key: "hargaBeli", width: 20 },
      { header: "Harga Jual", key: "hargaJual", width: 20 },
      { header: "Status", key: "status", width: 15 },
      { header: "Serial Number", key: "serialNumber", width: 25 },
      { header: "Nama Terminal", key: "namaTerminal", width: 25 },
      { header: "Begin Balance", key: "beginBalance", width: 20 },
      { header: "Email Reseller", key: "emailReseller", width: 30 },
      { header: "Jenis Transaksi", key: "jenisTransaksi", width: 20 },
    ];

    // Header styling
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center" };
    headerRow.eachCell((cell) => {
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

      const getBalance = (status, reseller, harga) => {
        if (status === 1) {
          resellerBalance[reseller] = (resellerBalance[reseller] || 0) + harga;
        } else {
          resellerBalance[reseller] = resellerBalance[reseller] || 0;
        }
        return resellerBalance[reseller];
      };

      const getJenisTransaksi = (jenis) => {
        switch (jenis) {
          case "1":
            return "BELI";
          case "5":
            return "CEK";
          case "6":
            return "BAYAR";
          default:
            return "LAINNYA";
        }
      };

      const rowExcel = worksheet.addRow({
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

      // Apply styling BEFORE commit
      rowExcel.eachCell((cell) => {
        cell.font = { name: "Tahoma", size: 8 };
        cell.alignment = { horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      rowExcel.commit();
    }

    // Column formatting
    worksheet.getColumn("I").numFmt = '"Rp"#,##0';
    worksheet.getColumn("J").numFmt = '"Rp"#,##0';
    worksheet.getColumn("N").numFmt = '"Rp"#,##0';

    await workbook.commit(); // ✅ correct for streaming

    console.log(`File saved as ${fileName}`);

    db.end();

    return fileName;
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

    const fileName = await getDataFromDatabase(yesterday);

    mailOptions.attachments = [
      {
        filename: fileName,
        path: `./${fileName}`,
      },
    ];

    mailOptions.subject = `Transaksi PPOB Tanggal ${dateSubject}`;
    mailOptions.html = `<p>Dear Team Ops,<br><br>
      Berikut kami lampirkan data transaksi PPOB untuk tanggal ${dateSubject}.<br><br>
      Terima kasih.</p>`;

    console.log("Mengirimkan data...");
    await transporter.sendMail(mailOptions);

    console.log("Data berhasil dikirim");

    fs.unlinkSync(`./${fileName}`);

    console.log("Script finished at " + moment().format("YYYY-MM-DD HH:mm:ss"));
  } catch (err) {
    console.error("Error:", err);
  }
};

console.log("Cron job started " + moment().format("YYYY-MM-DD HH:mm:ss"));

cron.schedule("1 9 * * *", async () => {
  await sendEmail();
});

// Run immediately (optional)
// (async () => {
//   await sendEmail();
// })();
