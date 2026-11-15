-- CampusBazaar database schema (MySQL 8.0.16+ — CHECK constraints are enforced).
-- All timestamps are stored in UTC; the API sets the session time zone to +00:00.
-- DFD data store mapping:
--   User_Accounts -> users, user_roles, email_verifications
--   Product_DB    -> listings, listing_images, categories
--   Auction_DB    -> auctions
--   Bid_DB        -> bids

CREATE TABLE IF NOT EXISTS users (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name              VARCHAR(100)    NOT NULL,
  university_email  VARCHAR(254)    NOT NULL,
  password_hash     VARCHAR(255)    NOT NULL,
  email_verified_at DATETIME        NULL,
  account_status    ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (university_email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    BIGINT UNSIGNED NOT NULL,
  role       ENUM('buyer', 'seller', 'admin') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- A verification link is sent to the university email first; the account (users row)
-- is created only when the link's owner completes registration with it. This way only
-- the person who controls the mailbox can choose the account's name and password.
CREATE TABLE IF NOT EXISTS email_verifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email      VARCHAR(254)    NOT NULL,
  token_hash CHAR(64)        NOT NULL,
  expires_at DATETIME        NOT NULL,
  used_at    DATETIME        NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verifications_token (token_hash),
  KEY idx_email_verifications_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS categories (
  id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(60)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS listings (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  seller_id      BIGINT UNSIGNED NOT NULL,
  title          VARCHAR(120)    NOT NULL,
  description    TEXT            NOT NULL,
  category_id    INT UNSIGNED    NOT NULL,
  item_condition ENUM('new', 'like_new', 'good', 'fair', 'poor') NOT NULL,
  price          DECIMAL(10, 2)  NOT NULL,
  status         ENUM('active', 'in_auction', 'sold', 'removed') NOT NULL DEFAULT 'active',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_listings_status_created (status, created_at),
  KEY idx_listings_category_status (category_id, status),
  KEY idx_listings_seller (seller_id),
  FULLTEXT KEY ft_listings_text (title, description),
  CONSTRAINT chk_listings_price CHECK (price > 0),
  CONSTRAINT fk_listings_seller FOREIGN KEY (seller_id) REFERENCES users (id),
  CONSTRAINT fk_listings_category FOREIGN KEY (category_id) REFERENCES categories (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS listing_images (
  id         BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  listing_id BIGINT UNSIGNED   NOT NULL,
  file_path  VARCHAR(255)      NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_listing_images_listing (listing_id, sort_order),
  CONSTRAINT fk_listing_images_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS messages (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id   BIGINT UNSIGNED NOT NULL,
  sender_id    BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  content      VARCHAR(2000)   NOT NULL,
  sent_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at      DATETIME        NULL,
  PRIMARY KEY (id),
  KEY idx_messages_listing_sent (listing_id, sent_at),
  KEY idx_messages_recipient_read (recipient_id, read_at),
  CONSTRAINT fk_messages_listing FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id),
  CONSTRAINT fk_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  reviewer_id BIGINT UNSIGNED  NOT NULL,
  reviewee_id BIGINT UNSIGNED  NOT NULL,
  listing_id  BIGINT UNSIGNED  NULL,
  rating      TINYINT UNSIGNED NOT NULL,
  comment     VARCHAR(1000)    NULL,
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reviews_reviewee (reviewee_id),
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id),
  CONSTRAINT fk_reviews_reviewee FOREIGN KEY (reviewee_id) REFERENCES users (id),
  CONSTRAINT fk_reviews_listing FOREIGN KEY (listing_id) REFERENCES listings (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auctions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id        BIGINT UNSIGNED NOT NULL,
  starting_price    DECIMAL(10, 2)  NOT NULL,
  bid_increment     DECIMAL(10, 2)  NOT NULL,
  start_time        DATETIME        NOT NULL,
  end_time          DATETIME        NOT NULL,
  status            ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  current_bid       DECIMAL(10, 2)  NULL,
  current_bidder_id BIGINT UNSIGNED NULL,
  winner_id         BIGINT UNSIGNED NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_auctions_listing (listing_id),
  KEY idx_auctions_status_end (status, end_time),
  CONSTRAINT chk_auctions_prices CHECK (starting_price > 0 AND bid_increment > 0),
  CONSTRAINT chk_auctions_times CHECK (end_time > start_time),
  CONSTRAINT fk_auctions_listing FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_auctions_current_bidder FOREIGN KEY (current_bidder_id) REFERENCES users (id),
  CONSTRAINT fk_auctions_winner FOREIGN KEY (winner_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bids (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  auction_id BIGINT UNSIGNED NOT NULL,
  bidder_id  BIGINT UNSIGNED NOT NULL,
  amount     DECIMAL(10, 2)  NOT NULL,
  placed_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_bids_auction_amount (auction_id, amount),
  KEY idx_bids_bidder (bidder_id),
  CONSTRAINT chk_bids_amount CHECK (amount > 0),
  CONSTRAINT fk_bids_auction FOREIGN KEY (auction_id) REFERENCES auctions (id),
  CONSTRAINT fk_bids_bidder FOREIGN KEY (bidder_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reports (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id      BIGINT UNSIGNED NOT NULL,
  listing_id       BIGINT UNSIGNED NULL,
  reported_user_id BIGINT UNSIGNED NULL,
  reason           VARCHAR(100)    NOT NULL,
  description      VARCHAR(2000)   NULL,
  status           ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  reviewed_by      BIGINT UNSIGNED NULL,
  reviewed_at      DATETIME        NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reports_status_created (status, created_at),
  CONSTRAINT chk_reports_target CHECK (listing_id IS NOT NULL OR reported_user_id IS NOT NULL),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id),
  CONSTRAINT fk_reports_listing FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_reports_reported_user FOREIGN KEY (reported_user_id) REFERENCES users (id),
  CONSTRAINT fk_reports_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS complaints (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  listing_id  BIGINT UNSIGNED NOT NULL,
  reason      VARCHAR(100)    NOT NULL,
  status      ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  resolved_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME        NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_complaints_status_created (status, created_at),
  CONSTRAINT fk_complaints_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_complaints_listing FOREIGN KEY (listing_id) REFERENCES listings (id),
  CONSTRAINT fk_complaints_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS admin_actions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id    BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(50)     NOT NULL,
  target_type ENUM('user', 'listing', 'report', 'complaint') NOT NULL,
  target_id   BIGINT UNSIGNED NOT NULL,
  note        VARCHAR(500)    NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_actions_target (target_type, target_id),
  CONSTRAINT fk_admin_actions_admin FOREIGN KEY (admin_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  auction_id BIGINT UNSIGNED NULL,
  type       VARCHAR(50)     NOT NULL,
  message    VARCHAR(500)    NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at    DATETIME        NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_user_read (user_id, read_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_notifications_auction FOREIGN KEY (auction_id) REFERENCES auctions (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
