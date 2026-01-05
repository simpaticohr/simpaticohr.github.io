// New Firebase configuration from your screenshot
const firebaseConfig = {
  apiKey: "AIzaSyCG-btDx84oU8uteS7P1KzOI9YI4qLv-3Q",
  authDomain: "simpatico-ats.firebaseapp.com",
  projectId: "simpatico-ats",
  storageBucket: "simpatico-ats.firebasestorage.app",
  messagingSenderId: "1024863972380",
  appId: "1:1024863972380:web:7f9d6db1486d67be9b43d9",
  measurementId: "G-CF7J8KT96Z"
};

// Initialize Firebase using the Compat libraries
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

const applyForm = document.getElementById('applyForm');
const messageBox = document.getElementById('messageBox');

applyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = document.querySelector('button[type="submit"]');
  submitBtn.innerText = "Submitting... Please wait";
  submitBtn.disabled = true;

  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;
  const resumeFile = document.getElementById('resume').files[0];

  try {
    // 1. Upload Resume to the new Storage bucket
    const storageRef = storage.ref(`resumes/${Date.now()}_${resumeFile.name}`);
    const uploadTask = await storageRef.put(resumeFile);
    const resumeUrl = await uploadTask.ref.getDownloadURL();

    // 2. Save candidate info to the new Firestore
    await db.collection("candidates").add({
      name: name,
      email: email,
      phone: phone,
      resumeUrl: resumeUrl,
      appliedAt: new Date()
    });

    messageBox.innerText = "✅ Application submitted successfully!";
    messageBox.className = "message success";
    messageBox.style.display = "block";
    applyForm.reset();

  } catch (error) {
    console.error("Error:", error);
    messageBox.innerText = "❌ Error: " + error.message;
    messageBox.className = "message error";
    messageBox.style.display = "block";
  } finally {
    submitBtn.innerText = "Submit Application";
    submitBtn.disabled = false;
  }
});

