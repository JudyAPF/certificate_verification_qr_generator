require("dotenv").config();
const mysql = require("mysql2");

const con = mysql.createConnection({
  // host: process.env.DB_HOST,
  // database: process.env.DB_DBNAME,
  // password: process.env.DB_PASSWORD,
  // user: process.env.DB_USERNAME,
  host: "localhost",
  database: "certificate_verification_qr_generator",
  password: "",
  user: "root",
});

con.connect((err) => {
  if (err) throw err;
  console.log("Connected!");
});
module.exports = con;
