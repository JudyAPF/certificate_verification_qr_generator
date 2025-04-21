require("dotenv").config();
const Cryptr = require("cryptr");
const cryptr = new Cryptr("DICT_Region_1_ILCDB");
const QRCode = require("qrcode");
const path = require("path");
const express = require("express");
const app = express();
const session = require("express-session");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
const port = process.env.PORT;
const con = require("./db/connection");
const fs = require("fs");
const methodOverride = require("method-override");
app.use(methodOverride("_method"));
const sharp = require("sharp");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const ExcelJS = require("exceljs");
const multer = require("multer");
const xlsx = require("xlsx");
const AdmZip = require("adm-zip");

const upload = multer({ dest: "uploads/" });

// Session middleware
app.use(
  session({
    secret: "DICT_Region_1_ILCDB",
    resave: false,
    saveUninitialized: true,
  })
);

// Protect routes
const isLoggedIn = (req, res, next) => {
  if (!req.session.username) {
    return res.redirect("/");
  }
  next();
};

// JSON
app.use(express.json());
// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Ensure QR directory exists
const qrDir = path.join(__dirname, "public/qrcodes");
if (!fs.existsSync(qrDir)) {
  fs.mkdirSync(qrDir, { recursive: true });
}

app.get("/home", isLoggedIn, (req, res) => {
  sql = "SELECT * FROM courses";
  con.query(sql, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Database error");
    }
    res.render("home", {
      errors: {},
      courses: result,
      certificate: ["", "", "", "", "", "", "", ""],
      hash_code: "",
      certificate_code: "",
      qr_image_path: "",
      id: null,
    });
  });
});

function hashCertificateCode(data) {
  return crypto.createHash("sha256").update(data).digest("hex"); // 64 chars
}

app.get("/", (req, res) => {
  if (req.session.username) {
    return res.redirect("/home"); // If already logged in, redirect to home
  }
  res.render("signin", {
    success: null,
    admin: { username: "", password: "" },
    errors: {},
  });
});

app.post("/signin", (req, res) => {
  const { username, password } = req.body;
  const errors = {}; // Check if fields are empty

  if (!username || username.trim() === "")
    errors.username = "Admin username is required.";
  if (!password || password.trim() === "")
    errors.password = "Password is required.";

  if (Object.keys(errors).length > 0) {
    return res.status(400).render("signin", {
      errors,
      success: null,
      admin: { username, password: "" }, // Keep username input
    });
  } // Step 1: Check if user exists with that username

  const checkUserSQL = `SELECT * FROM admin_user WHERE username = ?`;
  con.query(checkUserSQL, [username], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Database error");
    }

    if (result.length === 0 || result[0].password !== password) {
      // Secure approach: Do not indicate whether username or password is incorrect
      return res.status(401).render("signin", {
        errors: { general: "Invalid username or password." },
        success: null,
        admin: { username: "", password: "" }, // Clear input fields
      });
    } // If both username and password are correct, proceed to login

    console.log("User found:", result[0].username);
    req.session.username = result[0].username;
    return res.status(200).render("signin", {
      errors: null, // No errors
      success: "Login successfully!", // Success message
      admin: { username: "", password: "" }, // Clear input fields
    });
  });
});

app.get("/verify", async (req, res) => {
  const serial_number = req.query.code;

  if (!serial_number) {
    return res
      .status(400)
      .send("Invalid request. No certificate code provided.");
  }

  try {
    const [certificate] = await con
      .promise()
      .query("SELECT * FROM certificates WHERE serial_number = ?", [
        serial_number,
      ]);

    if (certificate === 0) {
      return res.render("verification", { certificate: null });
    }

    res.render("verification", { certificate: certificate[0] });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).send("Server error");
  }
});

app.get("/view-all-generated", isLoggedIn, (req, res) => {
  sql = "SELECT * FROM certificates";
  con.query(sql, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Database error");
    }
    res.render("view_all_generated", {
      generated_qr_codes: result,
    });
  });
});

app.delete("/delete_generated_qr_code/:id", isLoggedIn, async (req, res) => {
  const id = req.params.id;
  console.log("Received DELETE request for:", id); // Debugging

  try {
    // Fetch the QR code file path before deleting the record
    const [certificate] = await con
      .promise()
      .query("SELECT qr_image_path FROM certificates WHERE id = ?", [id]);

    if (certificate.length === 0) {
      return res.status(404).send("Certificate not found");
    }

    const qrImagePath = certificate[0].qr_image_path;

    // Delete the certificate from the database
    const sql = "DELETE FROM certificates WHERE id = ?";
    await con.promise().query(sql, [id]);

    // If a QR code image exists, delete it from the 'public/qrcodes' folder
    if (qrImagePath) {
      const qrCodePath = path.join(__dirname, "public", "qrcodes", qrImagePath);

      fs.unlink(qrCodePath, (err) => {
        if (err) {
          console.error("Error deleting QR code file:", err);
        } else {
          console.log("QR code file deleted successfully:", qrImagePath);
        }
      });
    }

    console.log("Deletion successful, redirecting...");
    res.redirect("/view-all-generated");
  } catch (error) {
    console.error("Error deleting certificate:", error);
    res.status(500).send("Failed to delete certificate");
  }
});

const QRGenerate = async (hash_code, certificate_code) => {
  try {
    console.log("Generating QR code for:", hash_code);
    const qr_image_filename = `${certificate_code}.png`;
    const qr_image_path = path.join(
      __dirname,
      "public",
      "qrcodes",
      qr_image_filename
    );
    const logo_path = path.join(__dirname, "public", "images", "logo.png");

    // QR Code content (hash_code + message)
    const qrContent = `${hash_code}\n\nPlease confirm that the hash code above matches the record at DICT Region 1. Contact them at r1.ilcdb@dict.gov.ph for verification.`;

    // Generate QR Code
    await QRCode.toFile(qr_image_path, qrContent, {
      width: 500,
      margin: 2,
    });

    // Overlay logo
    const qrBuffer = await sharp(qr_image_path).resize(250, 250).toBuffer();
    const logoBuffer = await sharp(logo_path).resize(100, 100).toBuffer();

    const finalImage = await sharp(qrBuffer)
      .composite([{ input: logoBuffer, gravity: "center" }])
      .toFile(qr_image_path);

    console.log("QR Code generated with logo:", qr_image_path);
    return qr_image_filename;
  } catch (err) {
    console.error("Error generating QR code with logo:", err);
    return null;
  }
};

app.post("/generate-qrcode", isLoggedIn, async (req, res) => {
  try {
    const {
      firstname,
      middlename,
      lastname,
      course,
      course_code,
      serial_number,
      organization,
      venue,
      date,
    } = req.body;
    const errors = {};

    if (!firstname || firstname.trim() === "")
      errors.firstname = "First name is required";
    if (!lastname || lastname.trim() === "")
      errors.lastname = "Last name is required";
    if (!course_code || course_code.trim() === "")
      errors.course_code = "Course code is required";
    if (!serial_number || serial_number.trim() === "")
      errors.serial_number = "Serial number is required";
    if (!organization || organization.trim() === "")
      errors.organization = "Organization is required";
    if (!venue || venue.trim() === "") errors.venue = "Venue is required";
    if (!date || date.trim() === "") errors.date = "Date is required";

    const [courses] = await con.promise().query("SELECT * FROM courses");

    if (Object.keys(errors).length > 0) {
      return res.status(400).render("home", {
        errors,
        courses,
        hash_code: "",
        certificate: {
          firstname,
          lastname,
          courses,
          course_code,
          serial_number,
          organization,
          venue,
          date,
        },
        certificate_code: "",
        qr_image_path: "",
        id: null,
      });
    }

    const [existingSerialNumber] = await con
      .promise()
      .query("SELECT * FROM certificates WHERE serial_number = ?", [
        serial_number,
      ]);

    if (existingSerialNumber.length > 0) {
      errors.serial_number = "Serial number already exists";
      return res.render("home", {
        errors,
        courses,
        certificate: {
          firstname,
          middlename,
          lastname,
          course,
          course_code,
          serial_number,
          organization,
          venue,
          date,
        },
        hash_code: "",
        certificate_code: "",
        qr_image_path: "",
        id: null,
      });
    }

    //Format Date to Philippine Standard Time
    const formatted_date = new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Manila",
    });
    // Proceed with QR Code Generation
    const certificate_code = `DICT_ILCDB_Region1_${firstname}${
      middlename ? `-${middlename}` : ""
    }-${lastname}-${course_code}-${serial_number}-${formatted_date}`;
    const hash_code = hashCertificateCode(certificate_code); // Generate a URL for verification
    const qr_image_path = await QRGenerate(hash_code, certificate_code);

    await con
      .promise()
      .query(
        "INSERT INTO certificates (firstname, middlename, lastname, course, course_code, serial_number, organization, venue, date, certificate_code, hash_code, qr_image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          firstname,
          middlename,
          lastname,
          course,
          course_code,
          serial_number,
          organization,
          venue,
          date,
          certificate_code,
          hash_code,
          qr_image_path,
        ]
      );

    console.log("QR Code saved to database");
    res.render("home", {
      errors: {},
      courses,
      certificate: {
        firstname: "",
        middlename: "",
        lastname: "",
        course: "",
        course_code: "",
        serial_number: "",
        organization: "",
        venue: "",
        date: "",
      },
      hash_code,
      certificate_code,
      qr_image_path,
      id: null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to generate QR code");
  }
});

app.get("/edit_generated_qr_code/:id", isLoggedIn, (req, res) => {
  const id = req.params.id;
  console.log("Received GET request for:", id); // Debugging

  const sql = "SELECT * FROM certificates WHERE id = ?";
  con.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Database error");
    }
    if (result.length === 0) {
      console.error("Certificate not found:", id);
      return res.status(404).send("Certificate not found");
    }

    if (result[0].date) {
      const dbDate = new Date(result[0].date);

      // Ensure local time is used
      const year = dbDate.getFullYear();
      const month = String(dbDate.getMonth() + 1).padStart(2, "0"); // Months are 0-based
      const day = String(dbDate.getDate()).padStart(2, "0");

      // Store for <input type="date"> (YYYY-MM-DD format)
      result[0].dateForInput = `${year}-${month}-${day}`;

      // Store for display (DD/MM/YYYY format)
      result[0].dateForDisplay = `${day}/${month}/${year}`;
    }

    const sql = "SELECT * FROM courses";
    con.query(sql, (err, courses) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).send("Database error");
      }
      res.render("home", {
        errors: {},
        courses,
        hash_code: "",
        certificate: result[0],
        certificate_code: "",
        qr_image_path: "",
        id: id,
      });
    });
  });
});

app.put("/edit_generated_qr_code/:id", isLoggedIn, async (req, res) => {
  const id = req.params.id;
  try {
    const {
      firstname,
      middlename,
      lastname,
      course,
      course_code,
      serial_number,
      organization,
      venue,
      date,
    } = req.body;

    const errors = {};

    if (!firstname || firstname.trim() === "")
      errors.firstname = "First name is required";
    if (!lastname || lastname.trim() === "")
      errors.lastname = "Last name is required";
    if (!course_code || course_code.trim() === "")
      errors.course_code = "Course code is required";
    if (!serial_number || serial_number.trim() === "")
      errors.serial_number = "Serial number is required";
    if (!organization || organization.trim() === "")
      errors.organization = "Organization is required";
    if (!venue || venue.trim() === "") errors.venue = "Venue is required";
    if (!date || date.trim() === "") errors.date = "Date is required";

    const [courses] = await con.promise().query("SELECT * FROM courses");

    if (Object.keys(errors).length > 0) {
      return res.status(400).render("home", {
        errors,
        courses,
        certificate: req.body,
        certificate_code: "",
        qr_image_path: "",
        id,
      });
    }

    // Fetch the existing certificate details
    const [existingCertificate] = await con
      .promise()
      .query(
        "SELECT certificate_code, qr_image_path FROM certificates WHERE id = ?",
        [id]
      );

    if (existingCertificate.length === 0) {
      return res.status(404).send("Certificate not found");
    }

    const previousQRCode = existingCertificate[0].qr_image_path;
    if (previousQRCode) {
      const previousQRCodePath = path.join(
        __dirname,
        "public",
        "qrcodes",
        previousQRCode
      );
      fs.unlink(previousQRCodePath, (err) => {
        if (err) {
          console.error("Error deleting previous QR code:", err);
        } else {
          console.log("Previous QR code deleted successfully:", previousQRCode);
        }
      });
    }

    const formatted_date = new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Manila",
    });

    // Proceed with QR Code Generation
    const certificate_code = `DICT_ILCDB_Region1_${firstname}${
      middlename ? `-${middlename}` : ""
    }-${lastname}-${course_code}-${serial_number}-${formatted_date}`;
    const qr_image_path = await QRGenerate(
      existingCertificate[0].certificate_code,
      certificate_code
    );

    await con
      .promise()
      .query(
        "UPDATE certificates SET firstname = ?, middlename = ?, lastname = ?, course = ?, course_code = ?, serial_number = ?, organization = ?, venue = ?, date = ?, certificate_code = ?, qr_image_path = ? WHERE id = ?",
        [
          firstname,
          middlename,
          lastname,
          course,
          course_code,
          serial_number,
          organization,
          venue,
          date,
          certificate_code,
          qr_image_path,
          id,
        ]
      );

    console.log("Certificate updated successfully");
    res.redirect("/view-all-generated");
  } catch (error) {
    console.error("Error updating certificate:", error);
    res.status(500).send("Failed to update certificate");
  }
});

app.post("/add-course", isLoggedIn, (req, res) => {
  const { course } = req.body;

  if (!course || course.trim() === "") {
    return res
      .status(400)
      .json({ success: false, message: "Course name is required." });
  }

  // Check if course already exists (case-insensitive)
  const checkCourseSQL = `SELECT * FROM courses WHERE LOWER(course) = LOWER(?)`;
  con.query(checkCourseSQL, [course], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error." });
    }
    if (result.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "Course already exists." });
    }
    // If the course doesn't exist, insert it
    const insertCourseSQL = `INSERT INTO courses (course) VALUES (?)`;
    con.query(insertCourseSQL, [course], (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Database error." });
      }
      res.json({ success: true });
    });
  });
});

app.post("/update-course", isLoggedIn, (req, res) => {
  const { oldCourse, newCourse } = req.body;

  if (!oldCourse || !newCourse || newCourse.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Both old and new course names are required.",
    });
  }

  // Check if the new course name already exists (to avoid duplicates)
  const checkNewCourseSQL = `SELECT * FROM courses WHERE LOWER(course) = LOWER(?)`;
  con.query(checkNewCourseSQL, [newCourse], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error." });
    }
    if (result.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "New course name already exists." });
    }

    // Update the course name
    const updateCourseSQL = `UPDATE courses SET course = ? WHERE LOWER(course) = LOWER(?)`;
    con.query(updateCourseSQL, [newCourse, oldCourse], (err, result) => {
      if (err) {
        console.error("Database update error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Failed to update course." });
      }
      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Course not found." });
      }
      res.json({ success: true, message: "Course updated successfully!" });
    });
  });
});

app.post("/delete-course", isLoggedIn, (req, res) => {
  const { course } = req.body;

  if (!course) {
    return res
      .status(400)
      .json({ success: false, message: "Course name is required." });
  }

  const deleteCourseSQL = `DELETE FROM courses WHERE course = ?`;

  con.query(deleteCourseSQL, [course], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error." });
    }
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found." });
    }
    res.json({ success: true });
  });
});

app.get("/change_password", (req, res) => {
  res.render("change_password", {
    success: null,
    admin: { current_password: "", new_password: "", confirm_new_password: "" },
    errors: {},
  });
});

app.post("/change_password", async (req, res) => {
  const { current_password, new_password, confirm_new_password } = req.body;
  const errors = {};

  // ✅ Basic Validations
  if (!current_password || current_password.trim() === "") {
    errors.current_password = "Current password is required.";
  }
  if (!new_password || new_password.trim() === "") {
    errors.new_password = "New password is required.";
  }
  if (!confirm_new_password || confirm_new_password.trim() === "") {
    errors.confirm_new_password = "Confirm new password is required.";
  } else if (new_password !== confirm_new_password) {
    errors.error = "New password and confirm new password do not match.";
  }

  try {
    // ✅ Fetch current password from DB
    const [rows] = await con
      .promise()
      .query("SELECT password FROM admin_user LIMIT 1");

    if (rows.length === 0) {
      return res.status(404).send("Admin user not found");
    }

    const storedPassword = rows[0].password; // The current stored password

    // ✅ Check if the new password is the same as the old one
    if (new_password === storedPassword) {
      errors.error =
        "New password cannot be the same as the previous password.";
    }

    // If there are errors, return them
    if (Object.keys(errors).length > 0) {
      return res.render("change_password", {
        success: null,
        admin: { current_password, new_password, confirm_new_password },
        errors,
      });
    }

    // ✅ Validate current password
    if (current_password !== storedPassword) {
      errors.current_password = "Incorrect password.";
      return res.render("change_password", {
        success: null,
        admin: { current_password, new_password, confirm_new_password },
        errors,
      });
    }

    // ✅ Update password (Still in plain text)
    await con
      .promise()
      .query("UPDATE admin_user SET password = ?", [new_password]);

    res.render("signin", {
      success: "Password changed successfully!",
      admin: {
        current_password: "",
        new_password: "",
        confirm_new_password: "",
      },
      errors: {},
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).send("Database error");
  }
});

app.get("/signout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Failed to log out");
    }
    res.redirect("/");
  });
});

app.get("/download-excel", (req, res) => {
  const sql = "SELECT * FROM certificates";
  con.query(sql, async (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Database error");
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Certificates");

    worksheet.columns = [
      { header: "Fullname", key: "fullname", width: 25 },
      { header: "Course", key: "course", width: 20 },
      { header: "Course Code", key: "course_code", width: 15 },
      { header: "Serial Number", key: "serial_number", width: 20 },
      { header: "Organization", key: "organization", width: 20 },
      { header: "Venue", key: "venue", width: 20 },
      { header: "Date", key: "date", width: 20 },
      { header: "Certificate Code", key: "certificate_code", width: 25 },
      { header: "Hash Code", key: "hash_code", width: 40 },
      { header: "QR Code", key: "qr_image_path", width: 15 }, // Just a placeholder
    ];

    result.forEach((item, index) => {
      const rowIndex = index + 2; // because header is row 1
      const rowData = {
        fullname: `${item.firstname} ${item.middlename || ""} ${item.lastname}`,
        course: item.course,
        course_code: item.course_code,
        serial_number: item.serial_number,
        organization: item.organization,
        venue: item.venue,
        date: new Date(item.date).toLocaleDateString("en-PH", {
          weekday: "short",
          month: "short",
          day: "2-digit",
          year: "numeric",
          timeZone: "Asia/Manila",
        }),
        certificate_code: item.certificate_code,
        hash_code: item.hash_code,
        qr_image_path: "", // placeholder so the column exists
      };

      // Add the row data
      worksheet.addRow(rowData);

      // Embed QR image into the last column (col index 10, zero-based index 9)
      if (item.qr_image_path) {
        try {
          const imagePath = path.join(
            __dirname,
            "public",
            "qrcodes",
            item.qr_image_path
          );
          const imageId = workbook.addImage({
            buffer: fs.readFileSync(imagePath),
            extension: "png",
          });

          // Ensure the image doesn't move within the cell
          worksheet.addImage(imageId, {
            tl: { col: 9, row: rowIndex - 1, colOff: 0, rowOff: 0 }, // Top-left corner of the cell
            ext: { width: 100, height: 100 },
            editAs: "oneCell", // Ensures the image stays within the bounds of one cell
          });

          // Adjust row height to fit the image if necessary
          worksheet.getRow(rowIndex).height = Math.max(
            worksheet.getRow(rowIndex).height || 15,
            100 * 0.75
          ); // 100px at roughly 75 DPI
        } catch (err) {
          console.warn("Failed to embed image:", err.message);
        }
      }
    });

    // Align all cell content to top
    worksheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });

    // Headers for download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Participants Information with QR Code Verification.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  });
});

app.delete("/delete_all", isLoggedIn, (req, res) => {
  const sql = "DELETE FROM certificates";

  con.query(sql, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Database error");
    }

    // If a QR codes image exists, delete it from the 'public/qrcodes' folder
    const qrDir = path.join(__dirname, "public/qrcodes");
    fs.readdir(qrDir, (err, files) => {
      if (err) {
        console.error("Error reading QR code directory:", err);
        return res.status(500).send("Error reading QR code directory");
      }
      files.forEach((file) => {
        const filePath = path.join(qrDir, file);
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error("Error deleting QR code file:", err);
          } else {
            console.log("QR code file deleted successfully:", filePath);
          }
        });
      });
    });

    res.redirect("/view-all-generated");
  });
});

app.post(
  "/upload-excel",
  isLoggedIn,
  upload.single("excelFile"),
  async (req, res) => {
    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);

      const inserted = [];

      for (const row of rows) {
        const {
          firstname,
          middlename = "",
          lastname,
          course,
          course_code,
          serial_number,
          organization,
          venue,
          date,
        } = row;

        // Check if serial already exists
        const [existing] = await con
          .promise()
          .query("SELECT * FROM certificates WHERE serial_number = ?", [
            serial_number,
          ]);
        if (existing.length > 0) {
          console.log(`Skipping duplicate serial: ${serial_number}`);
          continue;
        }

        const formatted_date = new Date(date).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Manila",
        });

        // Proceed with QR Code Generation
        const certificate_code = `DICT_ILCDB_Region1_${firstname}${
          middlename ? `-${middlename}` : ""
        }-${lastname}-${course_code}-${serial_number}-${formatted_date}`;
        const hash_code = hashCertificateCode(certificate_code);
        const qr_image_path = await QRGenerate(hash_code, certificate_code);

        await con
          .promise()
          .query(
            "INSERT INTO certificates (firstname, middlename, lastname, course, course_code, serial_number, organization, venue, date, certificate_code, hash_code, qr_image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              firstname,
              middlename,
              lastname,
              course,
              course_code,
              serial_number,
              organization,
              venue,
              date,
              certificate_code,
              hash_code,
              qr_image_path,
            ]
          );

        inserted.push({ certificate_code, serial_number });
      }

      res.redirect("/view-all-generated");
    } catch (err) {
      console.error("Error processing Excel upload:", err);
      res.status(500).send("Bulk upload failed");
    }
  }
);

app.get("/download-qr-codes", isLoggedIn, (req, res) => {
  const qrDir = path.join(__dirname, "public/qrcodes");
  const zip = new AdmZip();
  fs.readdir(qrDir, (err, files) => {
    if (err) {
      console.error("Error reading QR code directory:", err);
      return res.status(500).send("Error reading QR code directory");
    }
    files.forEach((file) => {
      const filePath = path.join(qrDir, file);
      zip.addLocalFile(filePath);
    });
    const zipPath = path.join(__dirname, "public", "qrcodes.zip");
    zip.writeZip(zipPath);
    res.download(zipPath, "generated_qrcodes.zip", (err) => {
      if (err) {
        console.error("Error downloading ZIP file:", err);
      }
      fs.unlink(zipPath, (err) => {
        if (err) {
          console.error("Error deleting ZIP file:", err);
        }
      });
    });
  });
});

app.listen(3000, () => {
  console.log(`URL: http://localhost:${3000}`);
});
