-- Add AI configuration fields to companies table for BYOK (Bring Your Own Key)

-- Add columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'ai_provider') THEN
        ALTER TABLE companies ADD COLUMN ai_provider VARCHAR(50) DEFAULT 'cloudflare';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'ai_api_key') THEN
        ALTER TABLE companies ADD COLUMN ai_api_key VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'ai_base_url') THEN
        ALTER TABLE companies ADD COLUMN ai_base_url VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'ai_model') THEN
        ALTER TABLE companies ADD COLUMN ai_model VARCHAR(100);
    END IF;
END $$;
