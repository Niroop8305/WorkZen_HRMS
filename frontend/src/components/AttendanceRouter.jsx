import React from 'react';
import { useAuth } from '../context/AuthContext';
import Attendance from '../pages/Attendance';
import EmployeeAttendance from '../pages/EmployeeAttendance';

const AttendanceRouter = () => {
  const { user } = useAuth();
  
  // Check if user has privileged role (Admin, HR Officer, or Payroll Officer)
  const isPrivileged = user?.role === 'Admin' || 
                       user?.role === 'HR Officer' || 
                       user?.role === 'Payroll Officer';
  
  // Route to appropriate attendance page based on role
  return isPrivileged ? <Attendance /> : <EmployeeAttendance />;
};

export default AttendanceRouter;
