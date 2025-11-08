# My Profile Page Feature

## Overview

A comprehensive profile management page for employees to view and edit their personal information, resume details, skills, and certifications.

## Features

### 1. Profile Header

- Company logo and name display
- User identification badge
- Quick access to dashboard
- Logout functionality

### 2. Profile Information Sections

- **Basic Info**: Name, Login ID, Email, Mobile
- **Company Info**: Company, Department, Manager, Location
- **Profile Avatar**: Customizable with user initials

### 3. Tabbed Interface

#### Resume Tab (Main Feature)

- **About Section**: Personal description and background
- **What I Love About My Job**: Work satisfaction and highlights
- **My Interests and Hobbies**: Personal interests outside work
- **Skills**: List of professional skills with add/edit capability
- **Certifications**: Professional certifications with add/edit capability
- **Edit Mode**: Toggle to edit all resume information

#### Private Info Tab

- Date of Birth
- Gender
- Address
- Emergency Contact Information

#### Salary Info Tab

- Restricted access message
- Directs users to contact HR/Payroll

#### Security Tab

- Password change functionality
- Two-Factor Authentication settings

## Usage

### Accessing My Profile

1. Log in to the WorkZen HRMS system
2. Click "My Profile" button from the Dashboard
3. Navigate to `/profile` route

### Editing Resume Information

1. Navigate to the Resume tab
2. Click "Edit Profile" button
3. Modify text in the text areas:
   - About
   - What I love about my job
   - My interests and hobbies
4. Add skills by clicking "+ Add Skills" button
5. Add certifications by clicking "+ Add Skills" button (in Certification section)
6. Click "Save Changes" to persist updates
7. Click "Cancel" to discard changes

### Navigation

- **Sidebar**: Quick access to other modules
  - Company Name & Logo (Home)
  - Employees
  - Attendance
  - Time Off
  - Payroll
  - Reports
  - Settings

## Technical Implementation

### Frontend Components

- **File**: `frontend/src/pages/MyProfile.jsx`
- **Styles**: `frontend/src/styles/MyProfile.css`
- **Route**: `/profile` (Protected route)

### Backend Support

#### Database Migration

Run the migration to add resume fields:

```sql
-- File: backend/src/database/add_resume_fields.sql
USE workzen_hrms;

ALTER TABLE employee_profiles
ADD COLUMN IF NOT EXISTS about TEXT,
ADD COLUMN IF NOT EXISTS what_i_love TEXT,
ADD COLUMN IF NOT EXISTS interests TEXT,
ADD COLUMN IF NOT EXISTS skills JSON,
ADD COLUMN IF NOT EXISTS certifications JSON;
```

#### API Endpoints

- **GET** `/api/users/profile/:userId` - Fetch profile data
- **PUT** `/api/users/profile/:userId` - Update profile data

#### Data Structure

```javascript
{
  about: "Text content",
  whatILove: "Text content",
  interests: "Text content",
  skills: ["Skill 1", "Skill 2", ...],
  certifications: ["Cert 1", "Cert 2", ...]
}
```

### Updated Models

- **profileModel.js**: Enhanced to handle JSON fields (skills, certifications)
  - JSON serialization on update
  - JSON parsing on retrieval
  - Default empty arrays for null values

## Styling

### Theme Colors

- Primary: Odoo Purple (`#714B67`)
- Background: Dark theme (`#0F0F0F`)
- Cards: Dark grey (`#1E1E1E`)
- Borders: Dark borders (`#333333`)

### Responsive Design

- Desktop: Full sidebar + content grid layout
- Tablet: Adjusted grid columns
- Mobile: Stacked layout, horizontal sidebar scroll

## Screenshots Reference

The design follows the provided mockup with:

- Two-column resume layout (Info sections | Skills/Certifications)
- Tabbed navigation interface
- Edit mode with inline text areas
- Add buttons for dynamic content
- Professional dark theme styling

## Future Enhancements

- Profile picture upload functionality
- Rich text editor for resume sections
- Skill endorsements from colleagues
- Certificate document uploads
- Print/Export resume as PDF
- Social media integration
- Privacy settings for profile visibility

## Dependencies

- React Router (navigation)
- Axios (API calls)
- Context API (authentication)

## Notes

- All users can view their own profile
- Admin and HR Officers can view all profiles
- Only profile owners can edit their own information
- JSON fields are stored in MySQL as TEXT with JSON parsing
- Form validation should be added for production use
