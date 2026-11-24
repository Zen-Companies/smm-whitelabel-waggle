-- Staff → Customers (board "Staff → Customers: trace every business", approved 24 Nov). Two new
-- staff permissions on the existing model. Additive only.
--   customers.view  See every business, where it stopped and why (Admin, Developer, Support).
--   customers.act   Act on a customer: send the confirm email again (Admin, Support).
-- Viewer gets neither. Every staff view and action writes audit_log (staff.customer.*).

insert into public.staff_role_permissions (role, permission) values
  ('admin', 'customers.view'), ('developer', 'customers.view'), ('support', 'customers.view'),
  ('admin', 'customers.act'), ('support', 'customers.act')
on conflict do nothing;
