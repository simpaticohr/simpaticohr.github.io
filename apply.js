<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Apply for Job | Simpatico HR</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js"></script>

  <style>
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f4f6f8; }
    .container { max-width: 420px; margin: 60px auto; background: #ffffff; padding: 25px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); }
    h2 { text-align: center; margin-bottom: 20px; color: #222; }
    label { font-size: 14px; color: #444; display: block; margin-bottom: 6px; }
    input[type="text"], input[type="email"], input[type="file"] { width: 100%; padding: 10px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #000; color: #fff; border: none; border-radius: 6px; font-size: 15px; cursor: pointer; }
    button:disabled { background: #666; cursor: not-allowed; }
    .message { margin-bottom: 15px; padding: 10px; border-radius: 6px; font-size: 14px; display: none; text-align: center; }
    .success { background: #e6f9ed; color: #0f7a3c; border: 1px solid #b6ebc6; }
    .error { background: #fdecea; color: #a32020; border: 1px solid #f5c6cb; }
    .note { margin-top: 15px; font-size: 12px; color: #666; text-align: center; }
  </style>
</head>
<body>

  <div class="container">
    <h2>Job Application</h2>
    
    <div id="messageBox" class="message"></div>

    <form id="applyForm">
      <label for="name">Full Name</label>
      <input type="text" id="name" placeholder="Enter your full name" required />

      <label for="email">Email Address</label>
      <input type="email" id="email" placeholder="Enter your email" required />

      <label for="phone">Phone Number</label>
      <input type="text" id="phone" placeholder="Enter your phone number" required />

      <label for="resume">Upload Resume (PDF)</label>
      <input type="file" id="resume" accept=".pdf" required />

      <button type="submit" id="submitBtn">Submit Application</button>
    </form>

    <div class="note">Powered by <strong>Simpatico ATS</strong></div>
  </div>

  <script src="apply.js"></script>

</body>
</html>

