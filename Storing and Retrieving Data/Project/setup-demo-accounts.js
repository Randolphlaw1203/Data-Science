const bcrypt = require('bcrypt');
const pool = require('./config/database');

async function setupDemoAccounts() {
    try {
        // Hash passwords
        const adminPassword = await bcrypt.hash('admin123', 10);
        const teacherPassword = await bcrypt.hash('teacher123', 10);
        const studentPassword = await bcrypt.hash('student123', 10);

        // Update admin password
        await pool.execute(
            'UPDATE staff SET password = ? WHERE email = ?', [adminPassword, 'admin@university.edu']
        );

        // Update teacher password
        await pool.execute(
            'UPDATE staff SET password = ? WHERE email = ?', [teacherPassword, 'teacher@university.edu']
        );

        // Update student password
        await pool.execute(
            'UPDATE students SET password = ? WHERE email = ?', [studentPassword, 'student@university.edu']
        );

        console.log('Demo accounts updated with hashed passwords!');
        console.log('Admin: admin@university.edu / admin123');
        console.log('Teacher: teacher@university.edu / teacher123');
        console.log('Student: student@university.edu / student123');
        process.exit(0);
    } catch (error) {
        console.error('Error setting up demo accounts:', error);
        process.exit(1);
    }
}

setupDemoAccounts();