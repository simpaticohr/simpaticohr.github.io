document.addEventListener("DOMContentLoaded", () => {

  // 🔴 SAFETY CHECK 1
  if (!window.supabase) {
    alert("❌ Supabase JS not loaded");
    return;
  }

  const supabase = window.supabase.createClient(
    "https://cvkxtsvgnynxexmemfuy.supabase.co",
    "sb_publishable_DGT-x86M-BwI4zA7S_97CA_3v3O3b0A"
  );

  const form = document.getElementById("applyForm");

  // 🔴 SAFETY CHECK 2
  if (!form) {
    alert("❌ Form not found");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    alert("🟡 Submit clicked"); // MUST appear

    try {
      const name = document.getElementById("name").value;
      const email = document.getElementById("email").value;
      const phone = document.getElementById("phone").value;
      const resumeFile = document.getElementById("resume").files[0];

      if (!resumeFile) {
        alert("❌ Please upload resume");
        return;
      }

      const filePath = `${Date.now()}_${resumeFile.name}`;

      const { error: uploadError } = await supabase
        .storage
        .from("resumes")
        .upload(filePath, resumeFile);

      if (uploadError) {
        alert("❌ Resume upload failed");
        return;
      }

      const { data: urlData } = supabase
        .storage
        .from("resumes")
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from("candidates")
        .insert({
          full_name: name,
          email: email,
          phone: phone,
          resume_url: urlData.publicUrl,
          job_id: "baada626-3e67-4aed-82c4-27c818cba345"
        });

      if (insertError) {
        alert("❌ Application failed");
        return;
      }

      // ✅ FINAL SUCCESS
      alert("✅ Application submitted successfully");
      form.reset();

    } catch (err) {
      alert("🔥 JS crashed: " + err.message);
    }
  });
});
