document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ apply.js loaded");

  const SUPABASE_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_DGT-x86M-BwI4zA7S_97CA_3v3O3b0A";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");
  const jobTitleEl = document.getElementById("jobTitle");

  function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.style.display = "block";
  }

  // 🔍 Read job_id
  const jobId = new URLSearchParams(window.location.search).get("job_id");
  console.log("🔍 job_id:", jobId);

  if (!jobId) {
    showMessage("❌ Invalid job link.", "error");
    return;
  }

  // 🔍 Fetch job
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .maybeSingle();

  console.log("📦 job data:", data, "error:", error);

  if (error || !data) {
    showMessage("❌ Job not found or closed.", "error");
    return;
  }

  // ✅ Display designation
  jobTitleEl.textContent = "Designation: " + data.title;

  // 🧾 Submit application
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

    const filePath = `${jobId}/${Date.now()}_${resume.name}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filePath, resume);

    if (uploadError) {
      showMessage("❌ Resume upload failed", "error");
      return;
    }

    const { data: urlData } = supabase.storage
      .from("resumes")
      .getPublicUrl(filePath);

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
      showMessage("❌ Submission failed", "error");
      return;
    }

    showMessage("✅ Application submitted successfully", "success");
    form.reset();
  });
});
