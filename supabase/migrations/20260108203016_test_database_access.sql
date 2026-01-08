/*
  # Test Database Access
  
  1. Create a test table to verify database write access
  2. Table will be used to demonstrate CRUD operations
*/

CREATE TABLE IF NOT EXISTS db_access_test (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  test_message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Insert a test record
INSERT INTO db_access_test (test_message) 
VALUES ('Database access confirmed at ' || now());
