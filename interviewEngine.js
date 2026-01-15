<button id="recordBtn">🎤 Speak Answer</button>
<p id="status"></p>
<p id="aiReply"></p>

<script>
let mediaRecorder;
let audioChunks = [];

document.getElementById("recordBtn").onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

    const formData = new FormData();
    formData.append("audio", audioBlob, "answer.webm");

    document.getElementById("status").innerText = "Evaluating...";

    const res = await fetch(
      "https://evalis-ai.simpaticohconsultancy.workers.dev",
      {
        method: "POST",
        body: formData
      }
    );

    const data = await res.json();

    document.getElementById("status").innerText =
      "You said: " + data.transcript;

    document.getElementById("aiReply").innerText =
      "Evalis AI: " + data.reply;
  };

  mediaRecorder.start();
  document.getElementById("status").innerText = "Recording...";

  setTimeout(() => mediaRecorder.stop(), 5000); // 5 sec answer
};
</script>
