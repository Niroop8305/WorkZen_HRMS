-- Create password_reset_codes table for password reset functionality
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  reset_code VARCHAR(64) NOT NULL COMMENT 'SHA-256 hex digest of the emailed 6-digit code (T-003)',
  is_used BOOLEAN DEFAULT FALSE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_user_reset_code (user_id, reset_code),
  INDEX idx_expires_at (expires_at)
);
