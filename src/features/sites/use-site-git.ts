import * as React from "react"
import { invoke } from "@tauri-apps/api/core"

import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"
import type { Site } from "@/types"

import { isDirtyCheckoutConflict } from "./helpers"
import type { GitDetails, GitStatus } from "./types"

export function useSiteGit(
  site: Site,
  mutex: {
    setBusy: (value: boolean) => void
    setMessage: (value: string) => void
    setMessageOk: (value: boolean) => void
  },
  language: string,
) {
  const text = pickLanguage(language).siteDetails
  const [status, setStatus] = React.useState<GitStatus | null>(null)
  const [details, setDetails] = React.useState<GitDetails | null>(null)
  const [newBranch, setNewBranch] = React.useState("")
  const [commitMessage, setCommitMessage] = React.useState("")
  const [pendingCheckout, setPendingCheckout] = React.useState<{
    branch: string
    create: boolean
  } | null>(null)

  React.useEffect(() => {
    if (site.directory)
      void Promise.all([
        invoke<GitStatus>("site_git_status", { directory: `${site.directory}/app` }),
        invoke<GitDetails>("site_git_details", { directory: `${site.directory}/app` }).catch(
          () => null,
        ),
      ])
        .then(([nextStatus, nextDetails]) => {
          setStatus(nextStatus)
          setDetails(nextDetails)
        })
        .catch(() => {
          setStatus(null)
          setDetails(null)
        })
  }, [site.directory])

  async function refreshGit() {
    const [nextStatus, nextDetails] = await Promise.all([
      invoke<GitStatus>("site_git_status", { directory: `${site.directory}/app` }),
      invoke<GitDetails>("site_git_details", { directory: `${site.directory}/app` }),
    ])
    setStatus(nextStatus)
    setDetails(nextDetails)
  }

  async function gitAction(action: "fetch" | "pull" | "commit" | "push") {
    mutex.setBusy(true)
    mutex.setMessage("")
    try {
      await invoke<GitStatus>("site_git_action", {
        directory: `${site.directory}/app`,
        action,
        message: commitMessage,
      })
      if (action === "commit") setCommitMessage("")
      await refreshGit()
      mutex.setMessage(text.gitCompletedMessage(action))
      mutex.setMessageOk(true)
    } catch (error) {
      mutex.setMessage(errorMessage(error))
      mutex.setMessageOk(false)
    } finally {
      mutex.setBusy(false)
    }
  }

  async function initializeGit() {
    mutex.setBusy(true)
    mutex.setMessage("")
    try {
      await invoke<GitStatus>("initialize_site_git", { siteId: site.id })
      await refreshGit()
      mutex.setMessage(text.gitInitSuccessMessage)
      mutex.setMessageOk(true)
    } catch (error) {
      mutex.setMessage(errorMessage(error))
      mutex.setMessageOk(false)
    } finally {
      mutex.setBusy(false)
    }
  }

  async function checkoutBranch(
    branch: string,
    create = false,
    options?: { stash?: boolean; force?: boolean },
  ) {
    if (!branch) return
    mutex.setBusy(true)
    mutex.setMessage("")
    try {
      await invoke<GitStatus>("site_git_checkout", {
        directory: `${site.directory}/app`,
        branch,
        create,
        stash: options?.stash ?? false,
        force: options?.force ?? false,
      })
      setNewBranch("")
      setPendingCheckout(null)
      await refreshGit()
      mutex.setMessage(
        options?.stash
          ? text.stashedAndSwitchedTo(branch)
          : create
            ? text.createdAndSwitchedTo(branch)
            : text.switchedTo(branch),
      )
      mutex.setMessageOk(true)
    } catch (error) {
      const description = errorMessage(error)
      if (!options?.stash && !options?.force && isDirtyCheckoutConflict(description)) {
        setPendingCheckout({ branch, create })
      } else {
        mutex.setMessage(description)
        mutex.setMessageOk(false)
      }
    } finally {
      mutex.setBusy(false)
    }
  }

  return {
    status,
    details,
    newBranch,
    setNewBranch,
    commitMessage,
    setCommitMessage,
    pendingCheckout,
    setPendingCheckout,
    refreshGit,
    gitAction,
    initializeGit,
    checkoutBranch,
  }
}
