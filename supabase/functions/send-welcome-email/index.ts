import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// This grabs your secure Resend API Key
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  try {
    // 1. Grab the new application data from the database
    const payload = await req.json()
    const candidateName = payload.record.name;
    const appliedFor = payload.record.applied_for;

    // 2. Send the email via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', // Keep this exactly as is for the free tier
        to: 'simpaticomanpower@gmail.com', // REPLACE THIS with the email you registered on Resend!
        subject: `New Application: ${candidateName} for ${appliedFor}`,
        html: `<p><strong>${candidateName}</strong> just applied for the <strong>${appliedFor}</strong> position.</p><p>Check your Supabase database for their full details.</p>`
      })
    })

    const data = await res.json()
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
