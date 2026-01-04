document.addEventListener("DOMContentLoaded", async () => {
  const SUPABASE_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4";
  
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");
  const jobTitleEl = document.getElementById("jobTitle");

  const jobId = new URLSearchParams(window.location.search).get("job_id");

  if (!jobId) {
    messageBox.textContent = "❌ Invalid job link.";
    messageBox.style.display = "block";
    return;
  }

  // Fetch job title for display
  const { data: job } = await supabase.from("jobs").select("title").eq("id", jobId).single();
  if (job) jobTitleEl.textContent = "Designation: " + job.title;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageBox.textContent = "⏳ Submitting...";
    messageBox.style.display = "block";

    const resume = document.getElementById("resume").files[0];
    const filePath = `${jobId}/${Date.now()}_${resume.name}`;

    // 1. Upload to Storage - MUST match your dashboard name "RESUMES"
    const { error: uploadError } = await supabase.storage.from("RESUMES").upload(filePath, resume);
    
    if (uploadError) {
        console.error("Upload Error:", uploadError);
        messageBox.textContent = "❌ Upload failed: " + uploadError.message;
        return;
    }

    // 2. Get Public URL
    const { data: urlData } = supabase.storage.from("RESUMES").getPublicUrl(filePath);

    // 3. Insert to Candidates Table
    const { error: insertError } = await supabase.from("candidates").insert({
        full_name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        phone: document.getElementById("phone").value,
        resume_url: urlData.publicUrl,
        job_id: jobId
    });

    if (insertError) {
        console.error("DB Error:", insertError);
        messageBox.textContent = "❌ Database Error: " + insertError.message;
    } else {
        messageBox.textContent = "✅ Success! Application submitted.";
        form.reset();
    }
  });
});

