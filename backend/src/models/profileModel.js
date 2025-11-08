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

      // Parse skills
      if (profile.skills) {
        try {
          if (typeof profile.skills === "string") {
            profile.skills = JSON.parse(profile.skills);
          }
          if (!Array.isArray(profile.skills)) {
            profile.skills = [];
          }
        } catch (e) {
          console.error("Error parsing skills:", e);
          profile.skills = [];
        }
      } else {
        profile.skills = [];
      }

      // Parse certifications
      if (profile.certifications) {
        try {
          if (typeof profile.certifications === "string") {
            profile.certifications = JSON.parse(profile.certifications);
          }
          if (!Array.isArray(profile.certifications)) {
            profile.certifications = [];
          }
        } catch (e) {
          console.error("Error parsing certifications:", e);
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
      if (processedData.skills !== undefined) {
        if (Array.isArray(processedData.skills)) {
          processedData.skills = JSON.stringify(processedData.skills);
          console.log("Saving skills:", processedData.skills);
        } else if (typeof processedData.skills === "string") {
          // Already a string, but verify it's valid JSON
          try {
            JSON.parse(processedData.skills);
          } catch (e) {
            console.error("Invalid skills JSON string:", processedData.skills);
            processedData.skills = JSON.stringify([]);
          }
        } else {
          processedData.skills = JSON.stringify([]);
        }
      }

      if (processedData.certifications !== undefined) {
        if (Array.isArray(processedData.certifications)) {
          processedData.certifications = JSON.stringify(
            processedData.certifications
          );
          console.log("Saving certifications:", processedData.certifications);
        } else if (typeof processedData.certifications === "string") {
          // Already a string, but verify it's valid JSON
          try {
            JSON.parse(processedData.certifications);
          } catch (e) {
            console.error(
              "Invalid certifications JSON string:",
              processedData.certifications
            );
            processedData.certifications = JSON.stringify([]);
          }
        } else {
          processedData.certifications = JSON.stringify([]);
        }
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

      console.log("Updating profile with fields:", fields);
      console.log("Values:", values);

      await pool.query(
        `UPDATE employee_profiles SET ${fields} WHERE user_id = ?`,
        values
      );

      console.log("Profile updated successfully for user:", userId);
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
