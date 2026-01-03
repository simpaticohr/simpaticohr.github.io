document.addEventListener("DOMContentLoaded", () => {

  // 🔹 SUPABASE CONFIG (use your real values)
  const SUPABASE_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_DGT-x86M-BwI4zA7S_97CA_3v3O3b0A";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const form = document.getElementById("applyForm");
  const messageBox = document.getElementById("messageBox");

  if (!form) {
    console.error("Form not found");
    return;
  }

  function showMessage(text, type) {
    if (!messageBox) {
      alert(text);
      return;
    }
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.style.display = "block";
  }

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

      // 🧾 Insert into ATS
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
