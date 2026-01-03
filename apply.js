document.addEventListener("DOMContentLoaded", () => {
  const SUPABASE_URL = "YOUR_PROJECT_URL";
  const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const form = document.getElementById("applyForm");

  if (!form) {
    alert("❌ Form not found");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alert("🟡 Submit clicked");

    try {
      const name = document.getElementById("name").value;
      const email = document.getElementById("email").value;
      const phone = document.getElementById("phone").value;
      const resumeFile = document.getElementById("resume").files[0];

      if (!resumeFile) {
        alert("❌ Resume missing");
        return;
      }

      const filePath = `${Date.now()}_${resumeFile.name}`;

      /* 1️⃣ Upload resume */
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, resumeFile);

      if (uploadError) {
        alert("❌ Upload failed");
        console.error(uploadError);
        return;
      }

      /* 2️⃣ Get public URL (FIXED v2 syntax) */
      const { data: publicUrlData } = await supabase.storage
        .from("resumes")
        .getPublicUrl(filePath);

      const resumeUrl = publicUrlData.publicUrl;

      /* 3️⃣ Insert candidate */
      const { error: insertError } = await supabase
        .from("candidates")
        .insert({
          full_name: name,
          email: email,
          phone: phone,
          resume_url: resumeUrl,
          job_id: "baada626-3e67-4aed-82c4-27c818cba345"
        });

      if (insertError) {
        alert("❌ Database insert failed");
        console.error(insertError);
        return;
      }

      alert("✅ Application submitted successfully");
      form.reset();

    } catch (err) {
      alert("❌ Unexpected error");
      console.error(err);
    }
  });
});
