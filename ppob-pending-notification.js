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
    to: ['prod@rts.id', 'cs@rts.id'],
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
        const finnetPendingTransactions = `
            SELECT COUNT(idtransaksi) AS countTransactions, KodeProduk , namaterminal,idtransaksi
            FROM transaksi
            WHERE JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME()
            AND namaterminal = 'FINNET'
            AND (Keterangan REGEXP 'RESULTCODE:(68|91|96)'
            OR STATUSTRANSAKSI NOT IN (1, 2))
            GROUP BY KodeProduk ;
        `;

        const sakalagunaPendingTransactions = `
            SELECT COUNT(idtransaksi) AS countTransactions, KodeProduk , namaterminal
            FROM transaksi
            WHERE STATUSTRANSAKSI NOT IN (1, 2)
            AND JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME()
            AND namaterminal = 'SAKALAGUNA'
            AND Keterangan like '%PRODUK GANGGUAN%'
            GROUP BY KodeProduk ;
        `;

        const satPendingTransactions = `
            SELECT COUNT(idtransaksi) AS countTransactions, KodeProduk , namaterminal
            FROM transaksi
            WHERE STATUSTRANSAKSI NOT IN (1, 2)
            AND JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME()
            AND namaterminal = 'SAT PROD'
            AND Keterangan REGEXP '(U03|U01|U02|S00|P04|S02|U04|P27)'
            GROUP BY KodeProduk ;
        `;

        const rajaBillerPendingTransactions = `
            SELECT COUNT(idtransaksi) AS countTransactions, KodeProduk , namaterminal
            FROM transaksi
            WHERE STATUSTRANSAKSI NOT IN (1, 2)
            AND JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME()
            AND namaterminal = 'RAJA BILLER'
            AND Keterangan REGEXP '(RC: 77|RC:16)'
            GROUP BY KodeProduk ;
        `;

        const queryPendingTransactionsToday = `
            SELECT COUNT(idtransaksi) AS countTransactions
            FROM transaksi
            WHERE STATUSTRANSAKSI NOT IN (1, 2)
            OR Keterangan REGEXP 'RESULTCODE:(68|91|96)'
            OR Keterangan REGEXP '(RC: 77|RC:16)'
            OR Keterangan REGEXP '(U03|U01|U02|S00|P04|S02|U04|P27)'
            OR Keterangan like '%PRODUK GANGGUAN%';
        `

        const [pendingTransactionsToday] = await db.query(queryPendingTransactionsToday);
        const [finnetPending] = await db.query(finnetPendingTransactions);
        const [sakalagunaPending] = await db.query(sakalagunaPendingTransactions);
        const [satPending] = await db.query(satPendingTransactions);
        const [rajaBillerPending] = await db.query(rajaBillerPendingTransactions);

        const listProductCodePending = [];

        console.log("Pending Transactions Today : ", pendingTransactionsToday[0].countTransactions);
        if (finnetPending.length > 0) {
            for (const item of finnetPending) {
                listProductCodePending.push({
                    productCode: item.KodeProduk,
                    countTransactions: item.countTransactions,
                    terminalName: item.namaterminal
                })
            }
        }
        if (sakalagunaPending.length > 0) {
            for (const item of sakalagunaPending) {
                listProductCodePending.push({
                    productCode: item.KodeProduk,
                    countTransactions: item.countTransactions,
                    terminalName: item.namaterminal
                })
            }
        }
        if (satPending.length > 0) {
            for (const item of satPending) {
                listProductCodePending.push({
                    productCode: item.KodeProduk,
                    countTransactions: item.countTransactions,
                    terminalName: item.namaterminal
                })
            }
        }
        if (rajaBillerPending.length > 0) {
            for (const item of rajaBillerPending) {
                listProductCodePending.push({
                    productCode: item.KodeProduk,
                    countTransactions: item.countTransactions,
                    terminalName: item.namaterminal
                })
            }
        }
        let currentPendingTransactions = 0;
        for (const item of listProductCodePending) {
            currentPendingTransactions += item.countTransactions;
        }

        console.log("Current Pending Transactions : ", currentPendingTransactions);

        const htmlContent = `
            <h2>RTS Sync : PPOB Alert System</h2>
            <p>Pending Transactions Today: ${pendingTransactionsToday[0].countTransactions}</p>
            <p>Current Pending Transactions: ${currentPendingTransactions}</p>
            <h3>Pending Transactions by Supplier:</h3>
            <ul>
                ${listProductCodePending.map(item => `<li>${item.terminalName} - ${item.productCode}: ${item.countTransactions} transactions</li>`).join('')}
            </ul>
        `

        if (currentPendingTransactions > 10) {
            await sendMail(transporter, {
                ...mailOptions,
                html: htmlContent,
            });
        }
        console.log("System Update : ", moment().format('YYYY-MM-DD HH:mm:ss'));
        await db.end();
    } catch (err) {
        console.log("Error in getDataFromDatabase: ", err);
        if (err.code === 'ETIMEDOUT') {
            console.log("Database connection timed out. Please check your database connection.", err.message);
            await sendMail(transporter, {
                ...mailOptions,
                text: "RTS Sync, Database connection timed out. Please check your database connection.",
                subject: "RTS Sync : PPOB Down System Alert",
            });
        } else {
            console.log(err)
            if (db) {
                await db.end();
            }
            console.log("Error ", err)
        }
    }
}

executePeriodically = async () => {
    try {
        await getDataFromDatabase();
    } catch (err) {
        console.log(err, "Error in executePeriodically", moment().format('YYYY-MM-DD HH:mm:ss'));
    } finally {
        setTimeout(executePeriodically, 10 * 60 * 1000); // 10 minutes
    }

}

executePeriodically();