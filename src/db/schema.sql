-- Enable pgcrypto for gen_random_uuid if on older Postgres versions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- TABLE: bots
CREATE TABLE IF NOT EXISTS bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    website_url TEXT,
    description TEXT,
    bot_type VARCHAR(100) DEFAULT 'general',
    system_prompt TEXT,
    welcome_message TEXT DEFAULT 'Hi! How can I help you today?',
    color VARCHAR(20) DEFAULT '#6366f1',
    position VARCHAR(20) DEFAULT 'bottom-right',
    status VARCHAR(50) DEFAULT 'pending',
    chunk_count INTEGER DEFAULT 0,
    whatsapp_number VARCHAR(20),
    lead_capture_enabled BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: chunks
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding FLOAT8[] NOT NULL,
    source_url TEXT,
    source_type VARCHAR(20) DEFAULT 'url',
    chunk_index INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: leads
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    name VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    message TEXT,
    session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_chunks_bot_id ON chunks(bot_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_bot_session ON chat_messages(bot_id, session_id);
CREATE INDEX IF NOT EXISTS idx_leads_bot_id ON leads(bot_id);

-- TRIGGER FUNCTION TO AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_bots_updated_at ON bots;
CREATE TRIGGER update_bots_updated_at
    BEFORE UPDATE ON bots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
