import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Check, Copy, RefreshCw, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pickLanguage } from "@/i18n"
import { certificatesText } from "@/i18n/certificates"

type CertificateStatus = {
  caExists: boolean
  certificateExists: boolean
  systemTrusted: boolean
  browsersTrusted: boolean
  caExpires?: string
  certificateExpires?: string
  caFingerprint?: string
  certificateFingerprint?: string
  domains: string[]
  caPath: string
  certificatePath: string
}

export function CertificatesPage({ uk }: { uk: boolean }) {
  const [status, setStatus] = React.useState<CertificateStatus | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [copied, setCopied] = React.useState("")
  const [deleteTarget, setDeleteTarget] = React.useState<"https" | "ca" | null>(null)
  const text = pickLanguage(certificatesText, uk)

  const refresh = React.useCallback(async () => {
    setError("")
    try {
      setStatus(await invoke<CertificateStatus>("local_certificate_status"))
    } catch (value) {
      setError(String(value))
    }
  }, [])

  React.useEffect(() => void refresh(), [refresh])

  const action = async (command: "install_local_ca" | "reissue_local_https") => {
    setBusy(true)
    setError("")
    try {
      await invoke(command)
      await refresh()
    } catch (value) {
      setError(String(value))
    } finally {
      setBusy(false)
    }
  }

  const copy = (key: string, value?: string) => {
    if (!value) return
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key)
      window.setTimeout(() => setCopied(""), 1500)
    })
  }

  const remove = async () => {
    if (!deleteTarget) return
    setBusy(true)
    setError("")
    try {
      await invoke(deleteTarget === "ca" ? "reset_local_ca" : "delete_local_https")
      setDeleteTarget(null)
      await refresh()
    } catch (value) {
      setError(String(value))
    } finally {
      setBusy(false)
    }
  }

  const trusted = Boolean(status?.systemTrusted && status?.browsersTrusted)
  return (
    <div>
      <PageHeading
        title={text.certificates}
        description={text.certificatesDescription}
        action={
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw />
            {text.refresh}
          </Button>
        }
      />
      {error && (
        <Alert variant="destructive" className="mx-4 mb-4 lg:mx-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid min-w-0 gap-4 px-4 pb-6 xl:grid-cols-2 lg:px-6">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              {trusted ? <ShieldCheck /> : <ShieldAlert />}
              LS Panel Local CA
            </CardTitle>
            <CardDescription>
              {status?.caExists ? text.caDescriptionExists : text.caDescriptionMissing}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-3 text-sm">
            <StatusRow
              label={text.system}
              value={status?.systemTrusted ? "Trusted" : "Not trusted"}
              healthy={status?.systemTrusted}
            />
            <StatusRow
              label={text.browsers}
              value={status?.browsersTrusted ? "Trusted" : "Not trusted"}
              healthy={status?.browsersTrusted}
            />
            <ValueRow label={text.expires} value={status?.caExpires ?? "—"} />
            <CopyRow
              label="SHA-256"
              value={status?.caFingerprint}
              copied={copied === "ca-fingerprint"}
              onCopy={() => copy("ca-fingerprint", status?.caFingerprint)}
            />
            <CopyRow
              label={text.path}
              value={status?.caPath}
              copied={copied === "ca-path"}
              onCopy={() => copy("ca-path", status?.caPath)}
            />
            <Button
              className="w-full min-w-0"
              disabled={busy || !status?.caExists}
              onClick={() => void action("install_local_ca")}
            >
              <ShieldCheck />
              {text.trustLocalCa}
            </Button>
            <Button
              className="w-full min-w-0"
              variant="destructive"
              disabled={busy || !status?.caExists}
              onClick={() => setDeleteTarget("ca")}
            >
              <Trash2 />
              {text.resetLocalCa}
            </Button>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="min-w-0">
            <CardTitle>{text.localHttpsCertificate}</CardTitle>
            <CardDescription>{text.localHttpsCertificateDescription}</CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-3 text-sm">
            <StatusRow
              label={text.status}
              value={status?.certificateExists ? "Generated" : "Not generated"}
              healthy={status?.certificateExists}
            />
            <ValueRow label={text.expires} value={status?.certificateExpires ?? "—"} />
            <CopyRow
              label="SHA-256"
              value={status?.certificateFingerprint}
              copied={copied === "certificate-fingerprint"}
              onCopy={() => copy("certificate-fingerprint", status?.certificateFingerprint)}
            />
            <CopyRow
              label={text.path}
              value={status?.certificatePath}
              copied={copied === "certificate-path"}
              onCopy={() => copy("certificate-path", status?.certificatePath)}
            />
            <Button
              className="w-full min-w-0"
              variant="outline"
              disabled={busy || !status?.caExists}
              onClick={() => void action("reissue_local_https")}
            >
              <RefreshCw />
              {text.reissueHttps}
            </Button>
            <Button
              className="w-full min-w-0"
              variant="destructive"
              disabled={busy || !status?.certificateExists}
              onClick={() => setDeleteTarget("https")}
            >
              <Trash2 />
              {text.deleteHttpsCertificate}
            </Button>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden xl:col-span-2">
          <CardHeader>
            <CardTitle>{text.certificateDomains}</CardTitle>
            <CardDescription>{text.certificateDomainsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {status?.domains.length ? (
              status.domains.map((domain) => (
                <Badge key={domain} variant="outline">
                  {domain}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{text.noDomainsYet}</p>
            )}
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget === "ca" ? text.resetCaTitle : text.deleteHttpsTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === "ca" ? text.resetCaDescription : text.deleteHttpsDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void remove()}>
              <Trash2 />
              {text.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatusRow({ label, value, healthy }: { label: string; value: string; healthy?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-lg border p-3">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <Badge className="shrink-0" variant={healthy ? "default" : "secondary"}>
        {value}
      </Badge>
    </div>
  )
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 overflow-hidden rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs" title={value}>
        {value}
      </span>
    </div>
  )
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value?: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-xs" title={value}>
          {value ?? "—"}
        </p>
      </div>
      <Button
        className="shrink-0"
        variant="ghost"
        size="icon-sm"
        disabled={!value}
        onClick={onCopy}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}
