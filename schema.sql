-- ============================================================================
-- Nova Schola Tanauan DRTS — Path A schema
-- Stores the SAME JSON blob the app has always used (people, requests,
-- adminAr, adminProfiles, adminEmailOverrides, notifyLog, pushSubs, etc.)
-- as one row, instead of a flat file on disk. Nothing about the blob's
-- internal shape changes — the frontend's getDB()/saveDB() and DEPT_DOCS/
-- FEES/ADMIN_ACCOUNTS constants are untouched.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS nst_drts
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nst_drts;

CREATE TABLE IF NOT EXISTS app_state (
    id          TINYINT UNSIGNED PRIMARY KEY,   -- always 1: this app has exactly one shared blob
    version     INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    data        JSON NULL
) ENGINE=InnoDB;

-- Seed the single row. `data` starts NULL — the server treats that the same
-- way the old empty flat-file did (first browser to sync seeds it).
INSERT IGNORE INTO app_state (id, version, data) VALUES (1, 0, NULL);
