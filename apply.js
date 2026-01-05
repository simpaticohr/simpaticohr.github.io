// ... (keep your firebaseConfig at the top) ...

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const applyForm = document.getElementById('applyForm');
const messageBox = document.getElementById('messageBox');

applyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = document.querySelector('button[type="submit"]');
  submitBtn.innerText = "Submitting...";
  submitBtn.disabled = true;

  try {
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;

    // Temporary Fix: Save text only to Firestore
    await db.collection("candidates").add({
      name: name,
      email: email,
      phone: phone,
      appliedAt: new Date(),
      note: "Resume skipped due to Storage region error"
    });

    messageBox.innerText = "✅ Submitted! (Check Firestore Data tab)";
    messageBox.className = "message success";
    messageBox.style.display = "block";
    applyForm.reset();

  } catch (error) {
    messageBox.innerText = "❌ Database Error: " + error.message;
    messageBox.style.display = "block";
  } finally {
    submitBtn.innerText = "Submit Application";
    submitBtn.disabled = false;
  }
});

