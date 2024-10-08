const nodemailer = require('nodemailer');
const client = require('./db');
const moment = require('moment');
const ENV = require('./env');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: ENV.EMAIL,
        pass: ENV.PASSWORD
    }
});

const mailOptions = {
    from: {
        name: "Product RTS",
        address: ENV.EMAIL
    },
    to: ["andri@rts.id"],
    subject: "Transactions Summary",
}

const sendMail = async (transporter, mailOptions) => {
    try {
        await transporter.sendMail(mailOptions)
        console.log("Email has been sent")
    } catch (err) {
        console.log(err)
    }
}

const getDataFromDatabase = async () => {
    console.log("Script run at " + moment().format('YYYY-MM-DD HH:mm:ss'));
    const db = await client();
    try {
        console.log("starting query");
        const summaryPerMonth = `
        SELECT masterreseller.NAMARESELLER, 
        COUNT(idtransaksi) as JumlahTransaksi, 
        FORMAT(SUM(CASE WHEN STATUSTRANSAKSI = 1 THEN HARGAJUAL-HARGABELI ELSE 0 END), 0) as Total
        FROM masterreseller
        LEFT JOIN transaksi_his
        ON transaksi_his.NamaReseller = masterreseller.NAMARESELLER
        AND TANGGAL BETWEEN ? AND ?
        GROUP BY NamaReseller
        ORDER BY JumlahTransaksi DESC`;
        const summaryPerDay = `
        SELECT masterreseller.NAMARESELLER, 
        COUNT(idtransaksi) as JumlahTransaksi, 
        FORMAT(SUM(CASE WHEN STATUSTRANSAKSI = 1 THEN HARGAJUAL-HARGABELI ELSE 0 END), 0) as Total
        FROM masterreseller 
        LEFT JOIN transaksi_his
        ON transaksi_his.NamaReseller = masterreseller.NAMARESELLER
        AND TANGGAL = ?
        GROUP BY masterreseller.NAMARESELLER
        ORDER BY JumlahTransaksi DESC`;
        const startOfMonth = moment().subtract(1, 'days').startOf('month').format('YYYY-MM-DD');
        const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
        const values = [startOfMonth, yesterday];
        const [rowsSummaryPerMonth] = await db.query(summaryPerMonth, values);
        const [rowsSummaryPerDay] = await db.query(summaryPerDay, yesterday);
        const dataPerMonth = await generateEmailData(rowsSummaryPerMonth);
        const dataPerDay = await generateEmailData(rowsSummaryPerDay);
        const emailBody = `
            <p><b>Dear Team RTS<b>,</p>
            <p>Here is the summary of client transactions per day : ${moment(yesterday).format('DD MMM YYYY')}</p>
            ${dataPerDay}
            <p>Here is the summary of client transactions MTD : ${moment(startOfMonth).format('DD MMM YYYY')} - ${moment(yesterday).format('DD MMM YYYY')}</p>
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
}

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

    data.forEach(item => {
        table += `
      <tr>
        <td>${item.NAMARESELLER}</td>
        <td>${item.JumlahTransaksi}</td>
        <td>${Number(item.Total.replace(/,/g, ''))}</td>
      </tr>`;
    });
    let totalTransactions = data.reduce((acc, item) => acc + item.JumlahTransaksi, 0);
    let totalRevenue = data.reduce((acc, item) => acc + Number(item.Total.replace(/,/g, '')), 0);

    let formattedTotalRevenue = new Intl.NumberFormat('de-DE').format(totalRevenue);
    table += `
        <tr style="border: 1px solid black;">
          <td style="border: 1px solid black;"><strong>Total</strong></td>
          <td style="border: 1px solid black;"><strong>${totalTransactions.toLocaleString()}</strong></td>
          <td style="border: 1px solid black;"><strong>${formattedTotalRevenue}</strong></td>
        </tr>
        `
    table += `
      </tbody>
    </table>`;

    return table;
}

getDataFromDatabase();
