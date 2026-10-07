-- ============================================
-- Fix: duplicated categories.
--
-- initializeCategories() on the client fetches the user's existing
-- categories, computes which of the 4 hardcoded defaults are missing by
-- name, then inserts those. That check-then-insert is not atomic: if it
-- runs twice concurrently for the same user (e.g. the app open in two
-- tabs, or a fast reload racing the auth callback) both calls can see
-- "no category named X yet" and both insert it, leaving permanent
-- duplicate rows since there was no DB constraint stopping it.
--
-- 1) Merge existing duplicates per (user_id, name): keep the oldest row,
--    re-point any expenses referencing a duplicate to the survivor.
-- 2) Add a unique index so this can't happen again. The client now
--    upserts against it instead of relying on a client-side check.
-- ============================================

WITH ranked AS (
    SELECT
        id,
        user_id,
        name,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, name
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM categories
),
survivors AS (
    SELECT user_id, name, id AS survivor_id
    FROM ranked
    WHERE rn = 1
),
duplicates AS (
    SELECT r.id AS duplicate_id, s.survivor_id
    FROM ranked r
    JOIN survivors s ON s.user_id = r.user_id AND s.name = r.name
    WHERE r.rn > 1
)
UPDATE expenses e
SET category_id = d.survivor_id
FROM duplicates d
WHERE e.category_id = d.duplicate_id;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, name
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM categories
)
DELETE FROM categories
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_id_name_unique
ON categories(user_id, name);
