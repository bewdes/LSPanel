import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  AlertTriangle,
  Copy,
  Download,
  ExternalLink,
  Link,
  Mail,
  Monitor,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { pickLanguage, type Dictionary } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { serviceHostname } from "@/lib/format"
import type { Environment } from "@/types"

type MailSummary = {
  id: string
  environmentId: string
  environmentName: string
  from: string
  to: string
  recipients: string[]
  subject: string
  created: string
  size: number
  attachmentCount: number
}
type MailDetail = MailSummary & {
  html: string
  text: string
  headers: string
  attachments: { name: string; partId: string; size: number }[]
  remoteChecks: {
    html: unknown
    htmlError: string
    spam: unknown
    spamError: string
  }
}
type MailText = Dictionary["mail"]

export function MailPage({
  environments,
  language,
}: {
  environments: Environment[]
  language: string
}) {
  const text = pickLanguage(language).mail
  const available = React.useMemo(
    () => environments.filter((environment) => environment.extraServices?.includes("mailpit")),
    [environments],
  )
  const [messages, setMessages] = React.useState<MailSummary[]>([])
  const [selected, setSelected] = React.useState<MailDetail | null>(null)
  const [mailbox, setMailbox] = React.useState("__all__")
  const [search, setSearch] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const checksCacheRef = React.useRef(new Map<string, unknown>())

  const refresh = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!available.length) return
      const silent = options?.silent ?? false
      if (!silent) {
        setBusy(true)
        setError("")
        setNotice("")
      }
      try {
        const responses = await Promise.allSettled(
          available.map(async (environment) => {
            const response = await invoke<unknown>("list_mailpit_messages", {
              environmentId: environment.id,
            })
            return normalizeList(response, environment.id, environment.name)
          }),
        )
        setMessages(
          responses.flatMap((response) => (response.status === "fulfilled" ? response.value : [])),
        )
        if (!silent) {
          const failures = responses.filter(
            (response): response is PromiseRejectedResult => response.status === "rejected",
          )
          if (failures.length)
            setError(failures.map((failure) => String(failure.reason)).join("\n"))
        }
      } finally {
        if (!silent) setBusy(false)
      }
    },
    [available],
  )

  React.useEffect(() => {
    setSelected(null)
    checksCacheRef.current.clear()
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!available.length) return
    const timer = window.setInterval(() => void refresh({ silent: true }), 10000)
    return () => window.clearInterval(timer)
  }, [refresh, available.length])

  const mailboxes = React.useMemo(
    () =>
      [...new Set(messages.flatMap((message) => message.recipients))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [messages],
  )
  React.useEffect(() => {
    if (mailbox !== "__all__" && !mailboxes.includes(mailbox)) setMailbox("__all__")
  }, [mailbox, mailboxes])

  const openMessage = async (message: MailSummary) => {
    setBusy(true)
    setError("")
    try {
      const cacheKey = `${message.environmentId}:${message.id}`
      const cachedChecks = checksCacheRef.current.get(cacheKey)
      const [response, checks] = await Promise.all([
        invoke<unknown>("read_mailpit_message", {
          environmentId: message.environmentId,
          messageId: message.id,
        }),
        cachedChecks !== undefined
          ? Promise.resolve(cachedChecks)
          : invoke<unknown>("check_mailpit_message", {
              environmentId: message.environmentId,
              messageId: message.id,
            }),
      ])
      // SpamAssassin's sa-check is slow and its result is deterministic for
      // a given message's content, so it's only worth running once per
      // message rather than on every reopen.
      if (cachedChecks === undefined) checksCacheRef.current.set(cacheKey, checks)
      setSelected(normalizeDetail(response, checks, message))
    } catch (value) {
      setError(String(value))
    } finally {
      setBusy(false)
    }
  }
  const deleteMessage = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await invoke("delete_mailpit_message", {
        environmentId: selected.environmentId,
        messageId: selected.id,
      })
      checksCacheRef.current.delete(`${selected.environmentId}:${selected.id}`)
      setSelected(null)
      await refresh()
    } catch (value) {
      setError(String(value))
    } finally {
      setBusy(false)
    }
  }
  const releaseMessage = async () => {
    if (!selected) return
    if (!window.confirm(text.sendConfirm(selected.to))) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await invoke("release_mailpit_message", {
        environmentId: selected.environmentId,
        messageId: selected.id,
        recipients: selected.recipients,
      })
      setNotice(text.messageSentNotice)
    } catch (value) {
      setError(String(value))
    } finally {
      setBusy(false)
    }
  }
  const query = search.toLowerCase()
  const visible = messages.filter(
    (message) =>
      (mailbox === "__all__" || message.recipients.includes(mailbox)) &&
      [message.subject, message.from, message.to].some((value) =>
        value.toLowerCase().includes(query),
      ),
  )
  const mailboxEnvironment =
    available.find(
      (item) =>
        item.id ===
        (selected?.environmentId ??
          messages.find((message) => message.recipients.includes(mailbox))?.environmentId),
    ) ?? available[0]

  return (
    <div>
      <PageHeading
        title={text.mail}
        description={text.mailDescription}
        action={
          <div className="flex gap-2">
            {mailboxEnvironment && (
              <Button
                variant="outline"
                onClick={() =>
                  invoke("open_url", {
                    url: `https://${serviceHostname("mailpit", mailboxEnvironment.name)}`,
                  })
                }
              >
                <ExternalLink /> Mailpit
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy || !available.length}
              onClick={() => void refresh()}
            >
              <RefreshCw className={busy ? "animate-spin" : ""} /> {text.refresh}
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 px-4 pb-6 lg:px-6">
        {available.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Select
                value={mailbox}
                onValueChange={(value) => {
                  if (!value) return
                  setMailbox(value)
                  setSelected(null)
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={text.selectMailbox} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{text.allMailboxes}</SelectItem>
                  {mailboxes.map((address) => (
                    <SelectItem key={address} value={address}>
                      {address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative min-w-56 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={text.searchPlaceholder}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {notice && (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            <div className="grid min-h-0 items-start gap-4 xl:grid-cols-[minmax(300px,0.75fr)_minmax(440px,1.25fr)]">
              <Card className="flex h-[clamp(28rem,calc(100dvh-16rem),56rem)] min-h-0 flex-col overflow-hidden xl:sticky xl:top-4 xl:h-[calc(100dvh-15.5rem)]">
                <CardHeader className="shrink-0">
                  <CardTitle className="flex items-center justify-between text-base">
                    {text.inbox} <Badge variant="secondary">{visible.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 overscroll-contain">
                  {visible.map((message) => (
                    <button
                      key={`${message.environmentId}:${message.id}`}
                      data-environment={message.environmentName}
                      className={`grid w-full gap-1 border-b px-4 py-3 text-left last:border-0 hover:bg-muted ${
                        selected?.id === message.id ? "bg-muted" : ""
                      }`}
                      onClick={() => void openMessage(message)}
                    >
                      <div className="flex gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {message.subject}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatSize(message.size)}
                        </span>
                      </div>
                      <span className="truncate text-sm text-muted-foreground">{message.from}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {message.created} · to {message.to}
                      </span>
                    </button>
                  ))}
                  {!visible.length && (
                    <p className="p-10 text-center text-sm text-muted-foreground">
                      {text.inboxEmpty}
                    </p>
                  )}
                </CardContent>
              </Card>
              <MessagePreview
                message={selected}
                busy={busy}
                text={text}
                onDelete={deleteMessage}
                onRelease={releaseMessage}
              />
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="grid min-h-64 place-items-center text-center">
              <div>
                <Mail className="mx-auto mb-3 size-9 text-muted-foreground" />
                <p className="font-medium">{text.mailpitNotEnabled}</p>
                <p className="text-sm text-muted-foreground">{text.enableMailpitHint}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function MessagePreview({
  message,
  busy,
  text,
  onDelete,
  onRelease,
}: {
  message: MailDetail | null
  busy: boolean
  text: MailText
  onDelete: () => Promise<void>
  onRelease: () => Promise<void>
}) {
  const [viewport, setViewport] = React.useState<"desktop" | "tablet" | "mobile">("desktop")
  if (!message)
    return (
      <Card>
        <CardContent className="grid min-h-[580px] place-items-center text-sm text-muted-foreground">
          {text.selectMessageToPreview}
        </CardContent>
      </Card>
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-3 text-base">
          <span>{message.subject}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void onRelease()}>
              <Send /> {text.resend}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void onDelete()}>
              <Trash2 /> {text.delete}
            </Button>
          </div>
        </CardTitle>
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {text.fromLabel}
            {message.from}
            <CopyButton value={message.from} label={text.copySender} />
          </span>
          <span className="flex items-center gap-1">
            {text.toLabel}
            {message.to}
            <CopyButton value={message.to} label={text.copyRecipients} />
          </span>
          <span>{message.created}</span>
          {message.attachments.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <Button
                  key={attachment.partId || attachment.name}
                  variant="outline"
                  size="sm"
                  disabled={!attachment.partId}
                  title={text.openAttachment(attachment.name)}
                  onClick={() =>
                    invoke("open_url", {
                      url: `https://${serviceHostname(
                        "mailpit",
                        message.environmentName,
                      )}/api/v1/message/${encodeURIComponent(
                        message.id,
                      )}/part/${encodeURIComponent(attachment.partId)}`,
                    })
                  }
                >
                  <Download />
                  {attachment.name || text.attachmentFallback}
                  {attachment.size > 0 && ` · ${formatSize(attachment.size)}`}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={message.html ? "html" : "text"}>
          <TabsList>
            <TabsTrigger value="html" disabled={!message.html}>
              HTML
            </TabsTrigger>
            <TabsTrigger value="text" disabled={!message.text}>
              {text.plainText}
            </TabsTrigger>
            <TabsTrigger value="headers">{text.headersTab}</TabsTrigger>
            <TabsTrigger value="checks">{text.checksTab}</TabsTrigger>
          </TabsList>
          <TabsContent value="html" className="pt-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-md border p-1">
                {(
                  [
                    ["desktop", Monitor, text.desktop],
                    ["tablet", Tablet, text.tablet],
                    ["mobile", Smartphone, text.mobile],
                  ] as const
                ).map(([value, Icon, label]) => (
                  <Button
                    key={value}
                    variant={viewport === value ? "secondary" : "ghost"}
                    size="sm"
                    aria-label={label}
                    onClick={() => setViewport(value)}
                  >
                    <Icon /> {label}
                  </Button>
                ))}
              </div>
              <CopyButton
                value={extractLinks(message.html).join("\n")}
                label={text.copyLinks}
                text
              />
            </div>
            <div className="overflow-auto rounded-lg border bg-muted/40 p-3">
              <iframe
                title={text.emailHtmlPreviewTitle}
                sandbox=""
                srcDoc={message.html}
                style={{ width: viewportWidth(viewport) }}
                className="mx-auto h-[480px] max-w-full rounded-md border bg-white transition-[width]"
              />
            </div>
          </TabsContent>
          <TabsContent value="text" className="pt-3">
            <Textarea readOnly className="min-h-[480px] font-mono text-xs" value={message.text} />
          </TabsContent>
          <TabsContent value="headers" className="pt-3">
            <Textarea
              readOnly
              className="min-h-[480px] font-mono text-xs"
              value={message.headers}
            />
          </TabsContent>
          <TabsContent value="checks" className="pt-3">
            <MessageChecks message={message} text={text} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function CopyButton({
  value,
  label,
  text = false,
}: {
  value: string
  label: string
  text?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={text ? "" : "size-6 p-0"}
      disabled={!value}
      aria-label={label}
      title={label}
      onClick={() => void navigator.clipboard.writeText(value)}
    >
      {text ? <Link /> : <Copy />}
      {text && label}
    </Button>
  )
}

function MessageChecks({ message, text }: { message: MailDetail; text: MailText }) {
  const checks = analyzeMessage(message, text)
  const warnings = checks.filter((check) => check.warning)
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 rounded-lg border p-3">
        {warnings.length ? (
          <AlertTriangle className="text-amber-500" />
        ) : (
          <ShieldCheck className="text-emerald-500" />
        )}
        <div>
          <p className="font-medium">
            {warnings.length ? text.potentialIssues(warnings.length) : text.basicChecksPassed}
          </p>
          <p className="text-xs text-muted-foreground">{text.localStructuralCheckHint}</p>
        </div>
      </div>
      {checks.map((check) => (
        <div key={check.label} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          {check.warning ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          ) : (
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          )}
          <div>
            <p className="font-medium">{check.label}</p>
            <p className="text-muted-foreground">{check.detail}</p>
          </div>
        </div>
      ))}
      <RemoteCheck
        title={text.mailClientCompatibility}
        result={message.remoteChecks.html}
        error={message.remoteChecks.htmlError}
        text={text}
      />
      <RemoteCheck
        title="SpamAssassin"
        result={message.remoteChecks.spam}
        error={message.remoteChecks.spamError}
        text={text}
        spam
      />
    </div>
  )
}

function RemoteCheck({
  title,
  result,
  error,
  text,
  spam = false,
}: {
  title: string
  result: unknown
  error: string
  text: MailText
  spam?: boolean
}) {
  const available = result !== null && result !== undefined
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2">
        {available ? (
          <ShieldCheck className="size-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="size-4 text-muted-foreground" />
        )}
        <p className="font-medium">{title}</p>
        <Badge variant={available ? "secondary" : "outline"}>
          {available ? text.available : text.unavailable}
        </Badge>
      </div>
      {available ? (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : (
        <p className="mt-2 text-muted-foreground">{friendlyCheckError(error, spam, text)}</p>
      )}
    </div>
  )
}

function friendlyCheckError(error: string, spam: boolean, text: MailText) {
  if (!error) return spam ? text.enableSpamAssassinHint : text.checkUnavailableForMessage
  if (spam && /400|not enabled|unavailable/i.test(error)) return text.spamAssassinNotConfigured
  return error
}

function analyzeMessage(message: MailDetail, text: MailText) {
  const links = extractLinks(message.html)
  const missingAlt = (message.html.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) ?? []).length
  const headers = message.headers.toLowerCase()
  const insecureLinks = links.some((link) => link.startsWith("http://"))
  return [
    {
      label: text.subjectLabel,
      warning: !message.subject || message.subject === "(no subject)",
      detail:
        !message.subject || message.subject === "(no subject)"
          ? text.addClearSubject
          : text.subjectPresent,
    },
    {
      label: text.plainTextAlternative,
      warning: Boolean(message.html && !message.text),
      detail: message.text ? text.plainTextAvailable : text.plainTextMissing,
    },
    {
      label: text.imageAccessibility,
      warning: missingAlt > 0,
      detail: missingAlt ? text.missingAltText(missingAlt) : text.noMissingAltText,
    },
    {
      label: text.linksLabel,
      warning: insecureLinks,
      detail: text.linksFound(links.length, insecureLinks),
    },
    {
      label: text.unsubscribeHeader,
      warning: !headers.includes("list-unsubscribe"),
      detail: headers.includes("list-unsubscribe")
        ? text.listUnsubscribePresent
        : text.listUnsubscribeMissing,
    },
  ]
}

function extractLinks(html: string) {
  if (!html) return []
  const document = new DOMParser().parseFromString(html, "text/html")
  return [
    ...new Set(
      [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .map((anchor) => anchor.getAttribute("href") ?? "")
        .filter((href) => /^https?:\/\//i.test(href)),
    ),
  ]
}

function viewportWidth(viewport: "desktop" | "tablet" | "mobile") {
  if (viewport === "mobile") return 375
  if (viewport === "tablet") return 768
  return "100%"
}

function normalizeList(
  value: unknown,
  environmentId: string,
  environmentName: string,
): MailSummary[] {
  const root = object(value)
  const messages = Array.isArray(root.messages) ? root.messages : Array.isArray(value) ? value : []
  return messages
    .map((item) => normalizeSummary(object(item), environmentId, environmentName))
    .filter((item) => item.id)
}

function normalizeSummary(
  value: Record<string, unknown>,
  environmentId: string,
  environmentName: string,
): MailSummary {
  const from = object(value.From ?? value.from)
  const recipients = Array.isArray(value.To ?? value.to)
    ? ((value.To ?? value.to) as unknown[])
    : []
  const recipientAddresses = recipients
    .map((item) => string(object(item).Address ?? object(item).address))
    .filter(Boolean)
  return {
    id: string(value.ID ?? value.id),
    environmentId,
    environmentName,
    from: string(from.Address ?? from.address ?? from.Name ?? from.name),
    to: recipientAddresses.join(", "),
    recipients: recipientAddresses,
    subject: string(value.Subject ?? value.subject) || "(no subject)",
    created: string(value.Created ?? value.created),
    size: number(value.Size ?? value.size),
    attachmentCount: number(value.Attachments ?? value.attachments),
  }
}

function normalizeDetail(value: unknown, checks: unknown, summary: MailSummary): MailDetail {
  const data = object(value)
  const remote = object(checks)
  const attachments = Array.isArray(data.Attachments ?? data.attachments)
    ? ((data.Attachments ?? data.attachments) as unknown[])
    : []
  const headers = data.Headers ?? data.headers
  return {
    ...summary,
    html: string(data.HTML ?? data.html),
    text: string(data.Text ?? data.text),
    headers: typeof headers === "string" ? headers : JSON.stringify(headers ?? {}, null, 2),
    attachments: attachments.map((item) => {
      const attachment = object(item)
      return {
        name: string(attachment.FileName ?? attachment.filename ?? attachment.Name),
        partId: string(attachment.PartID ?? attachment.partId ?? attachment.partID),
        size: number(attachment.Size ?? attachment.size),
      }
    }),
    remoteChecks: {
      html: remote.html,
      htmlError: string(remote.htmlError),
      spam: remote.spam,
      spamError: string(remote.spamError),
    },
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}
function string(value: unknown) {
  return typeof value === "string" ? value : ""
}
function number(value: unknown) {
  return typeof value === "number" ? value : 0
}
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
