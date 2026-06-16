-- Widen VARCHAR columns on order_items that were overflowing when
-- upload-csv received aggregated rows with many IMEIs/serials joined
-- into a single string.  TEXT has no length limit and is equally
-- efficient for these variable-length identifier fields.

ALTER TABLE order_items
  ALTER COLUMN serial_number TYPE TEXT,
  ALTER COLUMN cpu           TYPE TEXT,
  ALTER COLUMN model_number  TYPE TEXT;

-- imei is kept as TEXT too; although a real IMEI is 15 digits,
-- the column was VARCHAR(20) which still fails when two are joined.
ALTER TABLE order_items
  ALTER COLUMN imei TYPE TEXT;
