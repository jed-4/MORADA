-- Product Library images get the same thumbnail crop as selection images
-- (focal point + zoom), so a crop set in the library travels into a selection
-- and back. Additive and idempotent; also self-healed at boot.
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS thumbnail_x integer NOT NULL DEFAULT 50;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS thumbnail_y integer NOT NULL DEFAULT 50;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS thumbnail_zoom integer NOT NULL DEFAULT 100;
