-- 0049: stop deleted POs from stranding subcontractor timesheets.
--
-- timesheets.linked_purchase_order_id was a bare varchar with no FK, so
-- deleting a purchase order left the timesheet on po_status='on_po' pointing
-- at a row that no longer existed. That state cannot be cleared from the UI:
-- the approve flow only queues a timesheet when BOTH po_status and
-- linked_purchase_order_id are empty, and the "Remove Awaiting PO" action is
-- only rendered for po_status='awaiting_po'. Re-approving did nothing.
--
-- Step 1 repairs the rows already stranded in production; step 2 stops it
-- happening again, including via the projects -> purchase_orders cascade,
-- which bypasses the application delete handler entirely.
--
-- Paid timesheets are treated as terminal throughout: the app now refuses to
-- delete a paid or partially_paid PO at all, and a paid timesheet is never
-- re-queued — only its dangling pointer is cleared.

-- 1a. Release timesheets whose linked PO has already been deleted, so they go
--     back into the Sub PO queue.
UPDATE timesheets
SET po_status = 'awaiting_po',
    linked_purchase_order_id = NULL,
    updated_at = NOW()
WHERE linked_purchase_order_id IS NOT NULL
  AND po_status IS DISTINCT FROM 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = timesheets.linked_purchase_order_id
  );

-- 1b. Paid timesheets stay paid — settled work must not re-enter the queue
--     where it could be pushed onto a second PO. Only the dead pointer is
--     cleared, which is what the FK in step 2 requires.
UPDATE timesheets
SET linked_purchase_order_id = NULL,
    updated_at = NOW()
WHERE linked_purchase_order_id IS NOT NULL
  AND po_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = timesheets.linked_purchase_order_id
  );

-- 2. Enforce the link from here on. ON DELETE SET NULL clears the pointer even
--    when the PO disappears through the project cascade; the application layer
--    is what resets po_status back to 'awaiting_po', and the Sub PO queue
--    treats 'on_po' with a null link as awaiting_po so nothing is lost if the
--    cascade fires without the route handler running.
ALTER TABLE timesheets
  DROP CONSTRAINT IF EXISTS timesheets_linked_purchase_order_id_purchase_orders_id_fk;

ALTER TABLE timesheets
  ADD CONSTRAINT timesheets_linked_purchase_order_id_purchase_orders_id_fk
  FOREIGN KEY (linked_purchase_order_id)
  REFERENCES purchase_orders(id)
  ON DELETE SET NULL;
