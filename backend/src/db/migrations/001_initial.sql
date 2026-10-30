CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('patient', 'provider', 'admin');
CREATE TYPE institution_status AS ENUM ('pending', 'verified', 'suspended', 'revoked');
CREATE TYPE record_status AS ENUM ('active', 'superseded', 'revoked');
CREATE TYPE consent_status AS ENUM ('pending', 'approved', 'rejected', 'revoked', 'expired');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  email_verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users(lower(email));

CREATE TABLE patient_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  patient_ref bytea NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(patient_ref) = 32)
);

CREATE TABLE healthcare_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  institution_type text NOT NULL,
  registration_reference text NOT NULL UNIQUE,
  status institution_status NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

CREATE TABLE healthcare_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  license_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE institution_staff (
  institution_id uuid NOT NULL REFERENCES healthcare_institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_admin boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, user_id)
);

CREATE TABLE record_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

CREATE TABLE medical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES patient_profiles(user_id),
  institution_id uuid NOT NULL REFERENCES healthcare_institutions(id),
  issued_by uuid NOT NULL REFERENCES healthcare_professionals(id),
  category_id uuid NOT NULL REFERENCES record_categories(id),
  title text NOT NULL,
  content_hash bytea NOT NULL,
  storage_key text NOT NULL UNIQUE,
  chain_record_id numeric(78, 0),
  chain_transaction_hash text,
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, content_hash),
  CHECK (octet_length(content_hash) = 32)
);
CREATE INDEX medical_records_patient_created_idx ON medical_records(patient_user_id, created_at DESC);
CREATE INDEX medical_records_institution_idx ON medical_records(institution_id, created_at DESC);

CREATE TABLE medical_record_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES medical_records(id),
  supersedes_record_id uuid REFERENCES medical_records(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supersedes_record_id)
);

CREATE TABLE consent_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES patient_profiles(user_id),
  provider_user_id uuid NOT NULL REFERENCES users(id),
  institution_id uuid NOT NULL REFERENCES healthcare_institutions(id),
  requested_record_ids uuid[] NOT NULL DEFAULT '{}',
  requested_category_ids uuid[] NOT NULL DEFAULT '{}',
  status consent_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(requested_record_ids) + cardinality(requested_category_ids) > 0)
);
CREATE INDEX consent_requests_patient_idx ON consent_requests(patient_user_id, status, created_at DESC);

CREATE TABLE consent_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES consent_requests(id),
  patient_user_id uuid NOT NULL REFERENCES patient_profiles(user_id),
  provider_user_id uuid NOT NULL REFERENCES users(id),
  record_ids uuid[] NOT NULL DEFAULT '{}',
  category_ids uuid[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE access_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES patient_profiles(user_id),
  actor_user_id uuid REFERENCES users(id),
  record_id uuid REFERENCES medical_records(id),
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_audit_patient_time_idx ON access_audit_logs(patient_user_id, created_at DESC);

CREATE TABLE verification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES medical_records(id),
  institution_id uuid REFERENCES healthcare_institutions(id),
  matched boolean NOT NULL,
  verified_institution boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blockchain_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES medical_records(id),
  transaction_hash text NOT NULL UNIQUE,
  chain_id bigint NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO record_categories(name) VALUES
  ('Laboratory'), ('Imaging'), ('Clinical Note'), ('Prescription'), ('Discharge Summary')
ON CONFLICT DO NOTHING;
