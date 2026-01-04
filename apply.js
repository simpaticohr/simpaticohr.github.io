document.addEventListener("DOMContentLoaded", async () => {
  const SUPABASE_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4";
  
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");
  const jobTitleEl = document.getElementById("jobTitle");

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

  // 1. Fetch Job Title
  const { data: job } = await supabase.from("jobs").select("title").eq("id", jobId).single();
  if (job) jobTitleEl.textContent = "Role: " + job.title;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const resumeFile = document.getElementById("resume").files[0]; // Defined as resumeFile

    showMessage("⏳ Submitting...", "info");

    try {
      const fileExt = resumeFile.name.split('.').pop();
      const fileName = `${Date.now()}_${name.replace(/\s+/g, '_')}.${fileExt}`;
      const filePath = `${jobId}/${fileName}`;

      // FIX: Changed 'resume' to 'resumeFile' to match variable above
      // FIX: Ensure bucket name is uppercase 'RESUMES'
      const { error: uploadError } = await supabase.storage
        .from("RESUMES")
        .upload(filePath, resumeFile); 

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("RESUMES").getPublicUrl(filePath);

      const { error: insertError } = await supabase.from("candidates").insert({
          full_name: name,
          email: email,
          phone: phone,
          resume_url: urlData.publicUrl,
          job_id: jobId
      });

      if (insertError) throw insertError;

      showMessage("✅ Application submitted successfully!", "success");
      form.reset();
    } catch (err) {
      console.error(err);
      showMessage("❌ Error: " + err.message, "error");
    }
  });
});

