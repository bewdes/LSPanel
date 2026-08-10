export function projectQuickCommands(projectType?: string) {
  if (projectType === "node" || projectType === "react")
    return ["npm install", "npm run build", "npm start"]
  if (projectType === "laravel")
    return [
      "composer install",
      "php artisan migrate",
      "php artisan cache:clear",
      "php artisan config:clear",
      "php artisan queue:work --once",
    ]
  if (projectType === "symfony")
    return [
      "composer install",
      "php bin/console cache:clear",
      "php bin/console doctrine:migrations:migrate --no-interaction",
    ]
  if (projectType === "wordpress") return ["php -v", "composer install", "php -m"]
  return ["php -v", "php -m", "composer install"]
}

export function splitCommandLine(value: string) {
  const result: string[] = []
  let current = ""
  let quote = ""
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote) quote = ""
      else if (character === "\\" && index + 1 < value.length) current += value[++index]
      else current += character
    } else if (character === '"' || character === "'") quote = character
    else if (/\s/.test(character)) {
      if (current) {
        result.push(current)
        current = ""
      }
    } else current += character
  }
  if (quote) throw new Error("Command contains an unclosed quote")
  if (current) result.push(current)
  if (!result.length) throw new Error("Enter a command")
  return result
}

export function isDirtyCheckoutConflict(error: string) {
  return /would be overwritten by checkout|please commit your changes or stash them|please move or remove them before you switch branches/i.test(
    error,
  )
}
