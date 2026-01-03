
document.addEventListener("DOMContentLoaded", () => {

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

    // ✅ THIS IS THE LINE YOU ASKED FOR
    alert("SUBMIT EVENT FIRED");

    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const phone = document.getElementById("phone").value;
    const resumeFile = document.getElementById("resume").files[0];

    if (!resumeFile) {
      alert("Please upload resume");
      return;
    }

    const filePath = `${Date.now()}_${resumeFile.name}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filePath, resumeFile);

    if (uploadError) {
      alert("Resume upload failed");
      console.error(uploadError);
      return;
    }

    const { data: urlData } = supabase.storage
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
      console.error(insertError);
    } else {
      alert("✅ Application submitted successfully");
      form.reset();
    }
  });

});
