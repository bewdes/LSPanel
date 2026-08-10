import * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { pickLanguage } from "@/i18n"

export function ServicesStep({
  services,
  setServices,
  database,
  language,
}: {
  services: string[]
  setServices: React.Dispatch<React.SetStateAction<string[]>>
  database: string
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.additionalServices}</CardTitle>
        <CardDescription>{text.additionalServicesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        {["redis", "mailpit", "adminer", "phpmyadmin"].map((service) => (
          <label key={service} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={services.includes(service)}
              disabled={service === "phpmyadmin" && database === "PostgreSQL"}
              onCheckedChange={() =>
                setServices((current) =>
                  current.includes(service)
                    ? current.filter((item) => item !== service)
                    : [...current, service],
                )
              }
            />
            {service}
          </label>
        ))}
      </CardContent>
    </Card>
  )
}
