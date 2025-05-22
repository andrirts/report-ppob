const moment = require('moment');
const client = require('./db');
const ENV = require('./env');
require('dotenv').config();
const nodemailer = require('nodemailer');
const cron = require('node-cron');

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
    to: ['prod@rts.id'],
    subject: "RTS Sync : PPOB Alert System",
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
    try {
        const db = await client();
        console.log("starting query");
        const checkPending = `
            SELECT COUNT(idtransaksi) AS jumlah_transaksi
            FROM transaksi
            WHERE STATUSTRANSAKSI NOT IN (1, 2)
            OR Keterangan REGEXP 'RESULTCODE:(68|91|96)'
            AND JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME();
        `;
        const [rowsPending] = await db.query(checkPending);
        console.log("Pending Transaction : ", rowsPending[0].jumlah_transaksi);
        if (rowsPending[0].jumlah_transaksi > 10) {
            await sendMail(transporter, {
                ...mailOptions,
                text: `RTS Sync, Pending Transaction : ${rowsPending[0].jumlah_transaksi} transactions. Please check your biller system.`,
            });
        }
        console.log("System Update : ", moment().format('YYYY-MM-DD HH:mm:ss'));
        await db.end();
    } catch (err) {
        if (err.code === 'ETIMEDOUT') {
            await sendMail(transporter, {
                ...mailOptions,
                text: "RTS Sync, Database connection timed out. Please check your database connection.",
            });
        } else {
            console.log(err)
            if (db) {
                await db.end();
            }
            throw err;
        }
    }
}

cron.schedule('*/10 * * * *', async () => {
    try {
        await getDataFromDatabase();
    } catch (err) {
        console.log(err, "Error in cron job", moment().format('YYYY-MM-DD HH:mm:ss'));
    }
});

// getDataFromDatabase();