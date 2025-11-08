import { useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';

const CreateUserModal = ({ isOpen, onClose, onUserCreated }) => {
  const [formData, setFormData] = useState({
    email: '',
    role_name: 'Employee',
    first_name: '',
    last_name: '',
    phone: '',
    department: '',
    designation: '',
    company_name: 'Odoo India'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdUser, setCreatedUser] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setCreatedUser(null);

    try {
      const token = localStorage.getItem('workzen_token');
      const response = await axios.post(
        'http://localhost:5000/api/users/create',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        setCreatedUser({
          ...response.data.data,
          emailSent: response.data.emailSent,
          message: response.data.message
        });
        onUserCreated(response.data.data);
        
        // Reset form after 5 seconds
        setTimeout(() => {
          handleClose();
        }, 5000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      email: '',
      role_name: 'Employee',
      first_name: '',
      last_name: '',
      phone: '',
      department: '',
      designation: '',
      company_name: 'Odoo India'
    });
    setError('');
    setCreatedUser(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New User</h2>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          
          {createdUser && (
            <div className="alert alert-success">
              <h3>✅ User Created Successfully!</h3>
              <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                <p><strong>Email:</strong> {createdUser.email}</p>
                <p><strong>Temporary Password:</strong> <code style={{ background: '#333', padding: '4px 8px', borderRadius: '4px' }}>{createdUser.temporary_password}</code></p>
                <p><strong>Employee Code:</strong> {createdUser.employee_code}</p>
                {createdUser.emailSent ? (
                  <p style={{ marginTop: '10px', fontSize: '13px', color: '#155724' }}>
                    ✉️ <strong>Welcome email sent successfully!</strong> The user will receive their credentials at {createdUser.email}
                  </p>
                ) : (
                  <p style={{ marginTop: '10px', fontSize: '13px', color: '#856404' }}>
                    ⚠️ Email could not be sent. Please manually share these credentials with the user.
                  </p>
                )}
              </div>
            </div>
          )}

          {!createdUser && (
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    name="first_name"
                    className="form-input"
                    value={formData.first_name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    className="form-input"
                    value={formData.last_name}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email *</label>
                <input
                  type="email"
                  name="email"
                  className="form-input"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role *</label>
                <select
                  name="role_name"
                  className="form-input"
                  value={formData.role_name}
                  onChange={handleChange}
                  required
                >
                  <option value="Employee">Employee</option>
                  <option value="HR Manager">HR Manager</option>
                  <option value="Payroll Officer">Payroll Officer</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    className="form-input"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input
                    type="text"
                    name="department"
                    className="form-input"
                    value={formData.department}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Designation</label>
                <input
                  type="text"
                  name="designation"
                  className="form-input"
                  value={formData.designation}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input
                  type="text"
                  name="company_name"
                  className="form-input"
                  value={formData.company_name}
                  onChange={handleChange}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

CreateUserModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUserCreated: PropTypes.func.isRequired
};

export default CreateUserModal;
