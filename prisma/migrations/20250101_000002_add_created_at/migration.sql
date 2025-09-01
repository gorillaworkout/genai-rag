-- Migration: Add created_at column to documents table
-- Date: 2025-01-01

-- Add created_at column with default value
ALTER TABLE documents 
ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update existing records to have a reasonable created_at value
-- Using current timestamp for existing records
UPDATE documents 
SET created_at = CURRENT_TIMESTAMP 
WHERE created_at IS NULL;

-- Make the column NOT NULL after updating existing records
ALTER TABLE documents 
ALTER COLUMN created_at SET NOT NULL;

-- Add index for better performance on ordering
CREATE INDEX idx_documents_created_at ON documents(created_at);
