let allCourses = [];

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch('/api/current-user');
        if (!response.ok) {
            window.location.href = '/index.html';
            return;
        }
        const data = await response.json();
        if (data.user.user_type !== 'teacher') {
            window.location.href = '/index.html';
            return;
        }
        document.getElementById('userName').textContent = `${data.user.first_name} ${data.user.last_name}`;
        loadCourses();
        loadTimetable();
        loadGrades();
    } catch (error) {
        window.location.href = '/index.html';
    }
}

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');

    // Reload timetable when switching to timetable tab
    if (tabName === 'timetable') {
        loadTimetable();
    }
}

// Logout
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/index.html';
}

// Courses functions
async function loadCourses() {
    try {
        const response = await fetch('/api/staff/courses');
        allCourses = await response.json();

        const tbody = document.querySelector('#coursesTable tbody');
        tbody.innerHTML = '';

        if (allCourses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No courses assigned to you.</td></tr>';
            return;
        }

        allCourses.forEach(course => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${course.course_id}</td>
                <td>${course.course_name}</td>
                <td>${course.location || 'N/A'}</td>
                <td>${course.time || 'N/A'}</td>
                <td>
                    <button class="btn btn-primary" onclick="editCourse(${course.course_id})">Edit</button>
                    <button class="btn btn-success" onclick="viewCourseStudents(${course.course_id}, '${course.course_name.replace(/'/g, "\\'")}')">View Students</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        showMessage('coursesMessage', 'Error loading courses', 'error');
    }
}

async function editCourse(courseId) {
    try {
        const course = allCourses.find(c => c.course_id === courseId);
        if (!course) return;

        const courseName = prompt('Enter new course name:', course.course_name);
        if (!courseName) return;

        const location = prompt('Enter new location:', course.location || '');
        const time = prompt('Enter new time (e.g., Mon/Wed 10:00-11:30):', course.time || '');

        const updated = {
            course_name: courseName,
            staff_id: course.staff_id,
            location: location,
            time: time
        };

        const response = await fetch(`/api/staff/courses/${courseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });

        const data = await response.json();
        if (response.ok) {
            showMessage('coursesMessage', 'Course updated successfully', 'success');
            loadCourses();
        } else {
            showMessage('coursesMessage', data.error || 'Update failed', 'error');
        }
    } catch (error) {
        showMessage('coursesMessage', 'Error editing course', 'error');
    }
}

// Students functions
async function viewCourseStudents(courseId, courseName) {
    try {
        const response = await fetch(`/api/staff/courses/${courseId}/enrollments`);
        const enrollments = await response.json();

        const container = document.getElementById('studentsContainer');
        container.innerHTML = `<h3>${courseName}</h3>`;

        if (enrollments.length === 0) {
            container.innerHTML += '<p style="color: #999; font-style: italic;">No students enrolled in this course yet.</p>';
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Email</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        enrollments.forEach(enrollment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${enrollment.student_id}</td>
                <td>${enrollment.first_name} ${enrollment.last_name}</td>
                <td>${enrollment.email}</td>
            `;
            tbody.appendChild(row);
        });

        container.appendChild(table);

        // Switch to students tab
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('studentsTab').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');

    } catch (error) {
        showMessage('studentsMessage', 'Error loading students', 'error');
    }
}

// Timetable functions
function parseCourseTime(timeString) {
    if (!timeString) return null;

    const dayMap = {
        'Mon': 0,
        'Tue': 1,
        'Wed': 2,
        'Thu': 3,
        'Fri': 4,
        'Sat': 5,
        'Sun': 6
    };

    const parts = timeString.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const daysPart = parts[0];
    const timePart = parts.slice(1).join(' ');

    const days = daysPart.split('/').map(d => dayMap[d.trim()]).filter(d => d !== undefined);

    const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) return null;

    const startHour = parseInt(timeMatch[1]);
    const startMin = parseInt(timeMatch[2]);
    const endHour = parseInt(timeMatch[3]);
    const endMin = parseInt(timeMatch[4]);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    return { days, startTime, endTime, startHour, startMin, endHour, endMin };
}

function formatTime(hour, min) {
    const h = hour % 12 || 12;
    const m = min.toString().padStart(2, '0');
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h}:${m} ${ampm}`;
}

function getTimeSlotIndex(startTime) {
    const startHour = 8;
    const startMinutes = startHour * 60;
    const slotIndex = Math.floor((startTime - startMinutes) / 30);
    return Math.max(0, slotIndex);
}

function getTimeSlotHeight(startTime, endTime) {
    const slots = Math.ceil((endTime - startTime) / 30);
    return Math.max(1, slots);
}

async function loadTimetable() {
    try {
        const response = await fetch('/api/staff/courses');
        const courses = await response.json();

        const timetableGrid = document.getElementById('timetableGrid');
        timetableGrid.innerHTML = '';

        if (courses.length === 0) {
            timetableGrid.innerHTML = '<div class="timetable-empty" style="grid-column: 1 / -1; padding: 40px;">No courses assigned to you.</div>';
            return;
        }

        // Create header row
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        timetableGrid.appendChild(createTimetableHeader('Time'));
        days.forEach(day => {
            timetableGrid.appendChild(createTimetableHeader(day));
        });

        // Create time slots (8:00 AM to 6:00 PM, 30-minute intervals)
        const timeSlots = [];
        for (let hour = 8; hour < 18; hour++) {
            for (let min = 0; min < 60; min += 30) {
                const timeStr = formatTime(hour, min);
                timeSlots.push({ hour, min, timeStr, minutes: hour * 60 + min });
            }
        }

        // Create cells for each time slot
        timeSlots.forEach((slot, slotIndex) => {
            timetableGrid.appendChild(createTimeSlotCell(slot.timeStr));

            for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
                const cell = document.createElement('div');
                cell.className = 'timetable-cell';
                cell.dataset.day = dayIndex;
                cell.dataset.time = slot.minutes;
                timetableGrid.appendChild(cell);
            }
        });

        // Place courses in the timetable
        courses.forEach(course => {
            if (!course.time) return;

            const timeInfo = parseCourseTime(course.time);
            if (!timeInfo) return;

            timeInfo.days.forEach(dayIndex => {
                if (dayIndex >= 5) return;

                const startSlotIndex = getTimeSlotIndex(timeInfo.startTime);
                const height = getTimeSlotHeight(timeInfo.startTime, timeInfo.endTime);

                const cells = Array.from(timetableGrid.querySelectorAll(`.timetable-cell[data-day="${dayIndex}"]`));
                if (cells[startSlotIndex]) {
                    const courseElement = document.createElement('div');
                    courseElement.className = 'timetable-course';
                    courseElement.innerHTML = `
                        <div class="timetable-course-name">${course.course_name}</div>
                        <div class="timetable-course-time">${formatTime(timeInfo.startHour, timeInfo.startMin)} - ${formatTime(timeInfo.endHour, timeInfo.endMin)}</div>
                        <div class="timetable-course-location">${course.location || ''}</div>
                    `;

                    courseElement.style.position = 'absolute';
                    courseElement.style.top = '2px';
                    courseElement.style.left = '2px';
                    courseElement.style.right = '2px';
                    courseElement.style.height = `${height * 60 - 4}px`;
                    courseElement.style.zIndex = '10';

                    for (let i = 0; i < height && cells[startSlotIndex + i]; i++) {
                        cells[startSlotIndex + i].style.position = 'relative';
                    }

                    cells[startSlotIndex].appendChild(courseElement);
                }
            });
        });

    } catch (error) {
        console.error('Error loading timetable:', error);
        showMessage('timetableMessage', 'Error loading timetable', 'error');
    }
}

function createTimetableHeader(text) {
    const header = document.createElement('div');
    header.className = 'timetable-header';
    header.textContent = text;
    return header;
}

function createTimeSlotCell(timeStr) {
    const cell = document.createElement('div');
    cell.className = 'timetable-time-slot';
    cell.textContent = timeStr;
    return cell;
}

// Grades functions
async function loadGrades() {
    try {
        const response = await fetch('/api/staff/grades');
        const grades = await response.json();

        const tbody = document.querySelector('#gradesTable tbody');
        tbody.innerHTML = '';

        if (grades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No enrollments found in your courses.</td></tr>';
            return;
        }

        grades.forEach(grade => {
            const row = document.createElement('tr');
            const gradeDisplay = grade.grade || 'N/A';
            const gradeClass = grade.grade ? '' : 'style="color: #999; font-style: italic;"';
            row.innerHTML = `
                <td>${grade.student_first_name} ${grade.student_last_name}</td>
                <td>${grade.course_name}</td>
                <td ${gradeClass}>${gradeDisplay}</td>
                <td>
                    <button class="btn btn-primary" onclick="editGrade(${grade.student_id}, ${grade.course_id}, '${grade.grade || ''}', '${grade.student_first_name} ${grade.student_last_name}', '${grade.course_name}')">${grade.grade ? 'Edit' : 'Add Grade'}</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        showMessage('gradesMessage', 'Error loading grades', 'error');
    }
}

// Helper function to convert numeric score to letter grade (client-side preview)
function previewGradeConversion(score) {
    const numScore = parseFloat(score);
    if (isNaN(numScore)) {
        return score || 'N/A';
    }

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
    return 'F';
}

function editGrade(studentId, courseId, currentGrade, studentName, courseName) {
    document.getElementById('modalStudentId').value = studentId;
    document.getElementById('modalCourseId').value = courseId;
    document.getElementById('modalStudentName').value = studentName;
    document.getElementById('modalCourseName').value = courseName;
    document.getElementById('modalGradeInput').value = currentGrade || '';
    updateGradePreview();
    document.getElementById('gradeEditModal').style.display = 'block';
}

function closeGradeModal() {
    document.getElementById('gradeEditModal').style.display = 'none';
    document.getElementById('gradeEditForm').reset();
}

function updateGradePreview() {
    const input = document.getElementById('modalGradeInput').value.trim();
    const preview = document.getElementById('modalGradePreview');

    if (!input) {
        preview.value = 'N/A';
        return;
    }

    const numScore = parseFloat(input);
    if (!isNaN(numScore)) {
        const letterGrade = previewGradeConversion(input);
        preview.value = `${input} → ${letterGrade}`;
    } else {
        preview.value = input;
    }
}

function clearGrade() {
    if (confirm('Are you sure you want to clear this grade?')) {
        const studentId = document.getElementById('modalStudentId').value;
        const courseId = document.getElementById('modalCourseId').value;
        saveGrade(studentId, courseId, null);
    }
}

async function saveGrade(studentId, courseId, grade) {
    try {
        const response = await fetch('/api/staff/grades', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: parseInt(studentId),
                course_id: parseInt(courseId),
                grade: grade
            })
        });

        const data = await response.json();
        if (response.ok) {
            if (grade !== null) {
                const inputNum = parseFloat(grade);
                if (!isNaN(inputNum) && data.letterGrade) {
                    showMessage('gradesMessage', `Grade updated: ${inputNum} → ${data.letterGrade}`, 'success');
                } else {
                    showMessage('gradesMessage', 'Grade updated successfully', 'success');
                }
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

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `message ${type}`;
    setTimeout(() => {
        element.className = 'message';
    }, 5000);
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

    const modal = document.getElementById('gradeEditModal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeGradeModal();
            }
        });
    }
});

// Initialize on page load
checkAuth();