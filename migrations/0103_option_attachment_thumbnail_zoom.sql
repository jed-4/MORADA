-- Selection image crop: zoom alongside the existing focal point.
-- Percent of "cover": 100 = today's behaviour (short side fills the square),
-- below 100 fits more of the image in, above 100 crops tighter.
-- Additive and idempotent; also self-healed at boot by ensureFocalPointColumns.
ALTER TABLE option_attachments ADD COLUMN IF NOT EXISTS thumbnail_zoom integer NOT NULL DEFAULT 100;
