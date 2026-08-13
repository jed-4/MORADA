#!/bin/bash
set -e
npm install

# NO db:push. Schema changes are applied by hand in the Replit Shell, as
# numbered files in migrations/, against a database verified by data content.
# This hook fires on any Replit git pull/merge, so a db:push here would let
# drizzle-kit diff the live database unattended — and drizzle-kit resolves a
# column it cannot account for by proposing DROP COLUMN. Hand-applied columns
# are exactly that kind of column.
