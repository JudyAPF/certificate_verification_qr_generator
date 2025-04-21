document.addEventListener("DOMContentLoaded", function () {
  // Show the loading overlay when the page starts loading
  document.getElementById("loadingOverlay").style.display = "flex";
  $(document).ready(function () {
    $("#qr_codes_table").DataTable({
      responsive: true,
      pageLength: 10,
      order: [[8, "desc"]], // Orders by "Created At" (column index 8)
      scrollY: "500px", // Enables scrolling inside the table
      scrollCollapse: true, // Allows collapsing
      paging: true, // Keeps pagination
    });
  });

  document.getElementById("loadingOverlay").style.display = "none";
});

document.addEventListener("click", function (event) {
  if (event.target.matches("#delete-btn")) {
    event.preventDefault();

    Swal.fire({
      title: "Confirm Delete",
      text: "Are you sure you want to delete this?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#4CAF50",
      cancelButtonColor: "#FF5733",
    }).then((result) => {
      if (result.isConfirmed) {
        console.log("Confirmed delete! Submitting form...");
        event.target.closest("form").submit(); // ✅ Submits the correct form
      }
    });
  }
});

document.addEventListener("click", function (event) {
  if (event.target.matches("#downloadQRCodes")) {
    event.preventDefault();

    Swal.fire({
      title: "Download QR Codes",
      text: "Are you sure you want to download the QR codes?",
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Yes",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#4CAF50",
      cancelButtonColor: "#FF5733",
    }).then((result) => {
      if (result.isConfirmed) {
        console.log("Confirmed download! Redirecting...");
        window.location.href = "/download-qr-codes"; // Redirects to the download route
      }
    });
  }
});

document.getElementById("downloadExcel").addEventListener("click", () => {
  window.location.href = "/download-excel";
});
