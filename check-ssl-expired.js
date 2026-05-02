const sslChecker = require("ssl-checker").default;
const nodemailer = require("nodemailer");
require("dotenv").config();
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
  to: ["prod@rts.id", "tony@citrakomunikasi.id"],
};

const sendMail = async (transporter, mailOptions) => {
  try {
    await transporter.sendMail(mailOptions);
    console.log("Email has been sent");
  } catch (err) {
    console.log(err);
  }
};

async function checkSSL(domains) {
  try {
    const results = await Promise.allSettled(
      domains.map((domain) => sslChecker(domain)),
    );

    const filteredResults = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    const expiredDomains = filteredResults.filter(
      (result) => result.daysRemaining <= 7,
    );

    return expiredDomains;
  } catch (err) {
    console.error(`Error checking ${domain}:`, err.message);
  }
}

async function sendEmail(expiredDomains) {
  mailOptions.subject = "🔒⚠️ SSL Certificate Expiring Soon";
  mailOptions.text = `The following domains are about to expire in less than 7 days:\n\n${expiredDomains
    .map(
      (result) =>
        `${result.subject.CN} (${result.daysRemaining} days remaining)`,
    )
    .join("\n")}\n\nPlease renew the certificates as soon as possible.`;
  await sendMail(transporter, mailOptions);
}

// (async () => {
//   const domainsToCheck = [
//     "h2h.biller-rts.id",
//     "kudo-cku.biller-rts.id",
//     "kudo-eshan.biller-rts.id",
//     "kudo-gtw.biller-rts.id",
//     "sat.biller-rts.id",
//     "sat-dev.biller-rts.id",
//     "tokped-cti.biller-rts.id",
//     "tokped-riu.biller-rts.id",
//   ];

//   const expiredDomains = await checkSSL(domainsToCheck);

//   if (expiredDomains.length > 0) {
//     await sendEmail(expiredDomains);
//   } else {
//     console.log("All SSL certificates are valid for more than 7 days.");
//   }
// })();

const sslExpired = async () => {
  const domainsToCheck = [
    "h2h.biller-rts.id",
    "kudo-cku.biller-rts.id",
    "kudo-eshan.biller-rts.id",
    "kudo-gtw.biller-rts.id",
    "sat.biller-rts.id",
    "sat-dev.biller-rts.id",
    "tokped-cti.biller-rts.id",
    "tokped-riu.biller-rts.id",
  ];

  const expiredDomains = await checkSSL(domainsToCheck);

  if (expiredDomains.length > 0) {
    await sendEmail(expiredDomains);
  } else {
    console.log("All SSL certificates are valid for more than 7 days.");
  }
};

// sslExpired();

console.log("Scheduling SSL certificate check every day at 07:00 AM...");
cron.schedule("0 7 * * *", async () => {
  console.log(
    "Running SSL certificate check at " + new Date().toLocaleString(),
  );
  await sslExpired();
  console.log(
    "SSL certificate check completed at " + new Date().toLocaleString(),
  );
});
