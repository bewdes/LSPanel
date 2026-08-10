import { ExternalLink, GitBranch, History, Plus, RefreshCw, Save } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { pickLanguage } from "@/i18n"

import type { GitDetails, GitStatus } from "../types"

export function SiteGitPanel({
  status,
  details,
  newBranch,
  setNewBranch,
  commitMessage,
  setCommitMessage,
  gitAction,
  initializeGit,
  checkoutBranch,
  busy,
  onOpenRemote,
  language,
}: {
  status: GitStatus | null
  details: GitDetails | null
  newBranch: string
  setNewBranch: (value: string) => void
  commitMessage: string
  setCommitMessage: (value: string) => void
  gitAction: (action: "fetch" | "pull" | "commit" | "push") => Promise<void>
  initializeGit: () => Promise<void>
  checkoutBranch: (branch: string, create?: boolean) => Promise<void>
  busy: boolean
  onOpenRemote: () => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Git</CardTitle>
          <CardDescription>
            {status?.repository
              ? `${status.branch} · ${status.dirty ? text.changedFiles(status.changedFiles) : text.workingTreeClean}${status.behind > 0 ? ` · ${text.commitsBehind(status.behind)}` : ""}${status.ahead > 0 ? ` · ${text.commitsAhead(status.ahead)}` : ""}`
              : text.gitNotInitializedDescription}
          </CardDescription>
        </CardHeader>
        {status && !status.repository && (
          <CardContent>
            <Button disabled={busy} onClick={() => void initializeGit()}>
              <GitBranch />
              {text.initializeGit}
            </Button>
          </CardContent>
        )}
        {status?.repository && (
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void gitAction("fetch")}>
                <RefreshCw />
                {text.fetch}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void gitAction("pull")}>
                <RefreshCw />
                {text.pull}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void gitAction("push")}>
                <ExternalLink />
                {text.push}
              </Button>
              {details?.remoteUrl && (
                <Button
                  variant="outline"
                  disabled={busy}
                  title={details.remoteUrl}
                  onClick={onOpenRemote}
                >
                  <ExternalLink />
                  {text.openRepository}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder={text.commitMessagePlaceholder}
              />
              <Button
                disabled={busy || !status.dirty || !commitMessage.trim()}
                onClick={() => void gitAction("commit")}
              >
                <Save />
                {text.commitAllChanges}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
      {status?.repository && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch />
                {text.branches}
              </CardTitle>
              <CardDescription>{text.branchesDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Select
                value={status.branch}
                onValueChange={(value) => {
                  if (value && value !== status.branch) void checkoutBranch(String(value))
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={text.selectBranch} />
                </SelectTrigger>
                <SelectContent>
                  {details?.branches.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  value={newBranch}
                  onChange={(event) => setNewBranch(event.target.value)}
                  placeholder="feature/new-branch"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void checkoutBranch(newBranch, true)
                  }}
                />
                <Button
                  disabled={busy || !newBranch.trim()}
                  onClick={() => void checkoutBranch(newBranch, true)}
                >
                  <Plus />
                  {text.create}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History />
                {text.recentCommits}
              </CardTitle>
              <CardDescription>{text.recentCommitsDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-h-72 gap-1 overflow-auto">
              {details?.commits.length ? (
                details.commits.map((commit) => (
                  <div
                    key={commit.hash}
                    className="grid grid-cols-[auto_1fr] gap-x-3 border-b py-2 text-sm last:border-0"
                  >
                    <code className="text-xs text-muted-foreground">{commit.hash}</code>
                    <span className="truncate font-medium">{commit.subject}</span>
                    <span />
                    <span className="text-xs text-muted-foreground">
                      {commit.author} · {commit.relativeDate}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{text.noCommitsYet}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{text.changedFilesTitle}</CardTitle>
              <CardDescription>{text.changedFilesDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-h-72 gap-1 overflow-auto">
              {details?.changes.length ? (
                details.changes.map((change) => (
                  <div
                    key={`${change.status}-${change.path}`}
                    className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b py-2 text-sm last:border-0"
                  >
                    <Badge variant="outline" className="justify-center font-mono">
                      {change.status || "M"}
                    </Badge>
                    <span className="truncate font-mono text-xs">{change.path}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{text.workingTreeCleanParagraph}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
