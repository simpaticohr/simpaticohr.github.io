import { Resend } from 'resend';

const resend = new Resend('re_bk16EQdg_Dy7RsnGWHDdcQsBa49RFhP5V');

async function run() {
  try {
    const response = await resend.emails.send({
      from: 'Simpatico ATS <hr@ats.simpaticohr.in>',
      to: 'faisalkvn@gmail.com',
      subject: 'Test Email ✅',
      html: '<h1>Email Working 🚀</h1>'
    });

    console.log("SUCCESS:", response);
  } catch (err) {
    console.error("ERROR:", err);
  }
}

run();