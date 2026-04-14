import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()
    const application = payload.record

    console.log(`[Simpatico Engine] Waking up for: ${application.candidate_name || application.candidate_email}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const matchScore = Math.floor(Math.random() * (98 - 60 + 1) + 60); 
    const newStatus = matchScore >= 75 ? 'screening' : 'rejected';

    console.log(`[Simpatico Engine] Score calculated: ${matchScore}. Saving to database...`)

    // We added strict error checking here!
    const { error: updateError } = await supabase
      .from('job_applications')
      .update({ 
        match_score: matchScore, 
        status: newStatus
      })
      .eq('id', application.id)

    if (updateError) throw updateError; // Force it to yell if it fails

    console.log(`[Simpatico Engine] SUCCESS!`)
    return new Response(JSON.stringify({ success: true, score: matchScore }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error(`[Simpatico Engine] FATAL ERROR:`, err)
    return new Response(JSON.stringify({ error: err.message || JSON.stringify(err) }), { status: 500 })
  }
})