const moment = require("moment");
const client = require("./db");
require("dotenv").config();
const nodemailer = require("nodemailer");

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
  to: ["prod@rts.id", "cs@rts.id"],
  subject: "RTS Sync : PPOB Alert System",
};

const sendMail = async (transporter, mailOptions) => {
  try {
    await transporter.sendMail(mailOptions);
    console.log("Email has been sent");
  } catch (err) {
    console.log(err);
  }
};

let i = 0;

const getDataFromDatabase = async () => {
  console.log("Script run at " + moment().format("YYYY-MM-DD HH:mm:ss"));
  try {
    const db = await client();
    console.log("starting query");

    const totalTransactionsToday = `
            SELECT COUNT(idtransaksi) AS countTransactions
            FROM transaksi
            WHERE TANGGAL = CURDATE();
        `;

    const finnetPendingTransactions = `
            SELECT COUNT(idtransaksi) AS countTransactions, KodeProduk , namaterminal,idtransaksi
            FROM transaksi
            WHERE JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME()
            AND namaterminal = 'FINNET'
            AND (Keterangan REGEXP 'RESULTCODE:(68|91|96)'
            AND TANGGAL = CURDATE()
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
            AND TANGGAL = CURDATE()
            GROUP BY KodeProduk ;
        `;

    const satPendingTransactions = `
            SELECT COUNT(idtransaksi) AS countTransactions, KodeProduk , namaterminal
            FROM transaksi
            WHERE STATUSTRANSAKSI NOT IN (1, 2)
            AND JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME()
            AND namaterminal = 'SAT PROD'
            AND Keterangan REGEXP '(U03|U01|U02|S00|P04|S02|U04|P27)'
            AND TANGGAL = CURDATE()
            GROUP BY KodeProduk ;
        `;

    const rajaBillerPendingTransactions = `
            SELECT COUNT(idtransaksi) AS countTransactions, KodeProduk , namaterminal
            FROM transaksi
            WHERE STATUSTRANSAKSI NOT IN (1, 2)
            AND JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME()
            AND namaterminal = 'RAJA BILLER'
            AND Keterangan REGEXP '(RC: 77|RC:16)'
            AND TANGGAL = CURDATE()
            GROUP BY KodeProduk ;
        `;
    const cnetPendingTransactions = `
            SELECT COUNT(idtransaksi) AS countTransactions, KodeProduk , namaterminal
            FROM transaksi
            WHERE STATUSTRANSAKSI NOT IN (1, 2)
            AND JAM BETWEEN CURTIME() - INTERVAL 10 MINUTE AND CURTIME()
            AND namaterminal = 'CNET'
            AND TANGGAL = CURDATE()
            GROUP BY KodeProduk ;
        `;

    const queryPendingTransactionsToday = `
            SELECT COUNT(idtransaksi) AS countTransactions
            FROM transaksi
            WHERE (STATUSTRANSAKSI NOT IN (1, 2)
            OR Keterangan REGEXP 'RESULTCODE:(68|91|96)'
            OR Keterangan REGEXP '(RC: 77|RC:16)'
            OR Keterangan REGEXP '(U03|U01|U02|S00|P04|S02|U04|P27)'
            OR Keterangan like '%PRODUK GANGGUAN%')
            AND TANGGAL = CURDATE()
            ;
        `;

    const [totalTransactions] = await db.query(totalTransactionsToday);
    const [pendingTransactionsToday] = await db.query(
      queryPendingTransactionsToday
    );
    const [finnetPending] = await db.query(finnetPendingTransactions);
    const [sakalagunaPending] = await db.query(sakalagunaPendingTransactions);
    const [satPending] = await db.query(satPendingTransactions);
    const [rajaBillerPending] = await db.query(rajaBillerPendingTransactions);
    const [cnetPending] = await db.query(cnetPendingTransactions);

    const listProductCodePending = [];

    console.log(
      "Pending Transactions Today : ",
      pendingTransactionsToday[0].countTransactions
    );
    if (finnetPending.length > 0) {
      for (const item of finnetPending) {
        listProductCodePending.push({
          productCode: item.KodeProduk,
          countTransactions: item.countTransactions,
          terminalName: item.namaterminal,
        });
      }
    }
    if (sakalagunaPending.length > 0) {
      for (const item of sakalagunaPending) {
        listProductCodePending.push({
          productCode: item.KodeProduk,
          countTransactions: item.countTransactions,
          terminalName: item.namaterminal,
        });
      }
    }
    if (satPending.length > 0) {
      for (const item of satPending) {
        listProductCodePending.push({
          productCode: item.KodeProduk,
          countTransactions: item.countTransactions,
          terminalName: item.namaterminal,
        });
      }
    }
    if (rajaBillerPending.length > 0) {
      for (const item of rajaBillerPending) {
        listProductCodePending.push({
          productCode: item.KodeProduk,
          countTransactions: item.countTransactions,
          terminalName: item.namaterminal,
        });
      }
    }
    if (cnetPending.length > 0) {
      for (const item of cnetPending) {
        listProductCodePending.push({
          productCode: item.KodeProduk,
          countTransactions: item.countTransactions,
          terminalName: item.namaterminal,
        });
      }
    }
    let currentPendingTransactions = 0;
    for (const item of listProductCodePending) {
      currentPendingTransactions += item.countTransactions;
    }

    console.log("Current Pending Transactions : ", currentPendingTransactions);

    const htmlContent = `
            <h2>RTS Sync : PPOB Alert System</h2>
            <h4 style="margin: 0;">Date : ${moment().format("DD/MM/YYYY")}</h4>
            <p style="margin: 0;">Total Transaction Today : ${
              totalTransactions[0].countTransactions
            }</p>
            <p style="margin: 0;">Pending Transaction Today: ${
              pendingTransactionsToday[0].countTransactions
            }</p>
            <p style="margin: 0;">Pending Transaction in last 10 minutes : ${currentPendingTransactions}</p>
            <h3>Pending Transactions by Supplier:</h3>
            <ul>
                ${listProductCodePending
                  .map(
                    (item) =>
                      `<li>${item.terminalName} - ${item.productCode}: ${item.countTransactions}</li>`
                  )
                  .join("")}
            </ul>
        `;

    if (currentPendingTransactions > 25) {
      await sendMail(transporter, {
        ...mailOptions,
        html: htmlContent,
      });
    }
    console.log("System Update : ", moment().format("YYYY-MM-DD HH:mm:ss"));
    i = 0;
    await db.end();
  } catch (err) {
    console.log("Error in getDataFromDatabase: ", err);
    if (err.code === "ETIMEDOUT") {
      // I want to retry the connection
      if (i < 3) {
        i++;
        console.log("Database connection timed out. Retrying...");
        await new Promise((resolve) => setTimeout(resolve, 5000)); // wait for 5 seconds before retrying
        return getDataFromDatabase();
      } else {
        console.log(
          "Database connection timed out. Please check your database connection.",
          err.message
        );
        await sendMail(transporter, {
          ...mailOptions,
          text: "RTS Sync, Database connection timed out. Please check your database connection.",
          subject: "RTS Sync : PPOB Down System Alert",
        });
        i = 0;
      }
    } else {
      console.log(err);
      if (db) {
        await db.end();
      }
      console.log("Error ", err);
    }
  }
};

executePeriodically = async () => {
  try {
    await getDataFromDatabase();
  } catch (err) {
    console.log(
      err,
      "Error in executePeriodically",
      moment().format("YYYY-MM-DD HH:mm:ss")
    );
  } finally {
    setTimeout(executePeriodically, 10 * 60 * 1000); // 10 minutes
  }
};

executePeriodically();

// (async () => {
//     try {
//         await getDataFromDatabase();
//     } catch (err) {
//         console.log(err, "Error in executePeriodically", moment().format('YYYY-MM-DD HH:mm:ss'));
//     }
// })();
