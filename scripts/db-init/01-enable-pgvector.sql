-- Enable pgvector extension on first container startup.
-- Subsequent boots are no-ops because the data volume persists.
CREATE EXTENSION IF NOT EXISTS vector;
