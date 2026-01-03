document.addEventListener("DOMContentLoaded", async () => {
  const SUPABASE_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_DGT-x86M-BwI4zA7S_97CA_3v3O3b0A";
  const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");
  const jobTitleEl = document.getElementById("jobTitle");

  function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.style.display = "block";
  }

  // 🛠️ FIX: Use your HR Internship ID if nothing is in the URL
  const urlParams = new URLSearchParams(window.location.search);
  let jobId = urlParams.get("job_id") || "baada626-3e67-4aed-82c4-27c818cba345";

  // 🔍 Fetch job details from Supabase
  const { data: jobData, error: jobError } = await _supabase
    .from("jobs")
    .select("title")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !jobData) {
    showMessage("❌ Job not found or closed.", "error");
    form.style.display = "none"; // Hide form if job truly doesn't exist
    return;
  }

  // ✅ Display the designation
  jobTitleEl.textContent = "Designation: " + jobData.title;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.innerText = "Submitting...";

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const resume = document.getElementById("resume").files[0];

    try {
      // 1. Upload Resume to Storage
      const filePath = `resumes/${jobId}/${Date.now()}_${resume.name}`;
      const { error: uploadError } = await _supabase.storage
        .from("resumes")
        .upload(filePath, resume);

      if (uploadError) throw new Error("Resume upload failed.");

      const { data: urlData } = _supabase.storage.from("resumes").getPublicUrl(filePath);

      // 2. Insert into Candidates Table
      const { error: insertError } = await _supabase.from("candidates").insert({
        full_name: name,
        email,
        phone,
        resume_url: urlData.publicUrl,
        job_id: jobId
      });

      if (insertError) throw new Error("Database submission failed.");

      showMessage("✅ Application submitted successfully!", "success");
      form.reset();
    } catch (err) {
      showMessage("❌ " + err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Submit Application";
    }
  });
});

