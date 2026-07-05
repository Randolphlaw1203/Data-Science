-- Student Registration System Database Schema

-- Create database
CREATE DATABASE IF NOT EXISTS student_registration;
USE student_registration;

-- Staff table (for teachers and admins)
CREATE TABLE IF NOT EXISTS staff (
    staff_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    office VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type ENUM('teacher', 'admin') DEFAULT 'teacher',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    address VARCHAR(255),
    mobile VARCHAR(20),
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type ENUM('student') DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    course_id INT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(100) NOT NULL,
    staff_id INT,
    location VARCHAR(100),
    time VARCHAR(50),
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enrollments table (student-course relationship)
CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
    UNIQUE KEY unique_enrollment (student_id, course_id)
);

-- Grades table
CREATE TABLE IF NOT EXISTS grades (
    grade_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    grade VARCHAR(10),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
    UNIQUE KEY unique_grade (student_id, course_id)
);

-- Insert sample data (using INSERT IGNORE to prevent duplicate errors)
-- Default admin account (password: admin123)
-- Note: Run setup-demo-accounts.js after creating the database to hash passwords properly
INSERT IGNORE INTO staff (first_name, last_name, office, email, password, user_type) VALUES
('John', 'Smith', 'Room 101', 'admin@university.edu', 'admin123', 'admin'),
('Jane', 'Doe', 'Room 202', 'teacher@university.edu', 'teacher123', 'teacher');

-- Default student account (password: student123)
-- Note: Run setup-demo-accounts.js after creating the database to hash passwords properly
INSERT IGNORE INTO students (first_name, last_name, address, mobile, email, password, user_type) VALUES
('Alice', 'Johnson', '123 Main St', '555-0101', 'student@university.edu', 'student123', 'student');

-- Sample courses
INSERT IGNORE INTO courses (course_name, staff_id, location, time) VALUES
('Introduction to Computer Science', 1, 'Building A, Room 201', 'Mon/Wed 10:00-11:30'),
('Database Systems', 1, 'Building B, Room 305', 'Tue/Thu 14:00-15:30');

