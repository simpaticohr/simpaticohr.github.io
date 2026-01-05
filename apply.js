
// Firebase configuration (Your specific project details)
const firebaseConfig = {
  apiKey: "AIzaSyCG-btDx84oU8uteS7P1KzOI9YI4qLv-3Q",
  authDomain: "simpatico-ats.firebaseapp.com",
  projectId: "simpatico-ats",
  storageBucket: "simpatico-ats.firebasestorage.app",
  messagingSenderId: "1024863972380",
  appId: "1:1024863972380:web:594829fe03e8d9cb9b43d9",
  measurementId: "G-LJ1SEK8T8X"
};

// Initialize Firebase (Using Compat version for easy browser support)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

const applyForm = document.getElementById('applyForm');
const messageBox = document.getElementById('messageBox');

applyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Update button state to show progress
  const submitBtn = document.querySelector('button[type="submit"]');
  submitBtn.innerText = "Submitting... Please wait";
  submitBtn.disabled = true;

  // Get data from form fields
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;
  const resumeFile = document.getElementById('resume').files[0];

  try {
    // 1. Upload the Resume file to Firebase Storage
    const storageRef = storage.ref(`resumes/${Date.now()}_${resumeFile.name}`);
    const uploadTask = await storageRef.put(resumeFile);
    const resumeUrl = await uploadTask.ref.getDownloadURL();

    // 2. Save candidate info and Resume link to Firestore Database
    await db.collection("candidates").add({
      name: name,
      email: email,
      phone: phone,
      resumeUrl: resumeUrl,
      appliedAt: new Date()
    });

    // Show Success Message
    messageBox.innerText = "✅ Application submitted successfully!";
    messageBox.className = "message success";
    messageBox.style.display = "block";
    applyForm.reset();

  } catch (error) {
    console.error("Submission Error:", error);
    messageBox.innerText = "❌ Error: " + error.message;
    messageBox.className = "message error";
    messageBox.style.display = "block";
  } finally {
    // Reset button state
    submitBtn.innerText = "Submit Application";
    submitBtn.disabled = false;
  }
});
