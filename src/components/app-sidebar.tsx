import {
  Blocks,
  ArchiveRestore,
  CircleHelp,
  Database,
  Files,
  Globe2,
  LayoutDashboard,
  LayoutGrid,
  Logs,
  Mail,
  Search,
  Server,
  Settings,
  ShieldCheck,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { OperationCenter } from "@/components/operation-center"
import { pickLanguage } from "@/i18n"

export type PanelView =
  | "dashboard"
  | "sites"
  | "containers"
  | "database"
  | "files"
  | "logs"
  | "mail"
  | "backups"
  | "certificates"
  | "cloud"
  | "apps"
  | "help"
  | "settings"

export function AppSidebar({
  active,
  language,
  onNavigate,
  onOpenSearch,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  active: PanelView
  language: string
  onNavigate: (view: PanelView) => void
  onOpenSearch: () => void
}) {
  const text = pickLanguage(language).appSidebar
  const primary = [
    { id: "dashboard" as const, label: text.dashboard, icon: LayoutDashboard },
    { id: "sites" as const, label: text.sites, icon: Server },
    { id: "containers" as const, label: text.containers, icon: Blocks },
    { id: "database" as const, label: text.databases, icon: Database },
    { id: "files" as const, label: text.files, icon: Files },
    { id: "logs" as const, label: text.logs, icon: Logs },
    { id: "mail" as const, label: text.mail, icon: Mail },
    {
      id: "backups" as const,
      label: text.backups,
      icon: ArchiveRestore,
    },
  ]
  const tools = [
    {
      id: "certificates" as const,
      label: text.certificates,
      icon: ShieldCheck,
    },
    { id: "cloud" as const, label: "Live Link", icon: Globe2 },
    { id: "apps" as const, label: text.integrations, icon: LayoutGrid },
  ]
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="mb-4"
              size="lg"
              onClick={() => onNavigate("dashboard")}
              tooltip="LS Panel"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Server className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="flex items-center gap-1.5 truncate font-semibold">
                  LS Panel
                  <span className="truncate text-[10px] font-normal text-muted-foreground">
                    Beta v. 0.1.0
                  </span>
                </span>
                <span className="truncate text-xs text-muted-foreground">Local development</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onOpenSearch}
              tooltip="Ctrl+K"
              className="border text-foreground"
            >
              <Search />
              <span>{text.search}</span>
              <kbd className="ml-auto rounded border bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-accent group-data-[collapsible=icon]:hidden">
                Ctrl+K
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{text.workspace}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primary.map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={active === id}
                    tooltip={label}
                    onClick={() => onNavigate(id)}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{text.tools}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tools.map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={active === id}
                    tooltip={label}
                    onClick={() => onNavigate(id)}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <OperationCenter language={language} />
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={active === "settings"}
              tooltip={text.settings}
              onClick={() => onNavigate("settings")}
            >
              <Settings />
              <span>{text.settings}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={active === "help"}
              tooltip={text.systemHealth}
              onClick={() => onNavigate("help")}
            >
              <CircleHelp />
              <span>{text.systemHealth}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
