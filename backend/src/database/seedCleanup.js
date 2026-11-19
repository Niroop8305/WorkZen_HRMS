// Shared reset cleanup for the two full-reset seed scripts.
//
// A seed that replaces accounts must also replace the server-side state that
// points at them. `user_sessions` is the sharp edge: TRUNCATE TABLE users does not
// fire ON DELETE CASCADE, because TRUNCATE ignores foreign keys and the reset block
// runs with FOREIGN_KEY_CHECKS = 0. Any session row that survives is re-keyed onto
// whoever receives that user_id after the AUTO_INCREMENT reset, so an old token
// authenticates as a different person - not a stale login, a swapped one.
//
// Login throttle counters are handled differently. A bucket whose lockout has
// already expired is a counter for an address that no longer exists and goes with
// the rest of the demo data. A lockout that is still running is current protection
// against a live address, so it survives the reset; wiping it would let the seed
// double as a throttle bypass.
export const resetAccountScopedState = async (connection) => {
  await connection.query("TRUNCATE TABLE user_sessions");

  const [tables] = await connection.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_throttle'`,
  );

  if (tables.length === 0) {
    // A database created before the table was added to schema.sql. Skipping keeps
    // the reset working, but the login path will fail closed once throttling is
    // wired up, so say what has to be run.
    console.log(
      "   auth_throttle is absent; run `npm run migrate:auth-throttle` before enabling login throttling",
    );
    return { sessionsCleared: true, throttleTablePresent: false, lockoutsPreserved: 0 };
  }

  const [[lockouts]] = await connection.query(
    "SELECT COUNT(*) AS preserved FROM auth_throttle WHERE locked_until > CURRENT_TIMESTAMP",
  );
  await connection.query(
    "DELETE FROM auth_throttle WHERE locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP",
  );
  console.log(
    `   preserved ${lockouts.preserved} live login lockout(s) across the reset`,
  );

  return {
    sessionsCleared: true,
    throttleTablePresent: true,
    lockoutsPreserved: Number(lockouts.preserved),
  };
};
