/*
SQL Schema for School Management (PostgreSQL)
*/

-- Create schema
CREATE SCHEMA my_schema;

-- Roles for users
CREATE TYPE my_schema.user_role AS ENUM ('admin', 'teacher', 'student');

-- Users table (administrators, teachers, students)
CREATE TABLE my_schema.users (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role my_schema.user_role NOT NULL,
  date_of_birth DATE,
  class_id INT REFERENCES my_schema.classes(id),  -- ✅ added here
  subject_id INT REFERENCES my_schema.subjects(id),  -- ✅ moved here directly
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classes (fixed list: 1M1, 1M2, ...)
CREATE TABLE my_schema.classes (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- Subjects (fixed list)
CREATE TABLE my_schema.subjects (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- Link teachers to classes (many-to-many)
CREATE TABLE my_schema.teacher_classes (
  teacher_id INT REFERENCES my_schema.users(id) ON DELETE CASCADE,
  class_id INT REFERENCES my_schema.classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);

-- Evaluations (belongs to subject, class, teacher)
CREATE TABLE my_schema.evaluations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  coefficient NUMERIC CHECK (coefficient > 0) DEFAULT 1,
  subject_id INT REFERENCES my_schema.subjects(id) ON DELETE SET NULL,
  class_id INT REFERENCES my_schema.classes(id) ON DELETE SET NULL,
  teacher_id INT REFERENCES my_schema.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grades (linked to student and evaluation)
CREATE TABLE my_schema.grades (
  id SERIAL PRIMARY KEY,
  student_id INT REFERENCES my_schema.users(id) ON DELETE CASCADE,
  evaluation_id INT REFERENCES my_schema.evaluations(id) ON DELETE CASCADE,
  grade NUMERIC CHECK (grade >= 0 AND grade <= 20) NOT NULL,
  remarks TEXT,  
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- Attendance (absences and delays)
CREATE TYPE my_schema.attendance_status AS ENUM ('present', 'absent', 'late');
CREATE TABLE my_schema.attendance (
  id SERIAL PRIMARY KEY,
  student_id INT REFERENCES my_schema.users(id) ON DELETE CASCADE,
  subject_id INT REFERENCES my_schema.subjects(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  status my_schema.attendance_status NOT NULL,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Report cards (generated per student per term/year)
CREATE TABLE my_schema.report_cards (
  id SERIAL PRIMARY KEY,
  student_id INT REFERENCES my_schema.users(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  school_year TEXT NOT NULL,
  data JSONB NOT NULL,  -- stores grades, averages, rankings, remarks
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert fixed classes
INSERT INTO my_schema.classes (name) VALUES
  ('1M1'),('1M2'),('1M3'),
  ('2M1'),('2M2'),('2M3'),
  ('3M1'),('3M2'),('3M3'),
  ('4M1'),('4M2'),('4M3');

-- Insert fixed subjects
INSERT INTO my_schema.subjects (name) VALUES
  ('Mathematiques'),('Francais'),('Histoire Geographie'),
  ('Sciences'),('Anglais'),('Arabe'),('Civile'),('Islamique');
