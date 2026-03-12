PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  business_name TEXT NOT NULL,
  owner_contact_name TEXT NOT NULL,
  business_email TEXT NOT NULL,
  phone TEXT NOT NULL,
  text_number TEXT,
  website_url TEXT,

  listing_type TEXT NOT NULL,
  category TEXT NOT NULL,
  short_summary TEXT NOT NULL,
  full_description TEXT NOT NULL,
  supports_bvi TEXT NOT NULL,
  accessibility_details TEXT NOT NULL,

  primary_contact_method TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  service_area_type TEXT NOT NULL,
  hours TEXT NOT NULL,
  languages TEXT,

  remote_details TEXT,
  inperson_notes TEXT,
  social_links TEXT,
  certifications TEXT,
  testimonial TEXT,

  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  reporter_email TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_city_state ON listings(city, state);
CREATE INDEX IF NOT EXISTS idx_listings_listing_type ON listings(listing_type);
