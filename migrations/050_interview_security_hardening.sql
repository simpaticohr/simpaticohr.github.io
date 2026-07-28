-- ═══════════════════════════════════════════════════════════════════════════
-- 050_interview_security_hardening.sql
--
-- Closes the score-tampering hole in the proctored interview room.
-- Previously the candidate's browser PATCHed `interviews` and INSERTed into
-- `interview_answers` directly with the PUBLIC anon key — anyone could set
-- their own overall_score / trust_score / status from devtools.
--
-- After this migration ALL writes go through the Cloudflare Worker
-- (POST /api/interview/save — token-validated, field-whitelisted, service key).
-- The browser keeps SELECT-only access (the room + results pages read by token).
--
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── interviews ──────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.interviews ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.interviews FROM anon;
GRANT SELECT ON public.interviews TO anon;

DROP POLICY IF EXISTS "anon_read_interviews" ON public.interviews;
CREATE POLICY "anon_read_interviews" ON public.interviews
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "service_full_access" ON public.interviews;
CREATE POLICY "service_full_access" ON public.interviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── interview_answers ───────────────────────────────────────────────────────
-- NOTE: this table was never created by any prior migration — per-answer
-- records have been silently failing to save in production (the old client
-- swallowed the errors). Create it first, then harden it.
CREATE TABLE IF NOT EXISTS public.interview_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  interview_id UUID REFERENCES public.interviews(id) ON DELETE CASCADE,
  question_number INT DEFAULT 0,
  answer_text TEXT,
  score INT DEFAULT 0,
  word_count INT DEFAULT 0,
  flags JSONB DEFAULT '[]'::jsonb,
  phase TEXT,
  detected_skill TEXT
);

CREATE INDEX IF NOT EXISTS interview_answers_interview_id_idx
  ON public.interview_answers(interview_id);

ALTER TABLE IF EXISTS public.interview_answers ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.interview_answers FROM anon;
GRANT SELECT ON public.interview_answers TO anon;

DROP POLICY IF EXISTS "anon_read_interview_answers" ON public.interview_answers;
CREATE POLICY "anon_read_interview_answers" ON public.interview_answers
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "service_full_access" ON public.interview_answers;
CREATE POLICY "service_full_access" ON public.interview_answers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── proctor_logs: intentionally untouched ───────────────────────────────────
-- The room still INSERTs proctoring events directly (append-only telemetry,
-- no scores). Revoke here too if you move that write through the Worker later.

NOTIFY pgrst, 'reload schema';
