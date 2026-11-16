-- Insurance types: the Contacts insurance section offers Professional
-- Indemnity and Contractors All Risk, but the insurance_type enum only had
-- public_liability | workers_comp | other — so saving either failed
-- validation. Adds the two values.
--
-- Additive and idempotent. 0129 is project files.
-- (ADD VALUE can't be used in the same transaction it's added in; nothing
-- here uses it, so this is safe to run as-is.)

ALTER TYPE insurance_type ADD VALUE IF NOT EXISTS 'professional_indemnity';
ALTER TYPE insurance_type ADD VALUE IF NOT EXISTS 'contractors_all_risk';
