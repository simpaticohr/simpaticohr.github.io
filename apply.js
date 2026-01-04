document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ apply.js loaded");

  /* ================================
     SUPABASE CONFIG
  ================================= */
  const SUPABASE_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  /* ================================
     ELEMENTS
  ================================= */
  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");
  const jobTitleEl = document.getElementById("jobTitle");

  function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.style.display = "block";
  }

  /* ================================
     READ job_id FROM URL
  ================================= */
  const jobId = new URLSearchParams(window.location.search).get("job_id");
  console.log("🔍 job_id:", jobId);

  if (!jobId) {
    showMessage("❌ Invalid job link.", "error");
    return;
  }

  /* ================================
     FETCH JOB DETAILS
  ================================= */
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("is_active", true)
    .maybeSingle();

  console.log("📦 job data:", job, "error:", jobError);

  if (jobError || !job) {
    showMessage("❌ Job not found or closed.", "error");
    return;
  }

  // Display designation
  jobTitleEl.textContent = "Designation: " + job.title;

  /* ================================
     FORM SUBMISSION
  ================================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const resume = document.getElementById("resume").files[0];

    if (!name || !email || !phone || !resume) {
      showMessage("❌ Please fill all fields", "error");
      return;
    }

    showMessage("⏳ Submitting application...", "info");

    /* ================================
       UPLOAD RESUME
    ================================= */
    const filePath = `${jobId}/${Date.now()}_${resume.name}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filePath, resume);

    if (uploadError) {
      console.error(uploadError);
      showMessage("❌ Resume upload failed", "error");
      return;
    }

    const { data: urlData } = supabase.storage
      .from("resumes")
      .getPublicUrl(filePath);

    /* ================================
       INSERT CANDIDATE
    ================================= */
    const { error: insertError } = await supabase
      .from("candidates")
      .insert({
        full_name: name,
        email,
        phone,
        resume_url: urlData.publicUrl,
        job_id: jobId
      });

    if (insertError) {
      console.error(insertError);
      showMessage("❌ Submission failed", "error");
      return;
    }

    showMessage("✅ Application submitted successfully", "success");
    form.reset();
  });
});
