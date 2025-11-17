-- FIX PRODUCTION ACCOUNT
-- Run this in your PRODUCTION database to fix jed@lighthouseprojects.com.au account
-- This creates 6 roles, grants all permissions to General Manager, and assigns you to that role

-- Step 1: Get your company ID and user ID
DO $$
DECLARE
  v_company_id VARCHAR;
  v_user_id VARCHAR;
  v_general_manager_role_id VARCHAR;
BEGIN
  -- Get your user and company
  SELECT id, company_id INTO v_user_id, v_company_id
  FROM users 
  WHERE email = 'jed@lighthouseprojects.com.au' 
  LIMIT 1;

  -- Create the 6 roles
  INSERT INTO user_roles (company_id, name, description, user_category, is_built_in, is_active, display_order)
  VALUES 
    (v_company_id, 'General Manager', 'Full system administration access', 'team', true, true, 0),
    (v_company_id, 'Office Manager', 'Office operations management', 'team', true, true, 1),
    (v_company_id, 'Construction Manager', 'Construction oversight and management', 'team', true, true, 2),
    (v_company_id, 'Foreman', 'Site-based team lead', 'team', true, true, 3),
    (v_company_id, 'Carpenter', 'Carpentry specialist', 'team', true, true, 4),
    (v_company_id, 'Apprentice', 'Learning team member', 'team', true, true, 5)
  ON CONFLICT DO NOTHING;

  -- Get General Manager role ID
  SELECT id INTO v_general_manager_role_id
  FROM user_roles
  WHERE company_id = v_company_id AND name = 'General Manager'
  LIMIT 1;

  -- Grant ALL permissions to General Manager role
  INSERT INTO role_permissions (role_id, permission_id, allowed_actions)
  SELECT 
    v_general_manager_role_id,
    p.id,
    p.actions
  FROM permissions p
  WHERE p.is_built_in = true
  ON CONFLICT DO NOTHING;

  -- Assign you to General Manager role
  UPDATE users
  SET role_id = v_general_manager_role_id
  WHERE id = v_user_id;

  -- Show results
  RAISE NOTICE 'Company ID: %', v_company_id;
  RAISE NOTICE 'User ID: %', v_user_id;
  RAISE NOTICE 'General Manager Role ID: %', v_general_manager_role_id;
END $$;

-- Verify the fix
SELECT 
  'Roles created' as check_type,
  COUNT(*) as count
FROM user_roles
WHERE company_id = (SELECT company_id FROM users WHERE email = 'jed@lighthouseprojects.com.au' LIMIT 1)
UNION ALL
SELECT 
  'Permissions granted to General Manager',
  COUNT(*)
FROM role_permissions
WHERE role_id = (
  SELECT id FROM user_roles 
  WHERE name = 'General Manager' 
  AND company_id = (SELECT company_id FROM users WHERE email = 'jed@lighthouseprojects.com.au' LIMIT 1)
  LIMIT 1
)
UNION ALL
SELECT 
  'User assigned to role',
  COUNT(*)
FROM users
WHERE email = 'jed@lighthouseprojects.com.au'
AND role_id IS NOT NULL;
