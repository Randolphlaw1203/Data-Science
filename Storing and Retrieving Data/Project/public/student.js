// Check authentication
async function checkAuth() {
    try {
        const response = await fetch('/api/current-user');
        if (!response.ok) {
            window.location.href = '/index.html';
            return;
        }
        const data = await response.json();
        document.getElementById('userName').textContent = `${data.user.first_name} ${data.user.last_name}`;
        loadProfile();
        loadCourses();
        loadTimetable();
        loadGrades();
        loadStaff();
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

// Profile functions
async function loadProfile() {
    try {
        const response = await fetch('/api/student/profile');
        const profile = await response.json();
        
        document.getElementById('firstName').value = profile.first_name || '';
        document.getElementById('lastName').value = profile.last_name || '';
        document.getElementById('address').value = profile.address || '';
        document.getElementById('mobile').value = profile.mobile || '';
        document.getElementById('email').value = profile.email || '';
    } catch (error) {
        showMessage('profileMessage', 'Error loading profile', 'error');
    }
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const profile = {
        first_name: document.getElementById('firstName').value,
        last_name: document.getElementById('lastName').value,
        address: document.getElementById('address').value,
        mobile: document.getElementById('mobile').value,
        email: document.getElementById('email').value
    };
    
    try {
        const response = await fetch('/api/student/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        });
        
        const data = await response.json();
        if (response.ok) {
            showMessage('profileMessage', 'Profile updated successfully', 'success');
        } else {
            showMessage('profileMessage', data.error || 'Update failed', 'error');
        }
    } catch (error) {
        showMessage('profileMessage', 'Network error', 'error');
    }
});

// Courses functions
async function loadCourses() {
    try {
        const response = await fetch('/api/student/courses');
        const courses = await response.json();
        
        const coursesList = document.getElementById('coursesList');
        coursesList.innerHTML = '';
        
        if (courses.length === 0) {
            coursesList.innerHTML = '<p>No courses available</p>';
            return;
        }
        
        courses.forEach(course => {
            const card = document.createElement('div');
            card.className = 'course-card';
            card.innerHTML = `
                <h3>${course.course_name}</h3>
                <p><strong>Staff:</strong> ${course.staff_first_name || 'N/A'} ${course.staff_last_name || ''}</p>
                <p><strong>Location:</strong> ${course.location || 'N/A'}</p>
                <p><strong>Time:</strong> ${course.time || 'N/A'}</p>
                ${course.is_enrolled 
                    ? `<button class="btn btn-danger" onclick="unregisterCourse(${course.course_id})">Unregister</button>`
                    : `<button class="btn btn-success" onclick="registerCourse(${course.course_id})">Register</button>`
                }
            `;
            coursesList.appendChild(card);
        });
    } catch (error) {
        showMessage('coursesMessage', 'Error loading courses', 'error');
    }
}

async function registerCourse(courseId) {
    try {
        const response = await fetch(`/api/student/courses/${courseId}/register`, {
            method: 'POST'
        });
        
        const data = await response.json();
        if (response.ok) {
            showMessage('coursesMessage', 'Successfully registered for course', 'success');
            loadCourses();
            loadTimetable();
        } else {
            showMessage('coursesMessage', data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        showMessage('coursesMessage', 'Network error', 'error');
    }
}

async function unregisterCourse(courseId) {
    try {
        const response = await fetch(`/api/student/courses/${courseId}/register`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (response.ok) {
            showMessage('coursesMessage', 'Successfully unregistered from course', 'success');
            loadCourses();
            loadTimetable();
            loadGrades();
        } else {
            showMessage('coursesMessage', data.error || 'Unregistration failed', 'error');
        }
    } catch (error) {
        showMessage('coursesMessage', 'Network error', 'error');
    }
}

// Grades functions
async function loadGrades() {
    try {
        const response = await fetch('/api/student/grades');
        const grades = await response.json();
        
        const tbody = document.querySelector('#gradesTable tbody');
        tbody.innerHTML = '';
        
        if (grades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2">No grades available</td></tr>';
            return;
        }
        
        grades.forEach(grade => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${grade.course_name}</td>
                <td>${grade.grade}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        showMessage('gradesMessage', 'Error loading grades', 'error');
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
    
    // Extract days (e.g., "Mon/Wed" -> [0, 2])
    const days = daysPart.split('/').map(d => dayMap[d.trim()]).filter(d => d !== undefined);
    
    // Extract time range (e.g., "10:00-11:30")
    const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) return null;
    
    const startHour = parseInt(timeMatch[1]);
    const startMin = parseInt(timeMatch[2]);
    const endHour = parseInt(timeMatch[3]);
    const endMin = parseInt(timeMatch[4]);
    
    const startTime = startHour * 60 + startMin; // Convert to minutes
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
    // Convert minutes to slot index (each slot is 30 minutes, starting from 8:00 AM)
    const startHour = 8; // 8:00 AM
    const startMinutes = startHour * 60;
    const slotIndex = Math.floor((startTime - startMinutes) / 30);
    return Math.max(0, slotIndex);
}

function getTimeSlotHeight(startTime, endTime) {
    // Calculate height in 30-minute slots
    const slots = Math.ceil((endTime - startTime) / 30);
    return Math.max(1, slots);
}

async function loadTimetable() {
    try {
        const response = await fetch('/api/student/courses');
        const courses = await response.json();
        
        // Filter only enrolled courses
        const enrolledCourses = courses.filter(course => course.is_enrolled);
        
        const timetableGrid = document.getElementById('timetableGrid');
        timetableGrid.innerHTML = '';
        
        if (enrolledCourses.length === 0) {
            timetableGrid.innerHTML = '<div class="timetable-empty" style="grid-column: 1 / -1; padding: 40px;">No courses enrolled. Register for courses to see your timetable.</div>';
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
            // Time label cell
            timetableGrid.appendChild(createTimeSlotCell(slot.timeStr));
            
            // Day cells
            for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
                const cell = document.createElement('div');
                cell.className = 'timetable-cell';
                cell.dataset.day = dayIndex;
                cell.dataset.time = slot.minutes;
                timetableGrid.appendChild(cell);
            }
        });
        
        // Place courses in the timetable
        enrolledCourses.forEach(course => {
            if (!course.time) return;
            
            const timeInfo = parseCourseTime(course.time);
            if (!timeInfo) return;
            
            timeInfo.days.forEach(dayIndex => {
                if (dayIndex >= 5) return; // Skip weekends for now
                
                const startSlotIndex = getTimeSlotIndex(timeInfo.startTime);
                const height = getTimeSlotHeight(timeInfo.startTime, timeInfo.endTime);
                
                // Find the cell for this day and time
                const cells = Array.from(timetableGrid.querySelectorAll(`.timetable-cell[data-day="${dayIndex}"]`));
                if (cells[startSlotIndex]) {
                    const courseElement = document.createElement('div');
                    courseElement.className = 'timetable-course';
                    courseElement.innerHTML = `
                        <div class="timetable-course-name">${course.course_name}</div>
                        <div class="timetable-course-time">${formatTime(timeInfo.startHour, timeInfo.startMin)} - ${formatTime(timeInfo.endHour, timeInfo.endMin)}</div>
                        <div class="timetable-course-location">${course.location || ''}</div>
                    `;
                    
                    // Position absolutely to span multiple cells
                    courseElement.style.position = 'absolute';
                    courseElement.style.top = '2px';
                    courseElement.style.left = '2px';
                    courseElement.style.right = '2px';
                    courseElement.style.height = `${height * 60 - 4}px`;
                    courseElement.style.zIndex = '10';
                    
                    // Make the starting cell and following cells position relative
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

// Staff functions
async function loadStaff() {
    try {
        const response = await fetch('/api/student/staff');
        const staff = await response.json();
        
        const tbody = document.querySelector('#staffTable tbody');
        tbody.innerHTML = '';
        
        if (staff.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No staff available</td></tr>';
            return;
        }
        
        staff.forEach(member => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${member.first_name}</td>
                <td>${member.last_name}</td>
                <td>${member.office || 'N/A'}</td>
                <td>${member.email}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        showMessage('staffMessage', 'Error loading staff', 'error');
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

// Initialize on page load
checkAuth();


