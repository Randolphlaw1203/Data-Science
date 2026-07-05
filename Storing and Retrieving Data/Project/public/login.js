document.getElementById('loginForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    const userType = document.getElementById('userType').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');

    errorMessage.style.display = 'none';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password, user_type: userType })
        });

        const data = await response.json();

        if (response.ok) {
            if (userType === 'student') {
                window.location.href = '/student.html';
            } else if (userType === 'teacher') {
                window.location.href = '/teacher.html';
            } else if (userType === 'admin') {
                window.location.href = '/admin.html';
            }
        } else {
            errorMessage.textContent = data.error || 'Login failed';
            errorMessage.style.display = 'block';
        }
    } catch (error) {
        errorMessage.textContent = 'Network error. Please try again.';
        errorMessage.style.display = 'block';
    }
});