document.addEventListener("DOMContentLoaded", async () => {

  // 🔹 SUPABASE CONFIG
  const SUPABASE_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_DGT-x86M-BwI4zA7S_97CA_3v3O3b0A";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");
  const jobTitleEl = document.getElementById("jobTitle");

  if (!form) {
    console.error("Form not found");
    return;
  }

  // 🔹 Helper: show messages
  function showMessage(text, type) {
    if (!messageBox) {
      alert(text);
      return;
    }
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.style.display = "block";
  }

  // 🔹 1. READ job_id FROM URL
  const jobId = new URLSearchParams(window.location.search).get("job_id");

  if (!jobId) {
    showMessage("❌ Invalid job link. Please apply from the Jobs page.", "error");
    return;
  }

  // 🔹 2. FETCH JOB DETAILS (for display)
  try {
    const { data: job, error } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      showMessage("❌ Job not found or closed.", "error");
      return;
    }

    if (jobTitleEl) {
      jobTitleEl.textContent = "Applying for: " + job.title;
    }
  } catch (err) {
    console.error(err);
    showMessage("❌ Unable to load job details.", "error");
    return;
  }

  // 🔹 3. FORM SUBMIT HANDLER
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const resumeFile = document.getElementById("resume").files[0];

      if (!name || !email || !phone || !resumeFile) {
        showMessage("❌ Please fill all fields", "error");
        return;
      }

      // 📤 Upload resume
      const filePath = `${Date.now()}_${resumeFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, resumeFile);

      if (uploadError) {
        console.error(uploadError);
        showMessage("❌ Resume upload failed", "error");
        return;
      }

      // 🔗 Get public resume URL
      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(filePath);

      const resumeUrl = urlData.publicUrl;

      // 🧾 Insert candidate (DYNAMIC job_id)
      const { error: insertError } = await supabase
        .from("candidates")
        .insert({
          full_name: name,
          email: email,
          phone: phone,
          resume_url: resumeUrl,
          job_id: jobId
        });

      if (insertError) {
        console.error(insertError);
        showMessage("❌ Application submission failed", "error");
        return;
      }

      // ✅ Success
      showMessage("✅ Application submitted successfully", "success");
      form.reset();

    } catch (err) {
      console.error(err);
      showMessage("❌ Something went wrong. Try again.", "error");
    }
  });

});
