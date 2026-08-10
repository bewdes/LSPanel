import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { pickLanguage } from "@/i18n"

import { Hint } from "../form-fields"

export function GitRepoPanel({
  repositoryUrl,
  setRepositoryUrl,
  language,
}: {
  repositoryUrl: string
  setRepositoryUrl: (value: string) => void
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.gitRepository}</CardTitle>
        <CardDescription>{text.gitRepositoryDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Label htmlFor="repository-url">{text.repositoryUrlLabel}</Label>
        <Input
          id="repository-url"
          value={repositoryUrl}
          onChange={(event) => setRepositoryUrl(event.target.value.trim())}
          placeholder="https://github.com/example/project.git"
        />
        <Hint
          valid={!repositoryUrl || /^(https:\/\/|ssh:\/\/|git@)/.test(repositoryUrl)}
          text={text.repositoryUrlHint}
        />
      </CardContent>
    </Card>
  )
}
