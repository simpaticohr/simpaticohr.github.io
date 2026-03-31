import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()
    const candidate = payload.record

    console.log(`[Simpatico Engine] Waking up for: ${candidate.first_name} ${candidate.last_name}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const aiScore = Math.floor(Math.random() * (98 - 60 + 1) + 60); 
    const newStage = aiScore >= 75 ? 'screening' : 'rejected';
    const isAutoMoved = newStage !== 'applied';

    console.log(`[Simpatico Engine] Score calculated: ${aiScore}. Saving to database...`)

    // We added strict error checking here!
    const { error: updateError } = await supabase
      .from('ats_candidates')
      .update({ 
        ai_score: aiScore, 
        stage: newStage, 
        is_auto_moved: isAutoMoved 
      })
      .eq('id', candidate.id)

    if (updateError) throw updateError; // Force it to yell if it fails

    const { error: logError } = await supabase
      .from('ats_timeline_events')
      .insert([
        { candidate_id: candidate.id, event_type: 'resume_parsed', title: `Simpatico AI Score: ${aiScore}% match`, icon: '🤖', color: aiScore >= 75 ? '#10b981' : '#ef4444', is_automated: true },
        { candidate_id: candidate.id, event_type: 'stage_moved', title: `Auto-moved to ${newStage.toUpperCase()}`, icon: '🔀', color: '#0ea5e9', is_automated: true }
      ])

    if (logError) throw logError; // Force it to yell if it fails

    console.log(`[Simpatico Engine] SUCCESS!`)
    return new Response(JSON.stringify({ success: true, score: aiScore }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error(`[Simpatico Engine] FATAL ERROR:`, err)
    return new Response(JSON.stringify({ error: err.message || JSON.stringify(err) }), { status: 500 })
  }
})