const nodemailer = require("nodemailer");
const client = require("./db");
const moment = require("moment");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const ExcelJs = require("exceljs");
const cron = require("node-cron");

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
  to: ["aris.riadi@finnet.co.id", "argy@finnet.co.id", "sherin@finnet.co.id"],
  cc: [
    "prod@rts.id",
    "biz@rts.id",
    "fakhrudin@rts.id",
    "ananto@rts.id",
    "finoperation@rts.id",
    "ita.widyarini@gmail.com",
    "eko@rts.id",
    "zabil@rts.id",
    "bagus@rts.id",
    "heri@rts.id",
    "mnaseem@rts.id",
    "m.yusuf@rts.id",
  ],
  subject: "Handling RC 14 Finnet",
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
  const workbook = new ExcelJs.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");
  const db = await client();
  try {
    console.log("starting query");
    const summaryPerDay = `
        SELECT idtransaksi,TANGGAL ,JAM , Tujuan , KodeProduk , NamaReseller , keterangan
        FROM avr.transaksi
        where TANGGAL = ?
        and keterangan like "%RESULTCODE:14%";`;
    const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
    const values = [yesterday];
    const [rowsSummaryPerDay] = await db.query(summaryPerDay, values);

    worksheet.columns = [
      { header: "Timestamp", key: "TanggalJam", width: 30 },
      { header: "Nomor ID Customer", key: "NomorIDCustomer", width: 30 },
      { header: "Nama Product", key: "NamaProduct", width: 30 },
      { header: "Partner/Mitra", key: "PartnerMitra", width: 30 },
      { header: "Rc_Channel", key: "Rc_Channel", width: 30 },
      { header: "RC_DESC", key: "RC_DESC", width: 30 },
      { header: "Trax Id", key: "TraxId", width: 30 },
    ];

    worksheet.getRow(1).font = { bold: true };

    rowsSummaryPerDay.forEach((row) => {
      const formatTanggal = moment(row.TANGGAL).format("YYYY-MM-DD");
      const formatJam = moment(row.JAM, "HH:mm:ss").format("HH:mm:ss");
      worksheet.addRow({
        TanggalJam: `${formatTanggal} ${formatJam}`,
        NomorIDCustomer: row.Tujuan,
        NamaProduct:
          row.KodeProduk == "TDF500"
            ? "500 MB"
            : row.KodeProduk == "TDF1"
            ? "1 GB"
            : row.KodeProduk == "TDF2"
            ? "2 GB"
            : row.KodeProduk,
        PartnerMitra: row.NamaReseller,
        Rc_Channel: "14",
        RC_DESC:
          "MAAF, TRANSAKSI ANDA DITOLAK KARENA NOMOR ATAU KODE BAYAR TIDAK TERDAFTAR. -14",
        TraxId: row.idtransaksi,
      });
    });

    const fileName = `RC_14_${yesterday}.xlsx`;
    await workbook.xlsx.writeFile(fileName);
    console.log(`File saved as ${fileName}`);
    mailOptions.attachments = [
      {
        filename: fileName,
        path: `./${fileName}`,
      },
    ];

    mailOptions.html = `<p>Dear Team,<br><br>Kami mohon bantuan Tim Finnet untuk menindaklanjuti pengecekan detail deskripsi dan status transaksi dengan Response Code (RC) 14 pada transaksi ${yesterday} sesuai lampiran terlampir.<br>Mohon data dilengkapi dan dikirimkan kembali untuk analisis dan tindak lanjut kami.
    <br>Adapun yang perlu dilengkapi antara lain <br>
    - RC Channel<br>
    - Description<br>
    - RC Biller<br>
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

    await sendMail(transporter, mailOptions);

    await fs.promises.unlink(`./${fileName}`);

    console.log("Email with attachment has been sent");
    console.log("Finished query", moment().format("YYYY-MM-DD HH:mm:ss"));
    await db.end();
  } catch (err) {
    console.log(err);
    await db.end();
  }
};

cron.schedule("5 8 * * *", async () => {
  await getDataFromDatabase();
});

// (async () => {
//   await getDataFromDatabase();
// })();
