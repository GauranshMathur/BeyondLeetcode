# SQLite through Prisma 7 with the libSQL driver adapter, on Bun

An Instance stores its data in one SQLite file on a volume: self-hosters get no database server to run or back up. We access it through Prisma 7 for its schema migrations, which self-hosted upgrades depend on. Prisma 7 has no Rust engine and requires a driver adapter, and Bun cannot load `better-sqlite3`'s native driver, so we use `@prisma/adapter-libsql`. Anyone "simplifying" to `better-sqlite3` or `bun:sqlite` will break either Bun or Prisma.
