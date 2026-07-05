// Script to remove the unique constraint on staff_id in courses table
// This allows teachers to teach multiple courses

require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'student_registration',
    multipleStatements: true
};

async function removeConstraint() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database');

        // First, check what foreign keys exist
        const [foreignKeys] = await connection.execute(
            `SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
             FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = 'student_registration'
             AND TABLE_NAME = 'courses'
             AND REFERENCED_TABLE_NAME IS NOT NULL`
        );

        console.log('Foreign keys on courses table:', foreignKeys);

        // Check if the constraint exists
        const [indexes] = await connection.execute(
            "SHOW INDEX FROM courses WHERE Key_name = 'unique_teacher_course'"
        );

        if (indexes.length > 0) {
            console.log('Found unique_teacher_course constraint.');

            // Check if there's a foreign key constraint using this index
            // The foreign key on staff_id should still work without the unique constraint
            // Foreign keys don't require uniqueness in the child table

            // Try to drop the index directly
            // If it fails due to foreign key, we'll handle it
            try {
                await connection.execute('ALTER TABLE courses DROP INDEX unique_teacher_course');
                console.log('✅ Successfully removed unique_teacher_course constraint!');
            } catch (fkError) {
                if (fkError.message.includes('foreign key')) {
                    console.log('The index is referenced by a foreign key.');
                    console.log('Dropping and recreating the foreign key...');

                    // Find the foreign key name
                    const [fkInfo] = await connection.execute(
                        `SELECT CONSTRAINT_NAME 
                         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                         WHERE TABLE_SCHEMA = 'student_registration'
                         AND TABLE_NAME = 'courses'
                         AND COLUMN_NAME = 'staff_id'
                         AND REFERENCED_TABLE_NAME = 'staff'`
                    );

                    if (fkInfo.length > 0) {
                        const fkName = fkInfo[0].CONSTRAINT_NAME;
                        console.log(`Dropping foreign key: ${fkName}`);

                        // Drop the foreign key
                        await connection.execute(`ALTER TABLE courses DROP FOREIGN KEY ${fkName}`);

                        // Drop the unique index
                        await connection.execute('ALTER TABLE courses DROP INDEX unique_teacher_course');

                        // Recreate the foreign key (without unique constraint)
                        await connection.execute(
                            'ALTER TABLE courses ADD CONSTRAINT courses_ibfk_1 FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON DELETE SET NULL'
                        );

                        console.log('✅ Successfully removed unique constraint and recreated foreign key!');
                    }
                } else {
                    throw fkError;
                }
            }

            console.log('Teachers can now teach multiple courses.');
        } else {
            console.log('✅ Constraint unique_teacher_course does not exist. No action needed.');
        }

        // Verify the constraint is removed
        const [verifyIndexes] = await connection.execute(
            "SHOW INDEX FROM courses WHERE Key_name = 'unique_teacher_course'"
        );

        if (verifyIndexes.length === 0) {
            console.log('✅ Verification: Constraint successfully removed.');
        }

    } catch (error) {
        if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            console.log('✅ Constraint does not exist. No action needed.');
        } else {
            console.error('Error:', error.message);
            console.error('Full error:', error);
            process.exit(1);
        }
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
}

removeConstraint();