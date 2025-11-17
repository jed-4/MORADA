-- Fix Production: Grant all permissions to General admin role
-- Run this in your PRODUCTION database after deploying the new code

-- Step 1: Find your General admin role ID
-- (This will show you the roleId to use in Step 2)
SELECT id, name, company_id 
FROM user_roles 
WHERE name = 'General admin' 
AND company_id = (
  SELECT company_id FROM users WHERE email = 'jed@lighthouseprojects.com.au' LIMIT 1
);

-- Step 2: Grant all permissions to General admin role
-- Replace YOUR_ROLE_ID_HERE with the ID from Step 1
WITH general_admin_role AS (
  SELECT id FROM user_roles 
  WHERE name = 'General admin' 
  AND company_id = (
    SELECT company_id FROM users WHERE email = 'jed@lighthouseprojects.com.au' LIMIT 1
  )
  LIMIT 1
),
all_permissions AS (
  SELECT id, actions FROM permissions WHERE is_built_in = true
)
INSERT INTO role_permissions (role_id, permission_id, allowed_actions)
SELECT 
  (SELECT id FROM general_admin_role),
  ap.id,
  ap.actions
FROM all_permissions ap
WHERE NOT EXISTS (
  -- Don't insert duplicates
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = (SELECT id FROM general_admin_role)
  AND rp.permission_id = ap.id
);

-- Step 3: Verify the fix
SELECT COUNT(*) as granted_permissions
FROM role_permissions
WHERE role_id = (
  SELECT id FROM user_roles 
  WHERE name = 'General admin' 
  AND company_id = (
    SELECT company_id FROM users WHERE email = 'jed@lighthouseprojects.com.au' LIMIT 1
  )
  LIMIT 1
);
-- Should return 26 (or 25 depending on your permission count)
