import { invoke } from "@tauri-apps/api/core"
import { Check, Copy, Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { pickLanguage } from "@/i18n"

import { Field, Hint } from "../form-fields"

export function WordpressAdminPanel({
  wordpressSiteTitle,
  setWordpressSiteTitle,
  wordpressAdminUser,
  setWordpressAdminUser,
  wordpressAdminEmail,
  setWordpressAdminEmail,
  wordpressAdminPassword,
  setWordpressAdminPassword,
  showWordpressAdminPassword,
  setShowWordpressAdminPassword,
  wordpressPasswordCopied,
  setWordpressPasswordCopied,
  language,
}: {
  wordpressSiteTitle: string
  setWordpressSiteTitle: (value: string) => void
  wordpressAdminUser: string
  setWordpressAdminUser: (value: string) => void
  wordpressAdminEmail: string
  setWordpressAdminEmail: (value: string) => void
  wordpressAdminPassword: string
  setWordpressAdminPassword: (value: string) => void
  showWordpressAdminPassword: boolean
  setShowWordpressAdminPassword: (value: boolean) => void
  wordpressPasswordCopied: boolean
  setWordpressPasswordCopied: (value: boolean) => void
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.wordpressAdmin}</CardTitle>
        <CardDescription>{text.wordpressAdminDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={text.siteTitleLabel}>
          <Input
            value={wordpressSiteTitle}
            onChange={(event) => setWordpressSiteTitle(event.target.value)}
          />
        </Field>
        <Field label={text.adminUsernameLabel}>
          <Input
            value={wordpressAdminUser}
            onChange={(event) => setWordpressAdminUser(event.target.value)}
          />
          <Hint valid={/^[A-Za-z0-9_-]+$/.test(wordpressAdminUser)} text={text.nameHint} />
        </Field>
        <Field label={text.adminEmailLabel}>
          <Input
            type="email"
            value={wordpressAdminEmail}
            onChange={(event) => setWordpressAdminEmail(event.target.value)}
          />
        </Field>
        <Field label={text.adminPasswordLabel}>
          <div className="flex gap-2">
            <Input
              type={showWordpressAdminPassword ? "text" : "password"}
              value={wordpressAdminPassword}
              onChange={(event) => setWordpressAdminPassword(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title={showWordpressAdminPassword ? text.hidePassword : text.showPassword}
              onClick={() => setShowWordpressAdminPassword(!showWordpressAdminPassword)}
            >
              {showWordpressAdminPassword ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title={wordpressPasswordCopied ? text.copied : text.copyPassword}
              disabled={!wordpressAdminPassword}
              onClick={() => {
                void navigator.clipboard.writeText(wordpressAdminPassword).then(() => {
                  setWordpressPasswordCopied(true)
                  window.setTimeout(() => setWordpressPasswordCopied(false), 1500)
                })
              }}
            >
              {wordpressPasswordCopied ? <Check /> : <Copy />}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void invoke<string>("generate_environment_secret", { length: 24 }).then(
                  setWordpressAdminPassword,
                )
              }
            >
              {text.generate}
            </Button>
          </div>
          <Hint valid={wordpressAdminPassword.length >= 8} text={text.passwordHint} />
        </Field>
      </CardContent>
    </Card>
  )
}
