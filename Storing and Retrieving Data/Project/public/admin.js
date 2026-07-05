let allStudents = [];
let allTeachers = [];
let allCourses = [];
let allGrades = [];
let allTeachersList = [];
let currentEditStudentId = null;
let currentEditTeacherId = null;
let currentEditCourseId = null;

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch('/api/current-user');
        if (!response.ok) {
            console.error('Auth check failed:', response.status);
            window.location.href = '/index.html';
            return;
        }
        const data = await response.json();
        console.log('Current user:', data.user);
        if (data.user.user_type !== 'admin') {
            console.error('User is not admin:', data.user.user_type);
            window.location.href = '/index.html';
            return;
        }
        document.getElementById('userName').textContent = `${data.user.first_name} ${data.user.last_name}`;
        await loadTeachersList(); // Load teachers for course assignment dropdowns
        await loadStudents();
        await loadTeachers();
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = '/index.html';
    }
}

// Tab switching
async function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');

    // Reload data when switching tabs
    if (tabName === 'students') {
        loadStudents();
    } else if (tabName === 'teachers') {
        loadTeachers();
    } else if (tabName === 'courses') {
        await loadTeachersList(); // Refresh teacher dropdown when switching to courses tab
        loadCourses();
    } else if (tabName === 'grades') {
        loadGrades();
    }
}

// Logout
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/index.html';
}

// ==================== STUDENT FUNCTIONS ====================

async function loadStudents() {
    try {
        console.log('Loading students...');
        const response = await fetch('/api/admin/students');

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
            }
            console.error('Error loading students:', errorData);
            showMessage('studentsMessage', errorData.error || `Error: ${response.status}`, 'error');

            const tbody = document.querySelector('#studentsTable tbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" style="color: red;">Error: ' + (errorData.error || response.status) + '</td></tr>';
            }
            return;
        }

        allStudents = await response.json();
        console.log('Students loaded:', allStudents.length);

        const tbody = document.querySelector('#studentsTable tbody');
        if (!tbody) {
            console.error('Students table tbody not found');
            return;
        }

        tbody.innerHTML = '';

        if (!allStudents || allStudents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No students found. Add a new student to get started.</td></tr>';
            return;
        }

        allStudents.forEach(student => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${student.student_id}</td>
                <td>${student.first_name || 'N/A'}</td>
                <td>${student.last_name || 'N/A'}</td>
                <td>${student.address || 'N/A'}</td>
                <td>${student.mobile || 'N/A'}</td>
                <td>${student.email || 'N/A'}</td>
                <td>
                    <button class="btn btn-primary" onclick="editStudent(${student.student_id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteStudent(${student.student_id}, '${(student.first_name || '').replace(/'/g, "\\'")} ${(student.last_name || '').replace(/'/g, "\\'")}')" style="margin-left: 5px;">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading students:', error);
        showMessage('studentsMessage', 'Error loading students: ' + error.message, 'error');
    }
}

function showAddStudentForm() {
    document.getElementById('addStudentForm').style.display = 'block';
    document.getElementById('newStudentForm').reset();
}

function hideAddStudentForm() {
    document.getElementById('addStudentForm').style.display = 'none';
}

document.getElementById('newStudentForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    const studentData = {
        first_name: document.getElementById('newStudentFirstName').value,
        last_name: document.getElementById('newStudentLastName').value,
        address: document.getElementById('newStudentAddress').value,
        mobile: document.getElementById('newStudentMobile').value,
        email: document.getElementById('newStudentEmail').value,
        password: document.getElementById('newStudentPassword').value
    };

    try {
        const response = await fetch('/api/admin/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(studentData)
        });

        const data = await response.json();
        if (response.ok) {
            showMessage('studentsMessage', 'Student added successfully', 'success');
            hideAddStudentForm();
            loadStudents();
        } else {
            showMessage('studentsMessage', data.error || 'Failed to add student', 'error');
        }
    } catch (error) {
        showMessage('studentsMessage', 'Error adding student', 'error');
    }
});

async function editStudent(studentId) {
    try {
        const response = await fetch(`/api/admin/students/${studentId}`);
        if (!response.ok) {
            showMessage('studentsMessage', 'Error loading student data', 'error');
            return;
        }

        const student = await response.json();
        currentEditStudentId = studentId;

        // Populate modal form
        document.getElementById('editStudentFirstName').value = student.first_name || '';
        document.getElementById('editStudentLastName').value = student.last_name || '';
        document.getElementById('editStudentAddress').value = student.address || '';
        document.getElementById('editStudentMobile').value = student.mobile || '';
        document.getElementById('editStudentEmail').value = student.email || '';

        // Show modal
        document.getElementById('editStudentModal').style.display = 'block';
    } catch (error) {
        showMessage('studentsMessage', 'Error loading student data', 'error');
    }
}

function closeStudentModal() {
    document.getElementById('editStudentModal').style.display = 'none';
    currentEditStudentId = null;
}

document.getElementById('editStudentForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    if (!currentEditStudentId) return;

    const updated = {
        first_name: document.getElementById('editStudentFirstName').value,
        last_name: document.getElementById('editStudentLastName').value,
        address: document.getElementById('editStudentAddress').value,
        mobile: document.getElementById('editStudentMobile').value,
        email: document.getElementById('editStudentEmail').value
    };

    try {
        const response = await fetch(`/api/admin/students/${currentEditStudentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });

        const data = await response.json();
        if (response.ok) {
            showMessage('studentsMessage', 'Student updated successfully', 'success');
            closeStudentModal();
            loadStudents();
        } else {
            showMessage('studentsMessage', data.error || 'Update failed', 'error');
        }
    } catch (error) {
        showMessage('studentsMessage', 'Error updating student', 'error');
    }
});

// Delete student function
async function deleteStudent(studentId, studentName) {
    if (!confirm(`Are you sure you want to delete student "${studentName}"?\n\nThis will also delete all their enrollments and grades. This action cannot be undone.`)) {
        return;
    }

    try {
        console.log('Deleting student:', studentId);
        const response = await fetch(`/api/admin/students/${studentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        let data;
        try {
            data = await response.json();
        } catch (e) {
            data = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        if (response.ok) {
            showMessage('studentsMessage', 'Student deleted successfully', 'success');
            loadStudents();
        } else {
            console.error('Delete student error:', data);
            showMessage('studentsMessage', data.error || `Delete failed (${response.status})`, 'error');
        }
    } catch (error) {
        console.error('Delete student exception:', error);
        showMessage('studentsMessage', 'Error deleting student: ' + error.message, 'error');
    }
}

// ==================== TEACHER FUNCTIONS ====================

async function loadTeachers() {
    try {
        console.log('Loading teachers...');
        const response = await fetch('/api/admin/teachers');

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
            }
            console.error('Error loading teachers:', errorData);
            showMessage('teachersMessage', errorData.error || `Error: ${response.status}`, 'error');

            const tbody = document.querySelector('#teachersTable tbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" style="color: red;">Error: ' + (errorData.error || response.status) + '</td></tr>';
            }
            return;
        }

        allTeachers = await response.json();
        console.log('Teachers loaded:', allTeachers.length);

        const tbody = document.querySelector('#teachersTable tbody');
        if (!tbody) {
            console.error('Teachers table tbody not found');
            return;
        }

        tbody.innerHTML = '';

        if (!allTeachers || allTeachers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No teachers found. Add a new teacher to get started.</td></tr>';
            return;
        }

        allTeachers.forEach(teacher => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${teacher.staff_id}</td>
                <td>${teacher.first_name || 'N/A'}</td>
                <td>${teacher.last_name || 'N/A'}</td>
                <td>${teacher.office || 'N/A'}</td>
                <td>${teacher.email || 'N/A'}</td>
                <td>
                    <button class="btn btn-primary" onclick="editTeacher(${teacher.staff_id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteTeacher(${teacher.staff_id}, '${(teacher.first_name || '').replace(/'/g, "\\'")} ${(teacher.last_name || '').replace(/'/g, "\\'")}')" style="margin-left: 5px;">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading teachers:', error);
        showMessage('teachersMessage', 'Error loading teachers: ' + error.message, 'error');
    }
}

function showAddTeacherForm() {
    document.getElementById('addTeacherForm').style.display = 'block';
    document.getElementById('newTeacherForm').reset();
}

function hideAddTeacherForm() {
    document.getElementById('addTeacherForm').style.display = 'none';
}

document.getElementById('newTeacherForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    const teacherData = {
        first_name: document.getElementById('newTeacherFirstName').value,
        last_name: document.getElementById('newTeacherLastName').value,
        office: document.getElementById('newTeacherOffice').value,
        email: document.getElementById('newTeacherEmail').value,
        password: document.getElementById('newTeacherPassword').value
    };

    try {
        const response = await fetch('/api/admin/teachers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teacherData)
        });

        const data = await response.json();
        if (response.ok) {
            showMessage('teachersMessage', 'Teacher added successfully', 'success');
            hideAddTeacherForm();
            await loadTeachers();
            await loadTeachersList(); // Refresh teacher dropdowns in course forms
        } else {
            showMessage('teachersMessage', data.error || 'Failed to add teacher', 'error');
        }
    } catch (error) {
        showMessage('teachersMessage', 'Error adding teacher', 'error');
    }
});

async function editTeacher(teacherId) {
    try {
        const response = await fetch(`/api/admin/teachers/${teacherId}`);
        if (!response.ok) {
            showMessage('teachersMessage', 'Error loading teacher data', 'error');
            return;
        }

        const teacher = await response.json();
        currentEditTeacherId = teacherId;

        // Populate modal form
        document.getElementById('editTeacherFirstName').value = teacher.first_name || '';
        document.getElementById('editTeacherLastName').value = teacher.last_name || '';
        document.getElementById('editTeacherOffice').value = teacher.office || '';
        document.getElementById('editTeacherEmail').value = teacher.email || '';

        // Show modal
        document.getElementById('editTeacherModal').style.display = 'block';
    } catch (error) {
        showMessage('teachersMessage', 'Error loading teacher data', 'error');
    }
}

function closeTeacherModal() {
    document.getElementById('editTeacherModal').style.display = 'none';
    currentEditTeacherId = null;
}

// Delete teacher function
async function deleteTeacher(teacherId, teacherName) {
    if (!confirm(`Are you sure you want to delete teacher "${teacherName}"?\n\nAll courses assigned to this teacher will be unassigned. This action cannot be undone.`)) {
        return;
    }

    try {
        console.log('Deleting teacher:', teacherId);
        const response = await fetch(`/api/admin/teachers/${teacherId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        let data;
        try {
            data = await response.json();
        } catch (e) {
            data = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        if (response.ok) {
            showMessage('teachersMessage', 'Teacher deleted successfully. Courses have been unassigned.', 'success');
            await loadTeachersList(); // Refresh teacher list for course dropdowns
            loadTeachers();
        } else {
            console.error('Delete teacher error:', data);
            showMessage('teachersMessage', data.error || `Delete failed (${response.status})`, 'error');
        }
    } catch (error) {
        console.error('Delete teacher exception:', error);
        showMessage('teachersMessage', 'Error deleting teacher: ' + error.message, 'error');
    }
}

document.getElementById('editTeacherForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    if (!currentEditTeacherId) return;

    const updated = {
        first_name: document.getElementById('editTeacherFirstName').value,
        last_name: document.getElementById('editTeacherLastName').value,
        office: document.getElementById('editTeacherOffice').value,
        email: document.getElementById('editTeacherEmail').value
    };

    try {
        const response = await fetch(`/api/admin/teachers/${currentEditTeacherId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });

        const data = await response.json();
        if (response.ok) {
            showMessage('teachersMessage', 'Teacher updated successfully', 'success');
            closeTeacherModal();
            loadTeachers();
        } else {
            showMessage('teachersMessage', data.error || 'Update failed', 'error');
        }
    } catch (error) {
        showMessage('teachersMessage', 'Error updating teacher', 'error');
    }
});

// ==================== UTILITY FUNCTIONS ====================

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `message ${type}`;
        element.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();

    // Set up event listeners for time field updates
    // For new course form
    const newDayCheckboxes = document.querySelectorAll('.day-checkbox');
    const newStartTime = document.getElementById('newCourseStartTime');
    const newEndTime = document.getElementById('newCourseEndTime');

    [...newDayCheckboxes, newStartTime, newEndTime].forEach(element => {
        if (element) {
            element.addEventListener('change', function() {
                document.getElementById('newCourseTime').value = formatTimeString();
            });
        }
    });

    // For edit course form
    const editDayCheckboxes = document.querySelectorAll('.edit-day-checkbox');
    const editStartTime = document.getElementById('editCourseStartTime');
    const editEndTime = document.getElementById('editCourseEndTime');

    [...editDayCheckboxes, editStartTime, editEndTime].forEach(element => {
        if (element) {
            element.addEventListener('change', function() {
                document.getElementById('editCourseTime').value = formatEditTimeString();
            });
        }
    });
});

// ==================== COURSE FUNCTIONS ====================

async function loadTeachersList() {
    try {
        const response = await fetch('/api/admin/teachers');
        if (response.ok) {
            allTeachersList = await response.json();

            // Populate teacher dropdowns
            const newSelect = document.getElementById('newCourseTeacherId');
            const editSelect = document.getElementById('editCourseTeacherId');

            if (newSelect) {
                newSelect.innerHTML = '<option value="">Unassigned</option>';
                allTeachersList.forEach(teacher => {
                    const option = document.createElement('option');
                    option.value = teacher.staff_id;
                    option.textContent = `${teacher.first_name} ${teacher.last_name}`;
                    newSelect.appendChild(option);
                });
            }

            if (editSelect) {
                editSelect.innerHTML = '<option value="">Unassigned</option>';
                allTeachersList.forEach(teacher => {
                    const option = document.createElement('option');
                    option.value = teacher.staff_id;
                    option.textContent = `${teacher.first_name} ${teacher.last_name}`;
                    editSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading teachers list:', error);
    }
}

async function loadCourses() {
    try {
        console.log('Loading courses...');
        const response = await fetch('/api/admin/courses');

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
            }
            console.error('Error loading courses:', errorData);
            showMessage('coursesMessage', errorData.error || `Error: ${response.status}`, 'error');
            return;
        }

        allCourses = await response.json();
        console.log('Courses loaded:', allCourses.length);

        const tbody = document.querySelector('#coursesTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!allCourses || allCourses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No courses found. Add a new course to get started.</td></tr>';
            return;
        }

        allCourses.forEach(course => {
            const row = document.createElement('tr');
            const teacherName = course.staff_first_name && course.staff_last_name ?
                `${course.staff_first_name} ${course.staff_last_name}` :
                'Unassigned';
            const courseName = (course.course_name || '').replace(/'/g, "\\'");
            row.innerHTML = `
                <td>${course.course_id}</td>
                <td>${course.course_name || 'N/A'}</td>
                <td>${teacherName}</td>
                <td>${course.location || 'N/A'}</td>
                <td>${course.time || 'N/A'}</td>
                <td>
                    <button class="btn btn-primary" onclick="editCourse(${course.course_id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteCourse(${course.course_id}, '${courseName}')" style="margin-left: 5px;">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading courses:', error);
        showMessage('coursesMessage', 'Error loading courses: ' + error.message, 'error');
    }
}

async function showAddCourseForm() {
    // Refresh teacher list before showing form to ensure new teachers are available
    await loadTeachersList();
    document.getElementById('addCourseForm').style.display = 'block';
    document.getElementById('newCourseForm').reset();
    // Reset day checkboxes and time fields
    document.querySelectorAll('.day-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('newCourseStartTime').value = '';
    document.getElementById('newCourseEndTime').value = '';
}

// Function to format time string from selections
function formatTimeString() {
    const selectedDays = Array.from(document.querySelectorAll('.day-checkbox:checked')).map(cb => cb.value);
    const startTime = document.getElementById('newCourseStartTime').value;
    const endTime = document.getElementById('newCourseEndTime').value;

    if (selectedDays.length === 0 || !startTime || !endTime) {
        return '';
    }

    // Use 24-hour format directly (HH:MM)
    const formatTime = (timeStr) => {
        if (!timeStr) return '';
        // timeStr is already in HH:MM format from time input
        return timeStr;
    };

    const daysStr = selectedDays.join('/');
    const startFormatted = formatTime(startTime);
    const endFormatted = formatTime(endTime);

    return `${daysStr} ${startFormatted}-${endFormatted}`;
}

// Function to format time string for edit form
function formatEditTimeString() {
    const selectedDays = Array.from(document.querySelectorAll('.edit-day-checkbox:checked')).map(cb => cb.value);
    const startTime = document.getElementById('editCourseStartTime').value;
    const endTime = document.getElementById('editCourseEndTime').value;

    if (selectedDays.length === 0 || !startTime || !endTime) {
        return '';
    }

    // Use 24-hour format directly (HH:MM)
    const formatTime = (timeStr) => {
        if (!timeStr) return '';
        // timeStr is already in HH:MM format from time input
        return timeStr;
    };

    const daysStr = selectedDays.join('/');
    const startFormatted = formatTime(startTime);
    const endFormatted = formatTime(endTime);

    return `${daysStr} ${startFormatted}-${endFormatted}`;
}

// Function to parse time string and populate form
function parseTimeString(timeStr, isEdit = false) {
    if (!timeStr) return;

    // Parse format like "Mon/Wed 10:00AM-11:30AM" or "Mon/Wed 10:00-11:30" or "Mon/Wed 14:00-15:30"
    const parts = timeStr.match(/([A-Za-z\/]+)\s+(\d{1,2}):(\d{2})([AP]M)?-(\d{1,2}):(\d{2})([AP]M)?/);
    if (!parts) return;

    const days = parts[1].split('/');
    const startHour = parseInt(parts[2]);
    const startMin = parts[3];
    const startAMPM = parts[4];
    const endHour = parseInt(parts[5]);
    const endMin = parts[6];
    const endAMPM = parts[7];

    // Convert to 24-hour format
    const convertTo24Hour = (hour, ampm) => {
        // If AM/PM is specified, convert from 12-hour to 24-hour
        if (ampm) {
            let h24 = hour;
            if (ampm === 'PM' && hour !== 12) h24 = hour + 12;
            if (ampm === 'AM' && hour === 12) h24 = 0;
            return h24.toString().padStart(2, '0');
        }
        // If no AM/PM, assume it's already in 24-hour format
        return hour.toString().padStart(2, '0');
    };

    const startHour24 = convertTo24Hour(startHour, startAMPM);
    const endHour24 = convertTo24Hour(endHour, endAMPM);

    const startTime = `${startHour24}:${startMin}`;
    const endTime = `${endHour24}:${endMin}`;

    // Set checkboxes
    const prefix = isEdit ? '.edit-day-checkbox' : '.day-checkbox';
    document.querySelectorAll(prefix).forEach(cb => {
        cb.checked = days.includes(cb.value);
    });

    // Set time fields
    if (isEdit) {
        document.getElementById('editCourseStartTime').value = startTime;
        document.getElementById('editCourseEndTime').value = endTime;
    } else {
        document.getElementById('newCourseStartTime').value = startTime;
        document.getElementById('newCourseEndTime').value = endTime;
    }
}

function hideAddCourseForm() {
    document.getElementById('addCourseForm').style.display = 'none';
}

document.getElementById('newCourseForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    const timeString = formatTimeString();
    if (!timeString) {
        showMessage('coursesMessage', 'Please select at least one day and set start/end times', 'error');
        return;
    }

    const courseData = {
        course_name: document.getElementById('newCourseName').value,
        staff_id: document.getElementById('newCourseTeacherId').value || null,
        location: document.getElementById('newCourseLocation').value,
        time: timeString
    };

    try {
        const response = await fetch('/api/admin/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(courseData)
        });

        const data = await response.json();
        if (response.ok) {
            showMessage('coursesMessage', 'Course added successfully', 'success');
            hideAddCourseForm();
            loadCourses();
        } else {
            showMessage('coursesMessage', data.error || 'Failed to add course', 'error');
        }
    } catch (error) {
        showMessage('coursesMessage', 'Error adding course', 'error');
    }
});

async function editCourse(courseId) {
    try {
        // Refresh teacher list before showing edit form to ensure new teachers are available
        await loadTeachersList();

        const course = allCourses.find(c => c.course_id === courseId);
        if (!course) {
            showMessage('coursesMessage', 'Course not found', 'error');
            return;
        }

        currentEditCourseId = courseId;

        // Populate modal form
        document.getElementById('editCourseName').value = course.course_name || '';
        document.getElementById('editCourseTeacherId').value = course.staff_id || '';
        document.getElementById('editCourseLocation').value = course.location || '';

        // Parse and populate time fields
        if (course.time) {
            parseTimeString(course.time, true);
            document.getElementById('editCourseTime').value = course.time;
        } else {
            // Reset if no time
            document.querySelectorAll('.edit-day-checkbox').forEach(cb => cb.checked = false);
            document.getElementById('editCourseStartTime').value = '';
            document.getElementById('editCourseEndTime').value = '';
            document.getElementById('editCourseTime').value = '';
        }

        // Show modal
        document.getElementById('editCourseModal').style.display = 'block';
    } catch (error) {
        showMessage('coursesMessage', 'Error loading course data', 'error');
    }
}

function closeCourseModal() {
    document.getElementById('editCourseModal').style.display = 'none';
    currentEditCourseId = null;
}

// Delete course function
async function deleteCourse(courseId, courseName) {
    if (!confirm(`Are you sure you want to delete course "${courseName}"?\n\nThis will also delete all enrollments and grades for this course. This action cannot be undone.`)) {
        return;
    }

    try {
        console.log('Deleting course:', courseId);
        const response = await fetch(`/api/admin/courses/${courseId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        let data;
        try {
            data = await response.json();
        } catch (e) {
            data = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        if (response.ok) {
            showMessage('coursesMessage', 'Course deleted successfully. All enrollments and grades have been removed.', 'success');
            loadCourses();
        } else {
            console.error('Delete course error:', data);
            showMessage('coursesMessage', data.error || `Delete failed (${response.status})`, 'error');
        }
    } catch (error) {
        console.error('Delete course exception:', error);
        showMessage('coursesMessage', 'Error deleting course: ' + error.message, 'error');
    }
}

document.getElementById('editCourseForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    if (!currentEditCourseId) return;

    const timeString = formatEditTimeString();
    if (!timeString) {
        showMessage('coursesMessage', 'Please select at least one day and set start/end times', 'error');
        return;
    }

    const updated = {
        course_name: document.getElementById('editCourseName').value,
        staff_id: document.getElementById('editCourseTeacherId').value || null,
        location: document.getElementById('editCourseLocation').value,
        time: timeString
    };

    try {
        const response = await fetch(`/api/admin/courses/${currentEditCourseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });

        const data = await response.json();
        if (response.ok) {
            showMessage('coursesMessage', 'Course updated successfully', 'success');
            closeCourseModal();
            loadCourses();
        } else {
            showMessage('coursesMessage', data.error || 'Update failed', 'error');
        }
    } catch (error) {
        showMessage('coursesMessage', 'Error updating course', 'error');
    }
});

// ==================== GRADE FUNCTIONS ====================

async function loadGrades() {
    try {
        console.log('Loading grades...');
        const response = await fetch('/api/admin/grades');

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
            }
            console.error('Error loading grades:', errorData);
            showMessage('gradesMessage', errorData.error || `Error: ${response.status}`, 'error');
            return;
        }

        allGrades = await response.json();
        console.log('Grades loaded:', allGrades.length);

        const tbody = document.querySelector('#gradesTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!allGrades || allGrades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No grades found.</td></tr>';
            return;
        }

        allGrades.forEach(grade => {
            const row = document.createElement('tr');
            const studentName = `${grade.student_first_name} ${grade.student_last_name}`.replace(/'/g, "\\'");
            const courseName = (grade.course_name || '').replace(/'/g, "\\'");
            const currentGrade = (grade.grade || '').replace(/'/g, "\\'");
            row.innerHTML = `
                <td>${grade.student_first_name} ${grade.student_last_name}</td>
                <td>${grade.course_name}</td>
                <td>${grade.grade || 'No grade'}</td>
                <td>
                    <button class="btn btn-primary" onclick="editGrade(${grade.student_id}, ${grade.course_id}, '${studentName}', '${courseName}', '${currentGrade}')">Edit</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading grades:', error);
        showMessage('gradesMessage', 'Error loading grades: ' + error.message, 'error');
    }
}

function editGrade(studentId, courseId, studentName, courseName, currentGrade) {
    document.getElementById('modalStudentId').value = studentId;
    document.getElementById('modalCourseId').value = courseId;
    document.getElementById('modalStudentName').value = studentName;
    document.getElementById('modalCourseName').value = courseName;
    document.getElementById('modalGradeInput').value = currentGrade;
    document.getElementById('modalGradePreview').value = currentGrade || '';
    document.getElementById('gradeEditModal').style.display = 'block';
}

function closeGradeModal() {
    document.getElementById('gradeEditModal').style.display = 'none';
    document.getElementById('modalGradeInput').value = '';
    document.getElementById('modalGradePreview').value = '';
}

function updateGradePreview() {
    const input = document.getElementById('modalGradeInput').value.trim();
    const preview = document.getElementById('modalGradePreview');

    if (!input) {
        preview.value = '';
        return;
    }

    const num = parseFloat(input);
    if (!isNaN(num)) {
        // Convert numeric score to letter grade
        let letterGrade = '';
        if (num >= 95) letterGrade = 'A+';
        else if (num >= 90) letterGrade = 'A';
        else if (num >= 85) letterGrade = 'A-';
        else if (num >= 80) letterGrade = 'B+';
        else if (num >= 75) letterGrade = 'B';
        else if (num >= 70) letterGrade = 'B-';
        else if (num >= 65) letterGrade = 'C+';
        else if (num >= 60) letterGrade = 'C';
        else if (num >= 55) letterGrade = 'C-';
        else if (num >= 50) letterGrade = 'D';
        else letterGrade = 'F';

        preview.value = `${num} → ${letterGrade}`;
    } else {
        preview.value = input; // Assume it's already a letter grade
    }
}

function clearGrade() {
    if (confirm('Are you sure you want to clear this grade?')) {
        const studentId = document.getElementById('modalStudentId').value;
        const courseId = document.getElementById('modalCourseId').value;
        saveGrade(studentId, courseId, '');
    }
}

async function saveGrade(studentId, courseId, grade) {
    try {
        const response = await fetch('/api/admin/grades', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentId, course_id: courseId, grade: grade })
        });

        const data = await response.json();
        if (response.ok) {
            if (data.letterGrade) {
                showMessage('gradesMessage', `Grade updated: ${grade} → ${data.letterGrade}`, 'success');
            } else {
                showMessage('gradesMessage', 'Grade cleared successfully', 'success');
            }
            closeGradeModal();
            loadGrades();
        } else {
            showMessage('gradesMessage', data.error || 'Update failed', 'error');
        }
    } catch (error) {
        showMessage('gradesMessage', 'Network error', 'error');
    }
}

// Set up grade edit form
document.addEventListener('DOMContentLoaded', function() {
    const gradeInput = document.getElementById('modalGradeInput');
    if (gradeInput) {
        gradeInput.addEventListener('input', updateGradePreview);
    }

    const gradeForm = document.getElementById('gradeEditForm');
    if (gradeForm) {
        gradeForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const studentId = document.getElementById('modalStudentId').value;
            const courseId = document.getElementById('modalCourseId').value;
            const grade = document.getElementById('modalGradeInput').value.trim();

            if (grade) {
                saveGrade(studentId, courseId, grade);
            }
        });
    }
});

// Close modals when clicking outside
window.onclick = function(event) {
    const studentModal = document.getElementById('editStudentModal');
    const teacherModal = document.getElementById('editTeacherModal');
    const courseModal = document.getElementById('editCourseModal');
    const gradeModal = document.getElementById('gradeEditModal');

    if (event.target === studentModal) {
        closeStudentModal();
    }
    if (event.target === teacherModal) {
        closeTeacherModal();
    }
    if (event.target === courseModal) {
        closeCourseModal();
    }
    if (event.target === gradeModal) {
        closeGradeModal();
    }
}