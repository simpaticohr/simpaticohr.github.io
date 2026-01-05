// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCG-btDx84oUButeS7PlKzOI9YI4qLv-3Q",
  authDomain: "simpatico-ats.firebaseapp.com",
  projectId: "simpatico-ats",
  storageBucket: "simpatico-ats.firebasestorage.app",
  messagingSenderId: "1024863972380",
  appId: "1:1024863972380:web:594829fe03e8d9cb9b43d9",
  measurementId: "G-LJ1SEK8T8X"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Form Submit Handling
const form = document.getElementById("applyForm");
const statusMsg = document.getElementById("status");

if(form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const name = document.getElementById("name").value;
        const email = document.getElementById("email").value;
        const phone = document.getElementById("phone").value;

        statusMsg.innerText = "⏳ അയക്കുന്നു...";
        statusMsg.style.display = "block";

        try {
            // Firestore-ലേക്ക് ഡാറ്റ അയക്കുന്നു
            await db.collection("applications").add({
                name: name,
                email: email,
                phone: phone,
                appliedDate: new Date()
            });

            statusMsg.innerText = "✅ അപേക്ഷ വിജയകരമായി അയച്ചു!";
            statusMsg.style.color = "green";
            form.reset();
        } catch (error) {
            console.error(error);
            statusMsg.innerText = "❌ പിശക് സംഭവിച്ചു: " + error.message;
            statusMsg.style.color = "red";
        }
    });
}

