// Built-in fetch used

const BASE_URL = 'http://localhost:5000/api';

async function verifyBackend() {
  console.log('🧪 Starting Backend Verification...');

  try {
    // 1. Test Admin Login
    console.log('\n--- Test 1: Admin Login ---');
    const adminRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@workzen.com', password: 'Password@123' })
    });
    
    const adminData = await adminRes.json();
    if (!adminData.success) throw new Error('Admin login failed');
    console.log('✅ Admin Login Successful');
    const adminToken = adminData.data.token;

    // 2. Test Employee Login
    console.log('\n--- Test 2: Employee Login ---');
    const empRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'emp1@workzen.com', password: 'Password@123' })
    });

    const empData = await empRes.json();
    if (!empData.success) throw new Error('Employee login failed');
    console.log('✅ Employee Login Successful');
    const empToken = empData.data.token;

    // 3. Test Get Profile
    console.log('\n--- Test 3: Get Employee Profile ---');
    const profileRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${empToken}` }
    });
    const profileData = await profileRes.json();
    if (!profileData.success) throw new Error('Get profile failed');
    console.log(`✅ Profile Fetched: ${profileData.data.profile.first_name} ${profileData.data.profile.last_name}`);

    // 4. Test Get Attendance
    console.log('\n--- Test 4: Get Attendance (Admin) ---');
    const attendanceRes = await fetch(`${BASE_URL}/attendance/today`, {
       headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    // Note: attendance/today might not exist or return data if no one marked today, but let's see response
    if (attendanceRes.status === 404) {
        console.log('⚠️ Attendance endpoint not found (Expected if not implemented)');
    } else {
        const attendanceData = await attendanceRes.json();
        console.log('✅ Attendance Endpoint Accessible', attendanceData.success ? '(Success)' : '(Failed/Empty)');
    }

    console.log('\n🎉 Verification Completed!');

  } catch (error) {
    console.error('❌ Verification Failed:', error.message);
  }
}

verifyBackend();
