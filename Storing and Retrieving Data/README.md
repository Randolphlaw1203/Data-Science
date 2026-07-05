# Student Registration System

A web-based student registration system with separate access for students and staff members.

## Features

### Student Access
- **Profile Management**: Students can view and update their own details (First Name, Last Name, Address, Mobile, Email)
- **Course Registration**: Register and unregister from available courses
- **Grade Viewing**: Check grades for registered courses (shows N/A if no grade is available)
- **Staff Directory**: View staff details (First Name, Last Name, Office, Email)

### Staff Access
- **Student Management**: View, add, and edit student information
- **Course Management**: Create, update, and manage courses (Course Name, Staff, Location, Time)
- **Enrollment Management**: Add or remove students from courses
- **Grade Management**: Update student grades for courses
- **Staff Management**: View, add, and edit staff member information

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript (Node.js for serving)
- **Backend**: Node.js with Express.js
- **Database**: MySQL (localhost:3306)

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- MySQL Server (running on localhost:3306)
- npm (Node Package Manager)

### Installation Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Database**
   - Update the MySQL password in `config/database.js` and `init-database.js` if needed (default is empty password)
   - **Option 1 (Recommended)**: Use the automated setup script:
   ```bash
   npm run init-db
   ```
   This will create the database and all tables automatically.
   - **Option 2**: Manually run the SQL file:
   ```bash
   mysql -u root -p < database/schema.sql
   ```
   Or open MySQL Workbench and execute the SQL commands in `database/schema.sql`
   - After creating the database, run the setup script to hash passwords:
   ```bash
   npm run setup
   ```

3. **Start the Server**
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the Application**
   - Open your web browser and navigate to: `http://localhost:3000`
   - Use the demo accounts to login:
     - **Staff**: admin@university.edu / admin123
     - **Student**: student@university.edu / student123

## Project Structure

```
5003Project/
├── config/
│   └── database.js          # MySQL database configuration
├── database/
│   └── schema.sql           # Database schema and sample data
├── public/
│   ├── index.html           # Login page
│   ├── student.html         # Student dashboard
│   ├── staff.html           # Staff dashboard
│   ├── styles.css           # CSS styling
│   ├── login.js             # Login functionality
│   ├── student.js           # Student dashboard logic
│   └── staff.js             # Staff dashboard logic
├── server.js                # Express.js server and API endpoints
├── package.json             # Node.js dependencies
└── README.md                # This file
```

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/current-user` - Get current logged-in user

### Student Endpoints
- `GET /api/student/profile` - Get student profile
- `PUT /api/student/profile` - Update student profile
- `GET /api/student/courses` - Get available courses
- `POST /api/student/courses/:courseId/register` - Register for course
- `DELETE /api/student/courses/:courseId/register` - Unregister from course
- `GET /api/student/grades` - Get student grades
- `GET /api/student/staff` - Get staff directory

### Staff Endpoints
- `GET /api/staff/students` - Get all students
- `GET /api/staff/students/:studentId` - Get student by ID
- `POST /api/staff/students` - Add new student
- `PUT /api/staff/students/:studentId` - Update student
- `GET /api/staff/courses` - Get all courses
- `POST /api/staff/courses` - Add new course
- `PUT /api/staff/courses/:courseId` - Update course
- `GET /api/staff/courses/:courseId/enrollments` - Get course enrollments
- `POST /api/staff/courses/:courseId/enrollments` - Add student to course
- `DELETE /api/staff/courses/:courseId/enrollments/:enrollmentId` - Remove student from course
- `GET /api/staff/grades` - Get all grades
- `PUT /api/staff/grades` - Update/create grade
- `GET /api/staff/staff` - Get all staff
- `POST /api/staff/staff` - Add new staff
- `PUT /api/staff/staff/:staffId` - Update staff

## Database Schema

- **staff**: Staff member information
- **students**: Student information
- **courses**: Course information
- **enrollments**: Student-course enrollment relationships
- **grades**: Student grades for courses

## Security Notes

- Passwords are hashed using bcrypt
- Session-based authentication
- Role-based access control (student vs staff)
- SQL injection protection using parameterized queries

## Default Accounts

After running the schema.sql file, you'll have:
- **Staff Account**: admin@university.edu / admin123
- **Student Account**: student@university.edu / student123

**Note**: For production use, change these default passwords immediately!

## Troubleshooting

1. **Database Connection Error**: 
   - Ensure MySQL is running on localhost:3306
   - Check the password in `config/database.js`
   - Verify the database `student_registration` exists

2. **Port Already in Use**:
   - Change the PORT in `server.js` if 3000 is already in use

3. **Module Not Found**:
   - Run `npm install` to install all dependencies

## License

ISC
