mediaRecorder.onstop = async () => {
  const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

  const formData = new FormData();
  formData.append("audio", audioBlob, "answer.webm");

  status.innerText = "Evaluating...";

  const res = await fetch(
    "https://evalis-ai.simpaticohrconsultancy.workers.dev",
    {
      method: "POST",
      body: formData
    }
  );

  const data = await res.json();

  const answerText = data.transcript;
  transcriptLog.push(answerText);

  // 🔥 THIS IS THE BRAIN
  const next = decideNext(answerText, interview);

  if (next === null) {
    finishInterview();
    return;
  }

  showQuestion(next);
};
