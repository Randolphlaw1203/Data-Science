require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Database configuration read from environment variables (see .env file)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', // Read from .env file or use empty string as default
    database: process.env.DB_NAME || 'student_registration',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// Test connection (non-blocking)
pool.getConnection()
    .then(connection => {
        console.log('Connected to MySQL database');
        connection.release();
    })
    .catch(err => {
        if (err.code === 'ER_BAD_DB_ERROR') {
            console.error('Database "student_registration" does not exist.');
            console.error('Please run: npm run init-db');
        } else {
            console.error('Database connection error:', err.message);
        }
    });

module.exports = pool;


