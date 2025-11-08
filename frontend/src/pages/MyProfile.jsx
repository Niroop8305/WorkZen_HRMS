import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import "../styles/MyProfile.css";

const MyProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("resume");
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [privateInfoEditMode, setPrivateInfoEditMode] = useState(false);
  const [formData, setFormData] = useState({
    about: "",
    whatILove: "",
    interests: "",
    skills: [],
    certifications: [],
    companyName: "",
    department: "",
    manager: "",
    location: "",
    dateOfBirth: "",
    address: "",
    country: "",
    gender: "",
    maritalStatus: "",
    dateOfJoining: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    loginId: "",
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [resetForm, setResetForm] = useState({
    resetCode: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetErrors, setResetErrors] = useState({});
  const [resetSuccess, setResetSuccess] = useState("");
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/users/profile/${user.userId}`);
      setProfileData(response.data.data);

      console.log("Fetched profile data:", response.data.data);

      // Parse skills and certifications - handle both array and string formats
      let skills = response.data.data.profile?.skills || [];
      let certifications = response.data.data.profile?.certifications || [];

      // If skills is a string, try to parse it
      if (typeof skills === "string") {
        try {
          skills = JSON.parse(skills);
        } catch (e) {
          console.error("Error parsing skills:", e);
          skills = [];
        }
      }

      // If certifications is a string, try to parse it
      if (typeof certifications === "string") {
        try {
          certifications = JSON.parse(certifications);
        } catch (e) {
          console.error("Error parsing certifications:", e);
          certifications = [];
        }
      }

      // Ensure they are arrays
      if (!Array.isArray(skills)) skills = [];
      if (!Array.isArray(certifications)) certifications = [];

      console.log("Parsed skills:", skills);
      console.log("Parsed certifications:", certifications);

      // Initialize form data with existing data or defaults
      // Backend returns snake_case, convert to camelCase for frontend
      setFormData({
        about:
          response.data.data.profile?.about ||
          "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.",
        whatILove:
          response.data.data.profile?.what_i_love ||
          "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.",
        interests:
          response.data.data.profile?.interests ||
          "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.",
        skills: skills,
        certifications: certifications,
        companyName: response.data.data.profile?.company_name || "",
        department: response.data.data.profile?.department || "",
        manager: response.data.data.profile?.manager || "",
        location: response.data.data.profile?.city || "",
        dateOfBirth: response.data.data.profile?.date_of_birth || "",
        address: response.data.data.profile?.address || "",
        country: response.data.data.profile?.country || "",
        gender: response.data.data.profile?.gender || "",
        maritalStatus: response.data.data.profile?.marital_status || "",
        dateOfJoining: response.data.data.profile?.date_of_joining || "",
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddSkill = () => {
    const newSkill = prompt("Enter new skill:");
    if (newSkill && newSkill.trim()) {
      setFormData((prev) => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()],
      }));
    }
  };

  const handleAddCertification = () => {
    const newCert = prompt("Enter new certification:");
    if (newCert && newCert.trim()) {
      setFormData((prev) => ({
        ...prev,
        certifications: [...prev.certifications, newCert.trim()],
      }));
    }
  };

  const handleSave = async () => {
    try {
      // Ensure skills and certifications are arrays
      const skills = Array.isArray(formData.skills) ? formData.skills : [];
      const certifications = Array.isArray(formData.certifications)
        ? formData.certifications
        : [];

      console.log("Saving profile with skills:", skills);
      console.log("Saving profile with certifications:", certifications);

      // Convert camelCase to snake_case for backend
      const dataToSend = {
        about: formData.about,
        what_i_love: formData.whatILove,
        interests: formData.interests,
        skills: skills,
        certifications: certifications,
        company_name: formData.companyName,
        department: formData.department,
        manager: formData.manager,
        city: formData.location,
      };

      console.log("Data being sent to backend:", dataToSend);

      const response = await api.put(
        `/users/profile/${user.userId}`,
        dataToSend
      );
      console.log("Profile update response:", response.data);

      setEditMode(false);
      await fetchProfileData();
      alert("Profile updated successfully!");
    } catch (error) {
      console.error("Error saving profile:", error);
      console.error("Error response:", error.response?.data);
      alert(
        `Error saving profile: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  };

  const handlePrivateInfoSave = async () => {
    try {
      // Convert camelCase to snake_case for backend
      const dataToSend = {
        date_of_birth: formData.dateOfBirth,
        address: formData.address,
        country: formData.country,
        gender: formData.gender,
        marital_status: formData.maritalStatus,
        date_of_joining: formData.dateOfJoining,
      };

      await api.put(`/users/profile/${user.userId}`, dataToSend);
      setPrivateInfoEditMode(false);
      fetchProfileData();
      alert("Private information updated successfully!");
    } catch (error) {
      console.error("Error saving private info:", error);
      alert(
        `Error saving private info: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  };

  // Password Management Functions
  useEffect(() => {
    if (activeTab === "security" && user?.email) {
      setPasswordForm((prev) => ({
        ...prev,
        loginId: user.email,
      }));
    }
  }, [activeTab, user]);

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field
    setPasswordErrors((prev) => ({
      ...prev,
      [name]: "",
    }));
  };

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }
    if (!/[0-9]/.test(password)) {
      errors.push("Password must contain at least one number");
    }
    if (!/[!@#$%^&*]/.test(password)) {
      errors.push(
        "Password must contain at least one special character (!@#$%^&*)"
      );
    }
    return errors;
  };

  const handlePasswordReset = async () => {
    // Clear previous errors and success messages
    setPasswordErrors({});
    setPasswordSuccess("");

    // Validation
    const errors = {};

    if (!passwordForm.oldPassword) {
      errors.oldPassword = "Old password is required";
    }

    if (!passwordForm.newPassword) {
      errors.newPassword = "New password is required";
    } else {
      const passwordValidationErrors = validatePassword(
        passwordForm.newPassword
      );
      if (passwordValidationErrors.length > 0) {
        errors.newPassword = passwordValidationErrors.join(". ");
      }
    }

    if (!passwordForm.confirmPassword) {
      errors.confirmPassword = "Please confirm your new password";
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (passwordForm.oldPassword === passwordForm.newPassword) {
      errors.newPassword = "New password must be different from old password";
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    // Submit password change
    setPasswordLoading(true);
    try {
      const response = await api.post("/auth/change-password", {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });

      console.log("Password change response:", response.data);

      // Clear any previous errors
      setPasswordErrors({});

      setPasswordSuccess(
        response.data.message ||
          "Password updated successfully! A confirmation email has been sent."
      );

      // Clear form
      setPasswordForm({
        loginId: user.email,
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      console.error("Error changing password:", error);
      console.error("Error response:", error.response);
      setPasswordErrors({
        general:
          error.response?.data?.message ||
          "Failed to update password. Please try again.",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRequestResetCode = async () => {
    setResetErrors({});
    setResetSuccess("");
    setResetLoading(true);

    try {
      const response = await api.post("/auth/request-reset-code");

      setResetSuccess(
        response.data.message || "Verification code sent to your email!"
      );
      setResetCodeSent(true);
      setShowResetForm(true);

      // Clear reset form
      setResetForm({
        resetCode: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      console.error("Error requesting reset code:", error);
      setResetErrors({
        general:
          error.response?.data?.message ||
          "Failed to send verification code. Please try again.",
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPasswordWithCode = async () => {
    setResetErrors({});
    setResetSuccess("");

    // Validation
    const errors = {};

    if (!resetForm.resetCode || resetForm.resetCode.length !== 6) {
      errors.resetCode = "Please enter the 6-digit verification code";
    }

    if (!resetForm.newPassword) {
      errors.newPassword = "New password is required";
    } else {
      const passwordValidationErrors = validatePassword(resetForm.newPassword);
      if (passwordValidationErrors.length > 0) {
        errors.newPassword = passwordValidationErrors.join(". ");
      }
    }

    if (!resetForm.confirmPassword) {
      errors.confirmPassword = "Please confirm your new password";
    } else if (resetForm.newPassword !== resetForm.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(errors).length > 0) {
      setResetErrors(errors);
      return;
    }

    // Submit password reset
    setResetLoading(true);
    try {
      const response = await api.post("/auth/reset-password-with-code", {
        resetCode: resetForm.resetCode,
        newPassword: resetForm.newPassword,
        confirmPassword: resetForm.confirmPassword,
      });

      setResetSuccess(response.data.message || "Password reset successfully!");

      // Clear form and reset state
      setResetForm({
        resetCode: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowResetForm(false);
      setResetCodeSent(false);
    } catch (error) {
      console.error("Error resetting password:", error);
      setResetErrors({
        general:
          error.response?.data?.message ||
          "Failed to reset password. Please try again.",
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetFormChange = (e) => {
    const { name, value } = e.target;
    setResetForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  if (loading) {
    return (
      <div className="profile-container">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  const profile = profileData?.profile || {};
  const userName =
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    user?.email;

  return (
    <div className="profile-container">
      {/* Content Area */}
      <div className="profile-content">
        <div className="profile-header-section">
          <div className="profile-avatar-section">
            <div className="profile-avatar">
              <span className="avatar-initial">
                {userName.charAt(0).toUpperCase()}
              </span>
              <button className="edit-avatar-btn">✏️</button>
              <div className="avatar-badge">Content Narwhal</div>
            </div>
            <div className="profile-basic-info">
              <h2 className="profile-name">My Name</h2>
              <div className="profile-field">
                <label>Login ID</label>
                <div className="field-value">{user?.email}</div>
              </div>
              <div className="profile-field">
                <label>Email</label>
                <div className="field-value">{user?.email}</div>
              </div>
              <div className="profile-field">
                <label>Mobile</label>
                <div className="field-value">{profile.phone || ""}</div>
              </div>
            </div>
          </div>

          <div className="profile-company-info">
            <div className="profile-field">
              <label>Company</label>
              {editMode ? (
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  className="field-input"
                  placeholder="Company name"
                />
              ) : (
                <div className="field-value">
                  {formData.companyName || profile.company_name || ""}
                </div>
              )}
            </div>
            <div className="profile-field">
              <label>Department</label>
              {editMode ? (
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  className="field-input"
                  placeholder="Department"
                />
              ) : (
                <div className="field-value">
                  {formData.department || profile.department || ""}
                </div>
              )}
            </div>
            <div className="profile-field">
              <label>Manager</label>
              {editMode ? (
                <input
                  type="text"
                  name="manager"
                  value={formData.manager}
                  onChange={handleInputChange}
                  className="field-input"
                  placeholder="Manager name"
                />
              ) : (
                <div className="field-value">
                  {formData.manager || profile.manager || ""}
                </div>
              )}
            </div>
            <div className="profile-field">
              <label>Location</label>
              {editMode ? (
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="field-input"
                  placeholder="City/Location"
                />
              ) : (
                <div className="field-value">
                  {formData.location || profile.city || ""}
                </div>
              )}
            </div>
          </div>

          {/* Edit button for header section */}
          <div className="header-edit-section">
            {!editMode && (
              <button className="edit-btn" onClick={() => setEditMode(true)}>
                ✏️ Edit
              </button>
            )}
            {editMode && (
              <div className="edit-actions">
                <button className="save-btn" onClick={handleSave}>
                  Save Changes
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setEditMode(false);
                    fetchProfileData();
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            className={`tab ${activeTab === "resume" ? "active" : ""}`}
            onClick={() => setActiveTab("resume")}
          >
            Resume
          </button>
          <button
            className={`tab ${activeTab === "private" ? "active" : ""}`}
            onClick={() => setActiveTab("private")}
          >
            Private Info
          </button>
          <button
            className={`tab ${activeTab === "salary" ? "active" : ""}`}
            onClick={() => setActiveTab("salary")}
          >
            Salary Info
          </button>
          <button
            className={`tab ${activeTab === "security" ? "active" : ""}`}
            onClick={() => setActiveTab("security")}
          >
            Security
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === "resume" && (
            <div className="resume-content">
              <div className="resume-section">
                <div className="resume-left">
                  <div className="info-section">
                    <h3>About</h3>
                    {editMode ? (
                      <textarea
                        name="about"
                        value={formData.about}
                        onChange={handleInputChange}
                        className="edit-textarea"
                        rows="4"
                      />
                    ) : (
                      <p>{formData.about}</p>
                    )}
                  </div>

                  <div className="info-section">
                    <h3>What I love about my job</h3>
                    {editMode ? (
                      <textarea
                        name="whatILove"
                        value={formData.whatILove}
                        onChange={handleInputChange}
                        className="edit-textarea"
                        rows="4"
                      />
                    ) : (
                      <p>{formData.whatILove}</p>
                    )}
                  </div>

                  <div className="info-section">
                    <h3>My interests and hobbies</h3>
                    {editMode ? (
                      <textarea
                        name="interests"
                        value={formData.interests}
                        onChange={handleInputChange}
                        className="edit-textarea"
                        rows="4"
                      />
                    ) : (
                      <p>{formData.interests}</p>
                    )}
                  </div>
                </div>

                <div className="resume-right">
                  <div className="skills-section">
                    <h3>Skills</h3>
                    <div className="skills-list">
                      {formData.skills.length > 0 ? (
                        formData.skills.map((skill, index) => (
                          <div key={index} className="skill-item">
                            {skill}
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">No skills added yet</div>
                      )}
                    </div>
                    {editMode && (
                      <button className="add-btn" onClick={handleAddSkill}>
                        + Add Skills
                      </button>
                    )}
                  </div>

                  <div className="certification-section">
                    <h3>Certification</h3>
                    <div className="certification-list">
                      {formData.certifications.length > 0 ? (
                        formData.certifications.map((cert, index) => (
                          <div key={index} className="cert-item">
                            {cert}
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">
                          No certifications added yet
                        </div>
                      )}
                    </div>
                    {editMode && (
                      <button
                        className="add-btn"
                        onClick={handleAddCertification}
                      >
                        + Add Skills
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit and Save buttons for Resume */}
              <div
                className="resume-actions"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  marginTop: "30px",
                  paddingTop: "20px",
                  borderTop: "1px solid #444",
                  gap: "15px",
                  position: "relative",
                  width: "100%",
                }}
              >
                {!editMode ? (
                  <button
                    className="edit-btn"
                    onClick={() => setEditMode(true)}
                    style={{
                      backgroundColor: "#714B67",
                      color: "white",
                      padding: "12px 30px",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "16px",
                      fontWeight: "500",
                    }}
                  >
                    ✏️ Edit
                  </button>
                ) : (
                  <>
                    <button
                      className="save-btn"
                      onClick={handleSave}
                      style={{
                        backgroundColor: "#27ae60",
                        color: "white",
                        padding: "12px 30px",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "16px",
                        fontWeight: "500",
                      }}
                    >
                      Save Changes
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setEditMode(false);
                        fetchProfileData();
                      }}
                      style={{
                        backgroundColor: "#555",
                        color: "white",
                        padding: "12px 30px",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "16px",
                        fontWeight: "500",
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "private" && (
            <div className="private-info-content">
              <div className="info-grid-two-column">
                <div className="info-item">
                  <label>Date of Birth</label>
                  {privateInfoEditMode ? (
                    <input
                      type="date"
                      name="dateOfBirth"
                      className="info-input"
                      value={formData.dateOfBirth}
                      onChange={handleInputChange}
                    />
                  ) : (
                    <div className="info-display">
                      {formData.dateOfBirth || "Not set"}
                    </div>
                  )}
                </div>
                <div className="info-item">
                  <label>Residing Address</label>
                  {privateInfoEditMode ? (
                    <input
                      type="text"
                      name="address"
                      className="info-input"
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="Enter your address"
                    />
                  ) : (
                    <div className="info-display">
                      {formData.address || "Not set"}
                    </div>
                  )}
                </div>
                <div className="info-item">
                  <label>Nationality</label>
                  {privateInfoEditMode ? (
                    <input
                      type="text"
                      name="country"
                      className="info-input"
                      value={formData.country}
                      onChange={handleInputChange}
                      placeholder="Enter your nationality"
                    />
                  ) : (
                    <div className="info-display">
                      {formData.country || "Not set"}
                    </div>
                  )}
                </div>
                <div className="info-item">
                  <label>Personal Email</label>
                  <div className="info-display">{user?.email || ""}</div>
                </div>
                <div className="info-item">
                  <label>Gender</label>
                  {privateInfoEditMode ? (
                    <select
                      name="gender"
                      className="info-input"
                      value={formData.gender}
                      onChange={handleInputChange}
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <div className="info-display">
                      {formData.gender || "Not set"}
                    </div>
                  )}
                </div>
                <div className="info-item">
                  <label>Marital Status</label>
                  {privateInfoEditMode ? (
                    <select
                      name="maritalStatus"
                      className="info-input"
                      value={formData.maritalStatus}
                      onChange={handleInputChange}
                    >
                      <option value="">Select Status</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Divorced">Divorced</option>
                      <option value="Widowed">Widowed</option>
                    </select>
                  ) : (
                    <div className="info-display">
                      {formData.maritalStatus || "Not set"}
                    </div>
                  )}
                </div>
                <div className="info-item">
                  <label>Date of Joining</label>
                  {privateInfoEditMode ? (
                    <input
                      type="date"
                      name="dateOfJoining"
                      className="info-input"
                      value={formData.dateOfJoining}
                      onChange={handleInputChange}
                    />
                  ) : (
                    <div className="info-display">
                      {formData.dateOfJoining || "Not set"}
                    </div>
                  )}
                </div>
              </div>

              {/* Save and Cancel buttons for Private Info */}
              <div
                className="private-info-actions"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  marginTop: "30px",
                  paddingTop: "20px",
                  borderTop: "1px solid #444",
                  gap: "15px",
                  position: "relative",
                  width: "100%",
                }}
              >
                {!privateInfoEditMode ? (
                  <button
                    className="edit-btn"
                    onClick={() => {
                      console.log("Edit button clicked!");
                      setPrivateInfoEditMode(true);
                    }}
                    style={{
                      backgroundColor: "#714B67",
                      color: "white",
                      padding: "12px 30px",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "16px",
                      fontWeight: "500",
                    }}
                  >
                    ✏️ Edit
                  </button>
                ) : (
                  <>
                    <button
                      className="save-btn"
                      onClick={handlePrivateInfoSave}
                      style={{
                        backgroundColor: "#27ae60",
                        color: "white",
                        padding: "12px 30px",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "16px",
                        fontWeight: "500",
                      }}
                    >
                      Save Changes
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setPrivateInfoEditMode(false);
                        fetchProfileData();
                      }}
                      style={{
                        backgroundColor: "#555",
                        color: "white",
                        padding: "12px 30px",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "16px",
                        fontWeight: "500",
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "salary" && (
            <div className="salary-info-content">
              {/* Salary Overview */}
              <div className="salary-overview">
                <div className="salary-row">
                  <label>Month Wage</label>
                  <div className="salary-value-group">
                    <input
                      type="text"
                      className="salary-input"
                      value="50000"
                      readOnly
                    />
                    <span className="salary-unit">/ Month</span>
                  </div>
                  <div className="working-days-section">
                    <label>No of working days in a week:</label>
                    <input
                      type="text"
                      className="salary-input-small"
                      value=""
                      readOnly
                    />
                  </div>
                </div>
                <div className="salary-row">
                  <label>Yearly wage</label>
                  <div className="salary-value-group">
                    <input
                      type="text"
                      className="salary-input"
                      value="600000"
                      readOnly
                    />
                    <span className="salary-unit">/ Yearly</span>
                  </div>
                  <div className="working-days-section">
                    <label>Break Time:</label>
                    <input
                      type="text"
                      className="salary-input-small"
                      value=""
                      readOnly
                    />
                    <span className="salary-unit">/hrs</span>
                  </div>
                </div>
              </div>

              {/* Salary Components */}
              <div className="salary-section">
                <h3>Salary Components</h3>
                <div className="salary-components-grid">
                  {/* Basic Salary */}
                  <div className="component-item">
                    <div className="component-header">
                      <strong>Basic Salary</strong>
                      <div className="component-values">
                        <span>25000.00 ₹ / month</span>
                        <span>50.00 %</span>
                      </div>
                    </div>
                    <p className="component-description">
                      Define Basic Salary from company cost compute it based on
                      monthly Wages
                    </p>
                  </div>

                  {/* House Rent Allowance */}
                  <div className="component-item">
                    <div className="component-header">
                      <strong>House Rent Allowance</strong>
                      <div className="component-values">
                        <span>12500.00 ₹ / month</span>
                        <span>50.00 %</span>
                      </div>
                    </div>
                    <p className="component-description">
                      HRA provided to employees 50% of the basic salary
                    </p>
                  </div>

                  {/* Standard Allowance */}
                  <div className="component-item">
                    <div className="component-header">
                      <strong>Standard Allowance</strong>
                      <div className="component-values">
                        <span>4167.00 ₹ / month</span>
                        <span>16.67 %</span>
                      </div>
                    </div>
                    <p className="component-description">
                      A standard allowance is a predetermined, fixed amount
                      provided to employee as part of their salary
                    </p>
                  </div>

                  {/* Performance Bonus */}
                  <div className="component-item">
                    <div className="component-header">
                      <strong>Performance Bonus</strong>
                      <div className="component-values">
                        <span>2082.50 ₹ / month</span>
                        <span>8.33 %</span>
                      </div>
                    </div>
                    <p className="component-description">
                      Variable amount paid during payroll. The value defined by
                      the company and calculated as a % of the basic salary
                    </p>
                  </div>

                  {/* Leave Travel Allowance */}
                  <div className="component-item">
                    <div className="component-header">
                      <strong>Leave Travel Allowance</strong>
                      <div className="component-values">
                        <span>2082.50 ₹ / month</span>
                        <span>8.33 %</span>
                      </div>
                    </div>
                    <p className="component-description">
                      LTA is paid by the company to employees to cover their
                      travel expenses, and calculated as a % of the basic salary
                    </p>
                  </div>

                  {/* Fixed Allowance */}
                  <div className="component-item">
                    <div className="component-header">
                      <strong>Fixed Allowance</strong>
                      <div className="component-values">
                        <span>2918.00 ₹ / month</span>
                        <span>11.67 %</span>
                      </div>
                    </div>
                    <p className="component-description">
                      Fixed allowance portion of wages is determined after
                      calculating all salary components
                    </p>
                  </div>
                </div>
              </div>

              {/* Provident Fund Section */}
              <div className="salary-section">
                <h3 className="section-title-with-badge">
                  <span className="badge-magnificent">Magnificent Weasel</span>
                  <span> ent Fund (PF) Contribution</span>
                </h3>
                <div className="pf-grid">
                  <div className="pf-item">
                    <label>Employee</label>
                    <div className="pf-values">
                      <span>50.00 %</span>
                      <input
                        type="text"
                        className="pf-input"
                        value="3000.00"
                        readOnly
                      />
                      <span>₹ / month</span>
                      <span>12.00 %</span>
                    </div>
                    <p className="pf-description">
                      PF is calculated based on the basic salary
                    </p>
                  </div>
                  <div className="pf-item">
                    <label>Employer</label>
                    <div className="pf-values">
                      <span></span>
                      <input
                        type="text"
                        className="pf-input"
                        value="3000.00"
                        readOnly
                      />
                      <span>₹ / month</span>
                      <span>12.00 %</span>
                    </div>
                    <p className="pf-description">
                      PF is calculated based on the basic salary
                    </p>
                  </div>
                </div>
              </div>

              {/* Tax Deductions */}
              <div className="salary-section">
                <h3>Tax Deductions</h3>
                <div className="tax-item">
                  <div className="tax-header">
                    <strong>Professional Tax</strong>
                    <div className="tax-values">
                      <span>200.00 ₹ / month</span>
                    </div>
                  </div>
                  <p className="tax-description">
                    Professional Tax deducted from the Gross Salary
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="security-content">
              <h3>Password Management</h3>

              {/* Reset Password with Verification Code Section */}
              <div className="reset-with-code-section">
                <h4>🔐 Reset Password</h4>
                <p className="section-description">
                  Click "Reset Password" to receive a verification code via
                  email. Enter the code to reset your password securely.
                </p>

                {/* Reset Success Message */}
                {resetSuccess && (
                  <div className="password-success-message">
                    <span className="success-icon">✓</span>
                    {resetSuccess}
                  </div>
                )}

                {/* Reset Error Message */}
                {resetErrors.general && (
                  <div className="password-error-message">
                    <span className="error-icon">✗</span>
                    {resetErrors.general}
                  </div>
                )}

                {!showResetForm ? (
                  <div className="reset-button-container">
                    <button
                      className="btn btn-secondary request-code-btn"
                      onClick={handleRequestResetCode}
                      disabled={resetLoading}
                    >
                      {resetLoading ? "Sending..." : "🔒 Reset Password"}
                    </button>
                    <p className="reset-hint">
                      You'll receive a 6-digit verification code in your email
                      (valid for 10 minutes)
                    </p>
                  </div>
                ) : (
                  <div className="reset-code-form">
                    <div className="password-field-group">
                      <label>Verification Code:</label>
                      <input
                        type="text"
                        name="resetCode"
                        className={`password-input code-input ${
                          resetErrors.resetCode ? "input-error" : ""
                        }`}
                        value={resetForm.resetCode}
                        onChange={handleResetFormChange}
                        placeholder="Enter 6-digit code"
                        maxLength="6"
                      />
                      {resetErrors.resetCode && (
                        <p className="field-error">{resetErrors.resetCode}</p>
                      )}
                      <p className="field-hint">
                        Check your email for the verification code (expires in
                        10 minutes)
                      </p>
                    </div>

                    <div className="password-field-group">
                      <label>New Password:</label>
                      <input
                        type="password"
                        name="newPassword"
                        className={`password-input ${
                          resetErrors.newPassword ? "input-error" : ""
                        }`}
                        value={resetForm.newPassword}
                        onChange={handleResetFormChange}
                        placeholder="Enter new password"
                      />
                      {resetErrors.newPassword && (
                        <p className="field-error">{resetErrors.newPassword}</p>
                      )}
                      <p className="field-hint">
                        Password must be at least 8 characters with uppercase,
                        lowercase, number, and special character (!@#$%^&*)
                      </p>
                    </div>

                    <div className="password-field-group">
                      <label>Confirm Password:</label>
                      <input
                        type="password"
                        name="confirmPassword"
                        className={`password-input ${
                          resetErrors.confirmPassword ? "input-error" : ""
                        }`}
                        value={resetForm.confirmPassword}
                        onChange={handleResetFormChange}
                        placeholder="Confirm new password"
                      />
                      {resetErrors.confirmPassword && (
                        <p className="field-error">
                          {resetErrors.confirmPassword}
                        </p>
                      )}
                    </div>

                    <div className="password-actions">
                      <button
                        className="btn btn-primary"
                        onClick={handleResetPasswordWithCode}
                        disabled={resetLoading}
                      >
                        {resetLoading ? "Resetting..." : "Confirm Reset"}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowResetForm(false);
                          setResetCodeSent(false);
                          setResetForm({
                            resetCode: "",
                            newPassword: "",
                            confirmPassword: "",
                          });
                          setResetErrors({});
                          setResetSuccess("");
                        }}
                        disabled={resetLoading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Section - Only visible to Admin */}
              {user?.role === "Admin" && (
                <div className="admin-password-section">
                  <h4>Admin Note</h4>
                  <p className="admin-note">
                    Password reset via verification code is available for all
                    users.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyProfile;
