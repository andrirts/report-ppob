const { createConnection } = require("mysql2/promise");
require("dotenv").config();

const connection = async () => {
  try {
    const connection = await createConnection({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });
    return connection;
  } catch (err) {
    throw err;
  }
};

module.exports = connection;
