const firebaseConfig = {
  apiKey: "AIzaSyCG-btDx84oU8uteS7P1KzOI9YI4qLv-3Q",
  authDomain: "simpatico-ats.firebaseapp.com",
  projectId: "simpatico-ats",
  storageBucket: "simpatico-ats.firebasestorage.app",
  messagingSenderId: "1024863972380",
  appId: "1:1024863972380:web:7f9d6db1486d67be9b43d9",
  measurementId: "G-CF7J8KT96Z"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

document.getElementById('applyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('messageBox');
  
  btn.innerText = "Submitting...";
  btn.disabled = true;

  try {
    const file = document.getElementById('resume').files[0];
    const storageRef = storage.ref(`resumes/${Date.now()}_${file.name}`);
    await storageRef.put(file);
    const url = await storageRef.getDownloadURL();

    await db.collection("candidates").add({
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      resumeUrl: url,
      appliedAt: new Date()
    });

    msg.innerText = "✅ Application submitted successfully!";
    msg.className = "message success";
    msg.style.display = "block";
    e.target.reset();
  } catch (err) {
    msg.innerText = "❌ Error: " + err.message;
    msg.className = "message error";
    msg.style.display = "block";
  } finally {
    btn.innerText = "Submit Application";
    btn.disabled = false;
  }
});

