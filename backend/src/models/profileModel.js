import pool from "../config/database.js";

// The only source of column identifiers for profile updates. Request bodies are
// matched against these keys, so a client-supplied name can never reach the SQL
// string, and columns outside this map cannot be mass-assigned.
export const EDITABLE_PROFILE_COLUMNS = {
  first_name: "first_name",
  last_name: "last_name",
  phone: "phone",
  date_of_birth: "date_of_birth",
  gender: "gender",
  address: "address",
  city: "city",
  state: "state",
  country: "country",
  postal_code: "postal_code",
  emergency_contact_name: "emergency_contact_name",
  emergency_contact_phone: "emergency_contact_phone",
  date_of_joining: "date_of_joining",
  department: "department",
  designation: "designation",
  company_name: "company_name",
  profile_picture: "profile_picture",
};

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
};

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
      const keys = Object.keys(profileData || {});

      if (keys.length === 0) {
        badRequest("No profile fields provided to update");
      }

      const prohibited = keys.filter(
        (key) => !(key in EDITABLE_PROFILE_COLUMNS)
      );
      if (prohibited.length > 0) {
        badRequest(
          "Profile update contains fields that are not editable through this endpoint"
        );
      }

      const entries = keys.map((key) => [
        EDITABLE_PROFILE_COLUMNS[key],
        profileData[key],
      ]);

      if (
        entries.some(
          ([, value]) => value !== null && typeof value === "object"
        )
      ) {
        badRequest("Profile fields must be scalar values");
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

      const setClause = entries.map(([column]) => `${column} = ?`).join(", ");
      const values = [...entries.map(([, value]) => value), userId];

      await pool.query(
        `UPDATE employee_profiles SET ${setClause} WHERE user_id = ?`,
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
