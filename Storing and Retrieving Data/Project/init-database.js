require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Database configuration for initialization
// Note: database is not specified here as we create 'student_registration' in the schema
// Configuration is read from environment variables (see .env file)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', // Read from .env file or use empty string as default
    multipleStatements: true
};

async function initDatabase() {
    let connection;

    try {
        // Connect without specifying database
        console.log('Connecting to MySQL server...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL server');

        // Read schema file
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Execute schema
        console.log('Creating database and tables...');
        await connection.query(schema);
        console.log('Database and tables created successfully!');

        // Close connection
        await connection.end();

        console.log('\n✅ Database initialization complete!');
        console.log('Next steps:');
        console.log('1. Run: npm run setup (to hash passwords)');
        console.log('2. Run: npm start (to start the server)');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);

        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\n⚠️  MySQL access denied. Please check:');
            console.error('   - MySQL username and password in init-database.js');
            console.error('   - MySQL server is running');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('\n⚠️  Cannot connect to MySQL server. Please check:');
            console.error('   - MySQL server is running on localhost:3306');
        }

        if (connection) {
            await connection.end();
        }
        process.exit(1);
    }
}

initDatabase();