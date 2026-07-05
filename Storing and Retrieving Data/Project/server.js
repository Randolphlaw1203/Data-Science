const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const pool = require('./config/database');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'student-registration-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

const requireTeacher = (req, res, next) => {
    if (!req.session.user || req.session.user.user_type !== 'teacher') {
        return res.status(403).json({ error: 'Teacher access required' });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.user_type !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// ==================== AUTHENTICATION ====================

// Login
app.post('/api/login', async(req, res) => {
    const { email, password, user_type } = req.body;

    try {
        let table, idField;
        if (user_type === 'student') {
            table = 'students';
            idField = 'student_id';
        } else if (user_type === 'teacher' || user_type === 'admin') {
            table = 'staff';
            idField = 'staff_id';
        } else {
            return res.status(400).json({ error: 'Invalid user type' });
        }

        const [users] = await pool.execute(
            `SELECT *, ${idField} as id FROM ${table} WHERE email = ? AND user_type = ?`, [email, user_type]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        // Check password - try bcrypt first, then fallback to plain text for demo
        let validPassword = false;
        try {
            validPassword = await bcrypt.compare(password, user.password);
        } catch (err) {
            // If password is not hashed (plain text), compare directly
            validPassword = password === user.password;
        }

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.user = {
            id: user.id,
            email: user.email,
            user_type: user.user_type,
            first_name: user.first_name,
            last_name: user.last_name
        };

        res.json({
            success: true,
            user: req.session.user,
            message: 'Login successful'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out successfully' });
});

// Get current user
app.get('/api/current-user', requireAuth, (req, res) => {
    res.json({ user: req.session.user });
});

// ==================== STUDENT ENDPOINTS ====================

// Get student profile
app.get('/api/student/profile', requireAuth, async(req, res) => {
    if (req.session.user.user_type !== 'student') {
        return res.status(403).json({ error: 'Student access required' });
    }

    try {
        const [students] = await pool.execute(
            'SELECT student_id, first_name, last_name, address, mobile, email FROM students WHERE student_id = ?', [req.session.user.id]
        );

        if (students.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        res.json(students[0]);
    } catch (error) {
        console.error('Error fetching student profile:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update student profile
app.put('/api/student/profile', requireAuth, async(req, res) => {
    if (req.session.user.user_type !== 'student') {
        return res.status(403).json({ error: 'Student access required' });
    }

    const { first_name, last_name, address, mobile, email } = req.body;

    try {
        await pool.execute(
            'UPDATE students SET first_name = ?, last_name = ?, address = ?, mobile = ?, email = ? WHERE student_id = ?', [first_name, last_name, address, mobile, email, req.session.user.id]
        );

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating student profile:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get available courses
app.get('/api/student/courses', requireAuth, async(req, res) => {
    if (req.session.user.user_type !== 'student') {
        return res.status(403).json({ error: 'Student access required' });
    }

    try {
        const [courses] = await pool.execute(
            `SELECT c.course_id, c.course_name, c.location, c.time, 
                    s.first_name as staff_first_name, s.last_name as staff_last_name,
                    CASE WHEN e.enrollment_id IS NOT NULL THEN 1 ELSE 0 END as is_enrolled
             FROM courses c
             LEFT JOIN staff s ON c.staff_id = s.staff_id
             LEFT JOIN enrollments e ON c.course_id = e.course_id AND e.student_id = ?
             ORDER BY c.course_name`, [req.session.user.id]
        );

        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to parse course time and check for conflicts
function parseCourseTime(timeString) {
    if (!timeString) return null;

    // Parse format like "Mon/Wed 10:00-11:30" or "Tue/Thu 14:00-15:30"
    const dayMap = {
        'Mon': 'Monday',
        'Tue': 'Tuesday',
        'Wed': 'Wednesday',
        'Thu': 'Thursday',
        'Fri': 'Friday',
        'Sat': 'Saturday',
        'Sun': 'Sunday'
    };

    const parts = timeString.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const daysPart = parts[0];
    const timePart = parts.slice(1).join(' ');

    // Extract days (e.g., "Mon/Wed" -> ["Mon", "Wed"])
    const days = daysPart.split('/').map(d => dayMap[d.trim()] || d.trim()).filter(Boolean);

    // Extract time range (e.g., "10:00-11:30")
    const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) return null;

    const startHour = parseInt(timeMatch[1]);
    const startMin = parseInt(timeMatch[2]);
    const endHour = parseInt(timeMatch[3]);
    const endMin = parseInt(timeMatch[4]);

    const startTime = startHour * 60 + startMin; // Convert to minutes
    const endTime = endHour * 60 + endMin;

    return { days, startTime, endTime };
}

function checkTimeConflict(time1, time2) {
    if (!time1 || !time2) return false;

    // Check if any days overlap
    const commonDays = time1.days.filter(day => time2.days.includes(day));
    if (commonDays.length === 0) return false;

    // Check if time ranges overlap
    return !(time1.endTime <= time2.startTime || time1.startTime >= time2.endTime);
}

// Register for course
app.post('/api/student/courses/:courseId/register', requireAuth, async(req, res) => {
    if (req.session.user.user_type !== 'student') {
        return res.status(403).json({ error: 'Student access required' });
    }

    const courseId = req.params.courseId;

    try {
        // Check if already registered
        const [existing] = await pool.execute(
            'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?', [req.session.user.id, courseId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Already registered for this course' });
        }

        // Get the course being registered
        const [newCourse] = await pool.execute(
            'SELECT course_id, course_name, time FROM courses WHERE course_id = ?', [courseId]
        );

        if (newCourse.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const newCourseTime = parseCourseTime(newCourse[0].time);

        // Get all enrolled courses for this student
        const [enrolledCourses] = await pool.execute(
            `SELECT c.course_id, c.course_name, c.time 
             FROM courses c
             INNER JOIN enrollments e ON c.course_id = e.course_id
             WHERE e.student_id = ?`, [req.session.user.id]
        );

        // Check for time conflicts (only if both courses have valid times)
        if (newCourseTime) {
            for (const enrolledCourse of enrolledCourses) {
                const enrolledTime = parseCourseTime(enrolledCourse.time);

                // Only check conflict if both courses have valid time information
                if (enrolledTime && checkTimeConflict(newCourseTime, enrolledTime)) {
                    return res.status(400).json({
                        error: `Time conflict detected! This course conflicts with "${enrolledCourse.course_name}" (${enrolledCourse.time || 'No time set'})`
                    });
                }
            }
        }

        // No conflicts, proceed with registration
        await pool.execute(
            'INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)', [req.session.user.id, courseId]
        );

        res.json({ success: true, message: 'Successfully registered for course' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Already registered for this course' });
        }
        console.error('Error registering for course:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Unregister from course
app.delete('/api/student/courses/:courseId/register', requireAuth, async(req, res) => {
    if (req.session.user.user_type !== 'student') {
        return res.status(403).json({ error: 'Student access required' });
    }

    const courseId = req.params.courseId;

    try {
        const [result] = await pool.execute(
            'DELETE FROM enrollments WHERE student_id = ? AND course_id = ?', [req.session.user.id, courseId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        res.json({ success: true, message: 'Successfully unregistered from course' });
    } catch (error) {
        console.error('Error unregistering from course:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get student grades
app.get('/api/student/grades', requireAuth, async(req, res) => {
    if (req.session.user.user_type !== 'student') {
        return res.status(403).json({ error: 'Student access required' });
    }

    try {
        const [grades] = await pool.execute(
            `SELECT c.course_id, c.course_name, COALESCE(g.grade, 'N/A') as grade
             FROM enrollments e
             JOIN courses c ON e.course_id = c.course_id
             LEFT JOIN grades g ON e.student_id = g.student_id AND e.course_id = g.course_id
             WHERE e.student_id = ?
             ORDER BY c.course_name`, [req.session.user.id]
        );

        res.json(grades);
    } catch (error) {
        console.error('Error fetching grades:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get staff details
app.get('/api/student/staff', requireAuth, async(req, res) => {
    if (req.session.user.user_type !== 'student') {
        return res.status(403).json({ error: 'Student access required' });
    }

    try {
        const [staff] = await pool.execute(
            'SELECT staff_id, first_name, last_name, office, email FROM staff ORDER BY last_name, first_name'
        );

        res.json(staff);
    } catch (error) {
        console.error('Error fetching staff:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== TEACHER ENDPOINTS ====================

// Get all courses (Teachers see only their courses)
app.get('/api/staff/courses', requireAuth, requireTeacher, async(req, res) => {
    try {
        // Teachers only see their own courses
        const query = `SELECT c.course_id, c.course_name, c.location, c.time, 
                c.staff_id, s.first_name as staff_first_name, s.last_name as staff_last_name
         FROM courses c
         LEFT JOIN staff s ON c.staff_id = s.staff_id
         WHERE c.staff_id = ?
         ORDER BY c.course_name`;
        const params = [req.session.user.id];

        const [courses] = await pool.execute(query, params);
        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update course (Teacher for their own courses)
app.put('/api/staff/courses/:courseId', requireAuth, requireTeacher, async(req, res) => {
    const courseId = req.params.courseId;
    const { course_name, location, time } = req.body;

    try {
        // Check if teacher is updating their own course
        const [courses] = await pool.execute(
            'SELECT staff_id FROM courses WHERE course_id = ?', [courseId]
        );
        if (courses.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        if (courses[0].staff_id !== req.session.user.id) {
            return res.status(403).json({ error: 'You can only update your own courses' });
        }

        await pool.execute(
            'UPDATE courses SET course_name = ?, location = ?, time = ? WHERE course_id = ?', [course_name, location, time, courseId]
        );

        res.json({ success: true, message: 'Course updated successfully' });
    } catch (error) {
        console.error('Error updating course:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get enrollments for a course (Teachers see only their courses)
app.get('/api/staff/courses/:courseId/enrollments', requireAuth, requireTeacher, async(req, res) => {
    const courseId = req.params.courseId;

    try {
        const [enrollments] = await pool.execute(
            `SELECT e.enrollment_id, e.student_id, s.first_name, s.last_name, s.email
             FROM enrollments e
             JOIN students s ON e.student_id = s.student_id
             WHERE e.course_id = ?
             ORDER BY s.last_name, s.first_name`, [courseId]
        );

        res.json(enrollments);
    } catch (error) {
        console.error('Error fetching enrollments:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add student to course (Teachers can add to their courses)
app.post('/api/staff/courses/:courseId/enrollments', requireAuth, requireTeacher, async(req, res) => {
    const courseId = req.params.courseId;
    const { student_id } = req.body;

    try {
        await pool.execute(
            'INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)', [student_id, courseId]
        );

        res.json({ success: true, message: 'Student added to course successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Student already enrolled in this course' });
        }
        console.error('Error adding student to course:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove student from course (Teachers can remove from their courses)
app.delete('/api/staff/courses/:courseId/enrollments/:enrollmentId', requireAuth, requireTeacher, async(req, res) => {
    const enrollmentId = req.params.enrollmentId;

    try {
        await pool.execute(
            'DELETE FROM enrollments WHERE enrollment_id = ?', [enrollmentId]
        );

        res.json({ success: true, message: 'Student removed from course successfully' });
    } catch (error) {
        console.error('Error removing student from course:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all grades (Teachers see only their courses)
app.get('/api/staff/grades', requireAuth, requireTeacher, async(req, res) => {
    try {
        // Teachers only see grades for their courses
        const query = `SELECT e.student_id, e.course_id, 
                s.first_name as student_first_name, s.last_name as student_last_name,
                c.course_name,
                COALESCE(g.grade, NULL) as grade,
                g.grade_id
         FROM enrollments e
         JOIN students s ON e.student_id = s.student_id
         JOIN courses c ON e.course_id = c.course_id
         LEFT JOIN grades g ON e.student_id = g.student_id AND e.course_id = g.course_id
         WHERE c.staff_id = ?
         ORDER BY c.course_name, s.last_name, s.first_name`;
        const params = [req.session.user.id];

        const [grades] = await pool.execute(query, params);
        res.json(grades);
    } catch (error) {
        console.error('Error fetching grades:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to convert numeric score to letter grade
function convertScoreToGrade(score) {
    const numScore = parseFloat(score);

    // If it's already a letter grade, return it as is
    if (isNaN(numScore)) {
        return score; // Return the original value if it's not a number
    }

    // Convert numeric score to letter grade (using >= for inclusive ranges)
    if (numScore >= 95) return 'A+';
    if (numScore >= 90) return 'A';
    if (numScore >= 85) return 'A-';
    if (numScore >= 80) return 'B+';
    if (numScore >= 75) return 'B';
    if (numScore >= 70) return 'B-';
    if (numScore >= 65) return 'C+';
    if (numScore >= 60) return 'C';
    if (numScore >= 55) return 'C-';
    if (numScore >= 50) return 'D';
    return 'F'; // <50
}

// Update or create grade (Teachers can grade their courses)
app.put('/api/staff/grades', requireAuth, requireTeacher, async(req, res) => {
    const { student_id, course_id, grade } = req.body;

    if (!student_id || !course_id) {
        return res.status(400).json({ error: 'Student ID and Course ID are required' });
    }

    try {
        // Check if enrollment exists
        const [enrollment] = await pool.execute(
            'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?', [student_id, course_id]
        );

        if (enrollment.length === 0) {
            return res.status(400).json({ error: 'Student is not enrolled in this course' });
        }

        // Check if teacher is grading their own course
        const [courses] = await pool.execute(
            'SELECT staff_id FROM courses WHERE course_id = ?', [course_id]
        );
        if (courses.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        if (courses[0].staff_id !== req.session.user.id) {
            return res.status(403).json({ error: 'You can only grade students in your own courses' });
        }

        // If grade is null or empty, delete the grade record
        if (grade === null || grade === '') {
            await pool.execute(
                'DELETE FROM grades WHERE student_id = ? AND course_id = ?', [student_id, course_id]
            );
            return res.json({ success: true, message: 'Grade cleared successfully' });
        }

        // Convert numeric score to letter grade if it's a number
        const letterGrade = convertScoreToGrade(grade);

        // Insert or update grade
        await pool.execute(
            `INSERT INTO grades (student_id, course_id, grade) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE grade = ?`, [student_id, course_id, letterGrade, letterGrade]
        );

        res.json({
            success: true,
            message: 'Grade updated successfully',
            letterGrade: letterGrade,
            originalInput: grade
        });
    } catch (error) {
        console.error('Error updating grade:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// Get all students (Admin only)
app.get('/api/admin/students', requireAuth, requireAdmin, async(req, res) => {
    try {
        const [students] = await pool.execute(
            'SELECT student_id, first_name, last_name, address, mobile, email FROM students ORDER BY last_name, first_name'
        );

        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get student by ID (Admin only)
app.get('/api/admin/students/:studentId', requireAuth, requireAdmin, async(req, res) => {
    const studentId = req.params.studentId;

    try {
        const [students] = await pool.execute(
            'SELECT student_id, first_name, last_name, address, mobile, email FROM students WHERE student_id = ?', [studentId]
        );

        if (students.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        res.json(students[0]);
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add new student (Admin only)
app.post('/api/admin/students', requireAuth, requireAdmin, async(req, res) => {
    const { first_name, last_name, address, mobile, email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password || 'student123', 10);
        const [result] = await pool.execute(
            'INSERT INTO students (first_name, last_name, address, mobile, email, password) VALUES (?, ?, ?, ?, ?, ?)', [first_name, last_name, address, mobile, email, hashedPassword]
        );

        res.json({ success: true, student_id: result.insertId, message: 'Student added successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        console.error('Error adding student:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update student (Admin only)
app.put('/api/admin/students/:studentId', requireAuth, requireAdmin, async(req, res) => {
    const studentId = req.params.studentId;
    const { first_name, last_name, address, mobile, email } = req.body;

    try {
        await pool.execute(
            'UPDATE students SET first_name = ?, last_name = ?, address = ?, mobile = ?, email = ? WHERE student_id = ?', [first_name, last_name, address, mobile, email, studentId]
        );

        res.json({ success: true, message: 'Student updated successfully' });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete student (Admin only)
app.delete('/api/admin/students/:studentId', requireAuth, requireAdmin, async(req, res) => {
    const studentId = req.params.studentId;

    try {
        // Validate student ID
        if (!studentId || isNaN(studentId)) {
            return res.status(400).json({ error: 'Invalid student ID' });
        }

        // Check if student exists
        const [students] = await pool.execute(
            'SELECT student_id FROM students WHERE student_id = ?', [studentId]
        );

        if (students.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Delete related records first, then the student
        // Using explicit deletion to ensure proper cleanup
        await pool.execute('DELETE FROM grades WHERE student_id = ?', [studentId]);
        await pool.execute('DELETE FROM enrollments WHERE student_id = ?', [studentId]);
        await pool.execute('DELETE FROM students WHERE student_id = ?', [studentId]);

        res.json({ success: true, message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Error deleting student:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ error: 'Cannot delete student: There are still references to this student in the database.' });
        }
        res.status(500).json({ error: 'Server error: ' + (error.message || 'Unknown error') });
    }
});

// Get all teachers (Admin only)
app.get('/api/admin/teachers', requireAuth, requireAdmin, async(req, res) => {
    try {
        const [teachers] = await pool.execute(
            'SELECT staff_id, first_name, last_name, office, email FROM staff WHERE user_type = ? ORDER BY last_name, first_name', ['teacher']
        );

        res.json(teachers);
    } catch (error) {
        console.error('Error fetching teachers:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get teacher by ID (Admin only)
app.get('/api/admin/teachers/:teacherId', requireAuth, requireAdmin, async(req, res) => {
    const teacherId = req.params.teacherId;

    try {
        const [teachers] = await pool.execute(
            'SELECT staff_id, first_name, last_name, office, email FROM staff WHERE staff_id = ? AND user_type = ?', [teacherId, 'teacher']
        );

        if (teachers.length === 0) {
            return res.status(404).json({ error: 'Teacher not found' });
        }

        res.json(teachers[0]);
    } catch (error) {
        console.error('Error fetching teacher:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add new teacher (Admin only)
app.post('/api/admin/teachers', requireAuth, requireAdmin, async(req, res) => {
    const { first_name, last_name, office, email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password || 'teacher123', 10);
        const [result] = await pool.execute(
            'INSERT INTO staff (first_name, last_name, office, email, password, user_type) VALUES (?, ?, ?, ?, ?, ?)', [first_name, last_name, office, email, hashedPassword, 'teacher']
        );

        res.json({ success: true, staff_id: result.insertId, message: 'Teacher added successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        console.error('Error adding teacher:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update teacher (Admin only)
app.put('/api/admin/teachers/:teacherId', requireAuth, requireAdmin, async(req, res) => {
    const teacherId = req.params.teacherId;
    const { first_name, last_name, office, email } = req.body;

    try {
        await pool.execute(
            'UPDATE staff SET first_name = ?, last_name = ?, office = ?, email = ? WHERE staff_id = ? AND user_type = ?', [first_name, last_name, office, email, teacherId, 'teacher']
        );

        res.json({ success: true, message: 'Teacher updated successfully' });
    } catch (error) {
        console.error('Error updating teacher:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete teacher (Admin only)
app.delete('/api/admin/teachers/:teacherId', requireAuth, requireAdmin, async(req, res) => {
    const teacherId = req.params.teacherId;

    try {
        // Validate teacher ID
        if (!teacherId || isNaN(teacherId)) {
            return res.status(400).json({ error: 'Invalid teacher ID' });
        }

        // Check if teacher exists
        const [teachers] = await pool.execute(
            'SELECT staff_id FROM staff WHERE staff_id = ? AND user_type = ?', [teacherId, 'teacher']
        );

        if (teachers.length === 0) {
            return res.status(404).json({ error: 'Teacher not found' });
        }

        // Unassign courses from this teacher (set staff_id to NULL)
        // This is safe because the foreign key has ON DELETE SET NULL
        await pool.execute(
            'UPDATE courses SET staff_id = NULL WHERE staff_id = ?', [teacherId]
        );

        // Delete teacher
        await pool.execute(
            'DELETE FROM staff WHERE staff_id = ? AND user_type = ?', [teacherId, 'teacher']
        );

        res.json({ success: true, message: 'Teacher deleted successfully. Courses have been unassigned.' });
    } catch (error) {
        console.error('Error deleting teacher:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_ROW_IS_REFERENCED') {
            return res.status(400).json({ error: 'Cannot delete teacher: There are still references to this teacher in the database.' });
        }
        res.status(500).json({ error: 'Server error: ' + (error.message || 'Unknown error') + ' (Code: ' + (error.code || 'N/A') + ')' });
    }
});

// Get all courses (Admin only)
app.get('/api/admin/courses', requireAuth, requireAdmin, async(req, res) => {
    try {
        const [courses] = await pool.execute(
            `SELECT c.course_id, c.course_name, c.location, c.time, 
                    c.staff_id, s.first_name as staff_first_name, s.last_name as staff_last_name
             FROM courses c
             LEFT JOIN staff s ON c.staff_id = s.staff_id
             ORDER BY c.course_name`
        );

        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get course by ID (Admin only)
app.get('/api/admin/courses/:courseId', requireAuth, requireAdmin, async(req, res) => {
    const courseId = req.params.courseId;

    try {
        const [courses] = await pool.execute(
            `SELECT c.course_id, c.course_name, c.location, c.time, 
                    c.staff_id, s.first_name as staff_first_name, s.last_name as staff_last_name
             FROM courses c
             LEFT JOIN staff s ON c.staff_id = s.staff_id
             WHERE c.course_id = ?`, [courseId]
        );

        if (courses.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json(courses[0]);
    } catch (error) {
        console.error('Error fetching course:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add new course (Admin only)
app.post('/api/admin/courses', requireAuth, requireAdmin, async(req, res) => {
    const { course_name, staff_id, location, time } = req.body;

    try {
        // Validate required fields
        if (!course_name || course_name.toString().trim() === '') {
            return res.status(400).json({ error: 'Course name is required' });
        }

        // If a teacher is assigned and time is provided, check for time conflicts
        // Teachers CAN teach multiple courses, but they cannot have overlapping times
        if (staff_id && staff_id.toString().trim() !== '' && time && time.toString().trim() !== '') {
            const timeStr = time.toString().trim();
            const newCourseTime = parseCourseTime(timeStr);

            if (!newCourseTime) {
                // If time cannot be parsed, still allow it (might be invalid format, but don't block)
                console.warn(`Warning: Could not parse time format: "${timeStr}"`);
            } else {
                // Get all courses currently assigned to this teacher
                const [existingCourses] = await pool.execute(
                    'SELECT course_id, course_name, time FROM courses WHERE staff_id = ? AND time IS NOT NULL AND time != ?', [staff_id, '']
                );

                // Check for time conflicts
                for (const existingCourse of existingCourses) {
                    if (existingCourse.time && existingCourse.time.trim() !== '') {
                        const existingTime = parseCourseTime(existingCourse.time);
                        if (existingTime && checkTimeConflict(newCourseTime, existingTime)) {
                            return res.status(400).json({
                                error: `Time conflict: This course conflicts with "${existingCourse.course_name}" (${existingCourse.time}). Please choose a different time or assign a different teacher.`
                            });
                        }
                    }
                }
            }
        }

        // Insert the course - allow multiple courses per teacher as long as times don't conflict
        const [result] = await pool.execute(
            'INSERT INTO courses (course_name, staff_id, location, time) VALUES (?, ?, ?, ?)', [course_name, (staff_id && staff_id.toString().trim() !== '') ? staff_id : null, location || null, (time && time.toString().trim() !== '') ? time : null]
        );

        res.json({ success: true, course_id: result.insertId, message: 'Course added successfully' });
    } catch (error) {
        console.error('Error adding course:', error);
        res.status(500).json({ error: 'Server error: ' + (error.message || 'Unknown error') });
    }
});

// Update course (Admin only)
app.put('/api/admin/courses/:courseId', requireAuth, requireAdmin, async(req, res) => {
    const courseId = req.params.courseId;
    const { course_name, staff_id, location, time } = req.body;

    try {
        // Validate course ID
        if (!courseId || isNaN(courseId)) {
            return res.status(400).json({ error: 'Invalid course ID' });
        }

        // If a teacher is assigned and time is provided, check for time conflicts
        // Teachers CAN teach multiple courses, but they cannot have overlapping times
        if (staff_id && staff_id.toString().trim() !== '' && time && time.toString().trim() !== '') {
            const timeStr = time.toString().trim();
            const newCourseTime = parseCourseTime(timeStr);

            if (!newCourseTime) {
                // If time cannot be parsed, still allow it (might be invalid format, but don't block)
                console.warn(`Warning: Could not parse time format: "${timeStr}"`);
            } else {
                // Get all courses currently assigned to this teacher (excluding the current course being updated)
                const [existingCourses] = await pool.execute(
                    'SELECT course_id, course_name, time FROM courses WHERE staff_id = ? AND course_id != ? AND time IS NOT NULL AND time != ?', [staff_id, courseId, '']
                );

                // Check for time conflicts
                for (const existingCourse of existingCourses) {
                    if (existingCourse.time && existingCourse.time.trim() !== '') {
                        const existingTime = parseCourseTime(existingCourse.time);
                        if (existingTime && checkTimeConflict(newCourseTime, existingTime)) {
                            return res.status(400).json({
                                error: `Time conflict: This course conflicts with "${existingCourse.course_name}" (${existingCourse.time}). Please choose a different time or assign a different teacher.`
                            });
                        }
                    }
                }
            }
        }

        // Update the course - allow multiple courses per teacher as long as times don't conflict
        await pool.execute(
            'UPDATE courses SET course_name = ?, staff_id = ?, location = ?, time = ? WHERE course_id = ?', [course_name, (staff_id && staff_id.toString().trim() !== '') ? staff_id : null, location || null, (time && time.toString().trim() !== '') ? time : null, courseId]
        );

        res.json({ success: true, message: 'Course updated successfully' });
    } catch (error) {
        console.error('Error updating course:', error);
        res.status(500).json({ error: 'Server error: ' + (error.message || 'Unknown error') });
    }
});

// Delete course (Admin only)
app.delete('/api/admin/courses/:courseId', requireAuth, requireAdmin, async(req, res) => {
    const courseId = req.params.courseId;

    try {
        // Validate course ID
        if (!courseId || isNaN(courseId)) {
            return res.status(400).json({ error: 'Invalid course ID' });
        }

        // Check if course exists
        const [courses] = await pool.execute(
            'SELECT course_id, course_name FROM courses WHERE course_id = ?', [courseId]
        );

        if (courses.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Delete related records first, then the course
        // Using explicit deletion to ensure proper cleanup
        await pool.execute('DELETE FROM grades WHERE course_id = ?', [courseId]);
        await pool.execute('DELETE FROM enrollments WHERE course_id = ?', [courseId]);
        await pool.execute('DELETE FROM courses WHERE course_id = ?', [courseId]);

        res.json({ success: true, message: 'Course deleted successfully. All enrollments and grades for this course have been removed.' });
    } catch (error) {
        console.error('Error deleting course:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_ROW_IS_REFERENCED') {
            return res.status(400).json({ error: 'Cannot delete course: It is still referenced by other records. Please remove all enrollments and grades first.' });
        }
        res.status(500).json({ error: 'Server error: ' + (error.message || 'Unknown error') + ' (Code: ' + (error.code || 'N/A') + ')' });
    }
});

// Get all grades (Admin only - sees all grades)
app.get('/api/admin/grades', requireAuth, requireAdmin, async(req, res) => {
    try {
        const query = `SELECT e.student_id, e.course_id, 
                s.first_name as student_first_name, s.last_name as student_last_name,
                c.course_name,
                COALESCE(g.grade, NULL) as grade,
                g.grade_id
         FROM enrollments e
         JOIN students s ON e.student_id = s.student_id
         JOIN courses c ON e.course_id = c.course_id
         LEFT JOIN grades g ON e.student_id = g.student_id AND e.course_id = g.course_id
         ORDER BY c.course_name, s.last_name, s.first_name`;

        const [grades] = await pool.execute(query);
        res.json(grades);
    } catch (error) {
        console.error('Error fetching grades:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update or create grade (Admin only - can grade any course)
app.put('/api/admin/grades', requireAuth, requireAdmin, async(req, res) => {
    const { student_id, course_id, grade } = req.body;

    if (!student_id || !course_id) {
        return res.status(400).json({ error: 'Student ID and Course ID are required' });
    }

    try {
        // Check if enrollment exists
        const [enrollment] = await pool.execute(
            'SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?', [student_id, course_id]
        );

        if (enrollment.length === 0) {
            return res.status(400).json({ error: 'Student is not enrolled in this course' });
        }

        // If grade is null or empty, delete the grade record
        if (grade === null || grade === '') {
            await pool.execute(
                'DELETE FROM grades WHERE student_id = ? AND course_id = ?', [student_id, course_id]
            );
            return res.json({ success: true, message: 'Grade cleared successfully' });
        }

        // Convert numeric score to letter grade if it's a number
        const letterGrade = convertScoreToGrade(grade);

        // Insert or update grade
        await pool.execute(
            `INSERT INTO grades (student_id, course_id, grade) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE grade = ?`, [student_id, course_id, letterGrade, letterGrade]
        );

        res.json({
            success: true,
            message: 'Grade updated successfully',
            letterGrade: letterGrade,
            originalInput: grade
        });
    } catch (error) {
        console.error('Error updating grade:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});