import { Blocks, Code2, FileCode2, Folder, GitFork, Globe2 as W, Server } from "lucide-react"

import { pickLanguage } from "@/i18n"

import { TypeCard } from "../../form-fields"

export function TypePickerStep({
  projectType,
  selectType,
  language,
  containerRuntimeAvailable,
}: {
  projectType: string
  selectType: (type: string) => void
  language: string
  containerRuntimeAvailable: boolean
}) {
  const text = pickLanguage(language).projectWizard
  const containerOnly = !containerRuntimeAvailable
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TypeCard
        active={projectType === "php"}
        icon={<Code2 />}
        title={text.typePhpTitle}
        description={text.typePhpDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("php")}
        disabled={containerOnly}
        disabledHint={text.requiresContainerRuntime}
      />
      <TypeCard
        active={projectType === "static"}
        icon={<FileCode2 />}
        title={text.typeStaticTitle}
        description={text.typeStaticDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("static")}
      />
      <TypeCard
        active={projectType === "wordpress"}
        icon={<W />}
        title={text.typeWordpressTitle}
        description={text.typeWordpressDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("wordpress")}
        disabled={containerOnly}
        disabledHint={text.requiresContainerRuntime}
      />
      <TypeCard
        active={projectType === "laravel"}
        icon={<Blocks />}
        title={text.typeLaravelTitle}
        description={text.typeLaravelDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("laravel")}
        disabled={containerOnly}
        disabledHint={text.requiresContainerRuntime}
      />
      <TypeCard
        active={projectType === "symfony"}
        icon={<Blocks />}
        title={text.typeSymfonyTitle}
        description={text.typeSymfonyDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("symfony")}
        disabled={containerOnly}
        disabledHint={text.requiresContainerRuntime}
      />
      <TypeCard
        active={projectType === "node"}
        icon={<Server />}
        title={text.typeNodeTitle}
        description={text.typeNodeDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("node")}
      />
      <TypeCard
        active={projectType === "react"}
        icon={<Code2 />}
        title={text.typeReactTitle}
        description={text.typeReactDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("react")}
      />
      <TypeCard
        active={projectType === "import"}
        icon={<Folder />}
        title={text.typeImportTitle}
        description={text.typeImportDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("import")}
      />
      <TypeCard
        active={projectType === "git"}
        icon={<GitFork />}
        title={text.typeGitTitle}
        description={text.typeGitDescription}
        selectedLabel={text.selected}
        onClick={() => selectType("git")}
      />
    </div>
  )
}
