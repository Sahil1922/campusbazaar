// Connection settings for the automated-test database. Override with TEST_DB_* variables.
// The database name must end in "_test" because the tests delete all of its rows.
export const testDb = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || 3307),
  user: process.env.TEST_DB_USER || 'root',
  password: process.env.TEST_DB_PASSWORD || '',
  database: process.env.TEST_DB_NAME || 'campusbazaar_test',
};

if (!/^[A-Za-z0-9_]+_test$/.test(testDb.database)) {
  throw new Error('TEST_DB_NAME must end in "_test"; the test suite deletes all rows in it.');
}
