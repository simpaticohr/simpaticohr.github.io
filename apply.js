document.addEventListener("DOMContentLoaded", async () => {
  const SUPABASE_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4";
  
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");
  const jobTitleEl = document.getElementById("jobTitle");

  // Get job_id from the URL (e.g., apply.html?job_id=123)
  const jobId = new URLSearchParams(window.location.search).get("job_id");

  function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.style.display = "block";
  }

  if (!jobId) {
    showMessage("❌ Invalid job link. Please return to the job board.", "error");
    return;
  }

  // 1. Fetch Job Title for the header
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", jobId)
    .single();

  if (job) {
    jobTitleEl.textContent = "Role: " + job.title;
  }

  // 2. Handle Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const resumeFile = document.getElementById("resume").files[0];

    showMessage("⏳ Submitting application...", "info");

    try {
      // A. Upload Resume to Storage (Bucket name must be exact: RESUMES)
      const fileExt = resumeFile.name.split('.').pop();
      const fileName = `${Date.now()}_${name.replace(/\s+/g, '_')}.${fileExt}`;
      const filePath = `${jobId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("RESUMES") 
        .upload(filePath, resumeFile);

      if (uploadError) throw uploadError;

      // B. Get the Public URL for the resume
      const { data: urlData } = supabase.storage
        .from("RESUMES")
        .getPublicUrl(filePath);

      // C. Save Application to 'candidates' table
      const { error: insertError } = await supabase
        .from("candidates")
        .insert({
          full_name: name,
          email: email,
          phone: phone,
          resume_url: urlData.publicUrl,
          job_id: jobId
        });

      if (insertError) throw insertError;

      showMessage("✅ Application submitted successfully!", "success");
      form.reset();
      jobTitleEl.textContent = "";

    } catch (err) {
      console.error("Submission Error:", err);
      showMessage("❌ Error: " + (err.message || "Failed to submit"), "error");
    }
  });
});

