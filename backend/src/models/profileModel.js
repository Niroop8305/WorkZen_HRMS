import pool from "../config/database.js";

export const EmployeeProfile = {
  // Create employee profile
  create: async (profileData) => {
    const {
      user_id,
      employee_code,
      company_name,
      first_name,
      last_name,
      phone,
      date_of_birth,
      gender,
      address,
      city,
      state,
      country,
      postal_code,
      emergency_contact_name,
      emergency_contact_phone,
      date_of_joining,
      department,
      designation,
    } = profileData;

    const [result] = await pool.query(
      `INSERT INTO employee_profiles (
        user_id, employee_code, company_name, first_name, last_name, phone,
        date_of_birth, gender, address, city, state, country, postal_code,
        emergency_contact_name, emergency_contact_phone, date_of_joining,
        department, designation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        employee_code,
        company_name,
        first_name,
        last_name,
        phone,
        date_of_birth,
        gender,
        address,
        city,
        state,
        country,
        postal_code,
        emergency_contact_name,
        emergency_contact_phone,
        date_of_joining,
        department,
        designation,
      ]
    );
    return result.insertId;
  },

  // Find profile by user ID
  findByUserId: async (userId) => {
    const [rows] = await pool.query(
      "SELECT * FROM employee_profiles WHERE user_id = ?",
      [userId]
    );

    if (rows[0]) {
      // Parse JSON fields
      const profile = rows[0];
      if (profile.skills) {
        try {
          profile.skills = JSON.parse(profile.skills);
        } catch (e) {
          profile.skills = [];
        }
      } else {
        profile.skills = [];
      }

      if (profile.certifications) {
        try {
          profile.certifications = JSON.parse(profile.certifications);
        } catch (e) {
          profile.certifications = [];
        }
      } else {
        profile.certifications = [];
      }

      return profile;
    }

    return rows[0];
  },

  // Update profile
  update: async (userId, profileData) => {
    try {
      // Handle JSON fields
      const processedData = { ...profileData };

      // Convert arrays to JSON strings for skills and certifications
      if (processedData.skills && Array.isArray(processedData.skills)) {
        processedData.skills = JSON.stringify(processedData.skills);
      }
      if (
        processedData.certifications &&
        Array.isArray(processedData.certifications)
      ) {
        processedData.certifications = JSON.stringify(
          processedData.certifications
        );
      }

      // Check if profile exists
      const [existing] = await pool.query(
        "SELECT profile_id FROM employee_profiles WHERE user_id = ?",
        [userId]
      );

      if (existing.length === 0) {
        // Profile doesn't exist, can't update resume fields without a profile
        throw new Error(
          "Employee profile not found. Please create profile first."
        );
      }

      // Only update fields that are provided
      const fields = Object.keys(processedData)
        .map((key) => `${key} = ?`)
        .join(", ");
      const values = [...Object.values(processedData), userId];

      await pool.query(
        `UPDATE employee_profiles SET ${fields} WHERE user_id = ?`,
        values
      );
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  },

  // Get all profiles
  findAll: async () => {
    const [rows] = await pool.query("SELECT * FROM employee_profiles");
    return rows;
  },
};

export default EmployeeProfile;
