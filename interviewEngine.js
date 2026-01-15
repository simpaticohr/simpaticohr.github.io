<script>
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const questionEl = document.getElementById("question");
const pulse = document.getElementById("pulse");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

let micReady = false;
let recognition;
let qIndex = 0;

const questions = [
  "Tell me about yourself.",
  "What experience do you have related to this role?",
  "Describe a challenge you handled well.",
  "Why should we hire you?"
];

function speak(text) {
  synth.cancel();
  statusEl.innerText = "Evalis AI Speaking";
  questionEl.innerText = text;
  const u = new SpeechSynthesisUtterance(text);
  u.onend = () => statusEl.innerText = "Listening…";
  synth.speak(u);
}

startBtn.onclick = async () => {
  // STEP 1 — MIC PERMISSION ONLY
  if (!micReady) {
    statusEl.innerText = "Requesting microphone…";
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      micReady = true;
      statusEl.innerText = "Microphone ready ✔ Tap Start again";
      questionEl.innerText = "Tap Start Interview again to begin";
    } catch {
      statusEl.innerText = "Microphone blocked";
      questionEl.innerText = "Allow mic access in browser settings";
    }
    return;
  }

  // STEP 2 — INTERVIEW START
  startBtn.style.display = "none";

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";

  recognition.onresult = () => {
    recognition.stop();
    qIndex++;
    if (qIndex < questions.length) {
      speak(questions[qIndex]);
    } else {
      statusEl.innerText = "Interview Completed";
      questionEl.innerText = "Thank you. Interview complete.";
      pulse.style.display = "none";
    }
  };

  pulse.style.display = "block";
  speak(questions[0]);

  setTimeout(() => {
    try { recognition.start(); } catch(e){}
  }, 800);
};
</script>
