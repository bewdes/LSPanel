export const WEB_SERVER_VERSIONS: Record<string, string[]> = {
  Nginx: ["1.28", "1.27", "1.26", "1.25"],
}

export const PHP_VERSIONS = ["8.5", "8.4", "8.3", "8.2", "8.1"] as const

export const DATABASE_VERSIONS: Record<string, string[]> = {
  MariaDB: ["11.8", "11.4", "10.11"],
  MySQL: ["8.4", "8.0"],
  PostgreSQL: ["17", "16", "15", "14"],
}

export const PHP_EXTENSIONS = [
  "bcmath",
  "curl",
  "exif",
  "gd",
  "imagick",
  "intl",
  "mbstring",
  "mysqli",
  "opcache",
  "pdo_mysql",
  "pdo_pgsql",
  "redis",
  "sockets",
  "xdebug",
  "zip",
] as const

export function defaultDatabaseVersion(database: string): string {
  return DATABASE_VERSIONS[database]?.[0] ?? DATABASE_VERSIONS.PostgreSQL[0]
}
