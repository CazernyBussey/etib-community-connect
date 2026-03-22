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
  listen_summary TEXT,
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
  is_featured INTEGER NOT NULL DEFAULT 0,
  featured_rank INTEGER,
  moderated_by_user_id INTEGER,
  moderated_at TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(moderated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  reporter_email TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT,
  rating INTEGER NOT NULL,
  review_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  moderated_by_user_id INTEGER,

  FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY(moderated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (rating >= 1 AND rating <= 5)
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_city_state ON listings(city, state);
CREATE INDEX IF NOT EXISTS idx_listings_listing_type ON listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_listings_featured_rank ON listings(is_featured, featured_rank);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_featured_rank
ON listings(featured_rank)
WHERE is_featured = 1 AND featured_rank IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_listing_status ON reviews(listing_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
