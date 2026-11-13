-- ==============================================================================
-- Graahak AI Database Initialization Schema (Phase 2)
-- Safe & Idempotent: Never drops existing databases or tables
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `graahak_ai`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `graahak_ai`;

-- ------------------------------------------------------------------------------
-- 1. Cases Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cases` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `issue_category` VARCHAR(100) NOT NULL DEFAULT 'GENERAL',
  `merchant_name` VARCHAR(255) NULL,
  `claimed_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `user_narrative` TEXT NOT NULL,
  `status` ENUM('PENDING', 'ANALYZING', 'ANALYZED', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'PENDING',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_cases_status` (`status`),
  INDEX `idx_cases_issue_category` (`issue_category`),
  INDEX `idx_cases_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Case Documents Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `case_documents` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `case_id` BIGINT NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `stored_filename` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100) NULL,
  `file_size` BIGINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_case_documents_case_id` (`case_id`),
  CONSTRAINT `fk_case_documents_case_id`
    FOREIGN KEY (`case_id`) REFERENCES `cases` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. Evidence Evaluations Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `evidence_evaluations` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `case_id` BIGINT NOT NULL,
  `strength_score` INT NOT NULL DEFAULT 0,
  `strength_level` VARCHAR(50) NOT NULL DEFAULT 'WEAK',
  `verified_proofs` JSON NULL,
  `missing_proofs` JSON NULL,
  `recommendations` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_evidence_evaluations_case_id` (`case_id`),
  CONSTRAINT `fk_evidence_evaluations_case_id`
    FOREIGN KEY (`case_id`) REFERENCES `cases` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. Case Timeline Events Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `case_timeline_events` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `case_id` BIGINT NOT NULL,
  `event_date` DATETIME NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `source_type` VARCHAR(50) NOT NULL DEFAULT 'USER_INPUT',
  `document_id` BIGINT NULL,
  `order_index` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_case_timeline_case_id` (`case_id`),
  INDEX `idx_case_timeline_event_date` (`event_date`),
  INDEX `idx_case_timeline_document_id` (`document_id`),
  CONSTRAINT `fk_case_timeline_case_id`
    FOREIGN KEY (`case_id`) REFERENCES `cases` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_case_timeline_document_id`
    FOREIGN KEY (`document_id`) REFERENCES `case_documents` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
