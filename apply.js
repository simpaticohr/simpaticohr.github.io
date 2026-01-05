// ================================
// Firebase Configuration
// ================================
const firebaseConfig = {
  apiKey: "AIzaSyCG-bDtX84QBUteS7P1k20I9YI4qLv-3Q",
  authDomain: "simpatico-ats.firebaseapp.com",
  projectId: "simpatico-ats",
  storageBucket: "simpatico-ats.appspot.com",
  messagingSenderId: "1024863972380",
  appId: "1:1024863972380:web:594829f0e3e8d9cb9b43d9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ================================
// DOM Ready
// ================================
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");
  const jobTitleEl = document.getElementById("jobTitle");

  // Read job_id from URL
  const urlParams = new URLSearchParams(window.location.search);
  const jobId = urlParams.get("job_id");

  if (!jobId) {
    showMessage("Invalid job link.", "error");
    return;
  }

  // Display job ID (optional – replace later with real title)
  jobTitleEl.textContent = "Applying for Job ID: " + jobId;

  // ================================
  // Form Submission
  // ================================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();

    if (!name || !email || !phone) {
      showMessage("Please fill all required fields.", "error");
      return;
    }

    showMessage("Submitting your application...", "success");

    try {
      await db.collection("applications").add({
        full_name: name,
        email: email,
        phone: phone,
        job_id: jobId,
        applied_at: new Date()
      });

      showMessage("Application submitted successfully!", "success");
      form.reset();

    } catch (error) {
      console.error(error);
      showMessage("Submission failed. Please try again.", "error");
    }
  });

  // ================================
  // Message Helper
  // ================================
  function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.style.display = "block";
  }
});
