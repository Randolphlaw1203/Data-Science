-- Remove unique constraint on staff_id to allow teachers to teach multiple courses
-- This constraint was preventing teachers from being assigned to more than one course

USE student_registration;

-- Drop the unique constraint if it exists
ALTER TABLE courses DROP INDEX IF EXISTS unique_teacher_course;

-- Verify the constraint is removed
-- Note: Teachers can now teach multiple courses, but time conflicts are still checked in the application code

