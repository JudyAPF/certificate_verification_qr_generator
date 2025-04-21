require("dotenv").config();
const mysql = require("mysql2");

const con = mysql.createConnection({
  host: "bwlofjgqlkgz9udbcdj1-mysql.services.clever-cloud.com",
  database: "bwlofjgqlkgz9udbcdj1",
  password: "0UsEl8fJ2ODovWSEjR08",
  user: "ulugl6lnxcdal28v",
});

con.connect((err) => {
  if (err) throw err;
  console.log("Connected!");
});
module.exports = con;
