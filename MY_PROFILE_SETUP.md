# My Profile Feature Setup Guide

## Prerequisites

- WorkZen HRMS backend and frontend already set up
- MySQL database running
- Node.js and npm installed

## Step 1: Database Migration

Run the SQL migration to add resume fields to the database:

### Option A: Using MySQL Command Line

```bash
mysql -u root -p workzen_hrms < backend/src/database/add_resume_fields.sql
```

### Option B: Using MySQL Workbench

1. Open MySQL Workbench
2. Connect to your database
3. Open `backend/src/database/add_resume_fields.sql`
4. Execute the script

### Option C: Manual SQL Execution

Connect to your MySQL database and run:

```sql
USE workzen_hrms;

ALTER TABLE employee_profiles
ADD COLUMN IF NOT EXISTS about TEXT COMMENT 'About section for resume',
ADD COLUMN IF NOT EXISTS what_i_love TEXT COMMENT 'What I love about my job',
ADD COLUMN IF NOT EXISTS interests TEXT COMMENT 'My interests and hobbies',
ADD COLUMN IF NOT EXISTS skills JSON COMMENT 'Array of skills',
ADD COLUMN IF NOT EXISTS certifications JSON COMMENT 'Array of certifications';

UPDATE employee_profiles
SET skills = JSON_ARRAY(),
    certifications = JSON_ARRAY()
WHERE skills IS NULL OR certifications IS NULL;
```

## Step 2: Verify Backend Updates

The following files have been updated:

- ✅ `backend/src/models/profileModel.js` - JSON field handling
- ✅ `backend/src/routes/userRoutes.js` - Profile update endpoint

No additional backend changes needed if files are already updated.

## Step 3: Verify Frontend Updates

The following files have been created/updated:

- ✅ `frontend/src/pages/MyProfile.jsx` - New profile page component
- ✅ `frontend/src/styles/MyProfile.css` - Profile page styles
- ✅ `frontend/src/App.jsx` - Added `/profile` route
- ✅ `frontend/src/pages/Dashboard.jsx` - Added "My Profile" button
- ✅ `frontend/src/styles/App.css` - Added `.btn-secondary` style

## Step 4: Restart the Application

### Backend

```bash
cd backend
npm start
# or if using nodemon
npm run dev
```

### Frontend

```bash
cd frontend
npm run dev
```

## Step 5: Test the Feature

1. **Login** to the application
2. **Navigate** to Dashboard
3. **Click** "My Profile" button
4. **Verify** the profile page loads
5. **Click** "Resume" tab (should be active by default)
6. **Click** "Edit Profile" button
7. **Modify** any text fields
8. **Add** skills and certifications
9. **Click** "Save Changes"
10. **Verify** data persists after refresh

## Testing Checklist

- [ ] Profile page loads without errors
- [ ] All four tabs are clickable (Resume, Private Info, Salary Info, Security)
- [ ] Resume tab displays default Lorem Ipsum text
- [ ] Edit button toggles edit mode
- [ ] Text areas allow editing in edit mode
- [ ] Add Skills button prompts for input
- [ ] Add Certification button prompts for input
- [ ] Save Changes button persists data
- [ ] Cancel button discards changes
- [ ] Data persists after page refresh
- [ ] Dashboard button returns to dashboard
- [ ] Logout button works correctly
- [ ] Private Info tab shows user data
- [ ] Mobile responsive layout works

## Troubleshooting

### Issue: Database migration fails

**Solution**: Check if columns already exist. Drop them first if needed:

```sql
ALTER TABLE employee_profiles
DROP COLUMN IF EXISTS about,
DROP COLUMN IF EXISTS what_i_love,
DROP COLUMN IF EXISTS interests,
DROP COLUMN IF EXISTS skills,
DROP COLUMN IF EXISTS certifications;
```

Then re-run the migration.

### Issue: Profile page shows loading forever

**Solution**:

1. Check browser console for errors
2. Verify backend is running
3. Check API endpoint `/api/users/profile/:userId` returns data
4. Verify user is authenticated (token is valid)

### Issue: Skills/Certifications not saving

**Solution**:

1. Check browser console for errors
2. Verify JSON parsing in profileModel.js
3. Check MySQL JSON column type
4. Verify data format being sent to backend

### Issue: Edit mode not working

**Solution**:

1. Check if `editMode` state is toggling
2. Verify button click handlers are attached
3. Check CSS for `.edit-textarea` class

### Issue: Styles not loading

**Solution**:

1. Verify `MyProfile.css` is imported in `MyProfile.jsx`
2. Clear browser cache
3. Check browser developer tools for CSS load errors
4. Verify CSS variable definitions in `App.css`

## API Testing

### Get Profile

```bash
curl -X GET http://localhost:5000/api/users/profile/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update Profile

```bash
curl -X PUT http://localhost:5000/api/users/profile/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "about": "Software Engineer with 5 years experience",
    "what_i_love": "I love solving complex problems",
    "interests": "Coding, Reading, Gaming",
    "skills": ["JavaScript", "React", "Node.js"],
    "certifications": ["AWS Certified", "Google Cloud"]
  }'
```

## Security Notes

- Profile data is protected by authentication middleware
- Users can only edit their own profiles
- Admin and HR Officers can view all profiles
- JSON fields are sanitized before storage
- XSS protection via React's built-in escaping

## Performance Considerations

- JSON fields are indexed for faster queries
- Profile data is cached in frontend state
- Lazy loading can be implemented for large skill lists
- Consider pagination for certifications if list grows large

## Next Steps

After successful setup, consider:

1. Adding profile picture upload
2. Implementing skill endorsements
3. Adding certificate file uploads
4. Creating a public profile view
5. Adding export to PDF functionality
6. Implementing profile completion percentage

## Support

For issues or questions:

- Check the main README.md
- Review API_TESTING.md for API documentation
- Check browser console for client-side errors
- Check backend logs for server-side errors
