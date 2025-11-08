-- =====================================================
-- Add Resume Fields to Employee Profiles
-- Migration for My Profile Page Feature
-- =====================================================

USE workzen_hrms;

-- Add resume-related columns to employee_profiles table
ALTER TABLE employee_profiles
ADD COLUMN IF NOT EXISTS about TEXT COMMENT 'About section for resume',
ADD COLUMN IF NOT EXISTS what_i_love TEXT COMMENT 'What I love about my job',
ADD COLUMN IF NOT EXISTS interests TEXT COMMENT 'My interests and hobbies',
ADD COLUMN IF NOT EXISTS skills JSON COMMENT 'Array of skills',
ADD COLUMN IF NOT EXISTS certifications JSON COMMENT 'Array of certifications';

-- Update existing records to have empty arrays for JSON fields
UPDATE employee_profiles 
SET skills = JSON_ARRAY(),
    certifications = JSON_ARRAY()
WHERE skills IS NULL OR certifications IS NULL;
