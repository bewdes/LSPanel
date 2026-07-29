import * as React from "react"
import { cn } from "@/lib/utils"

function ButtonGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(
        "inline-flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 data-[orientation=horizontal]:[&>*:not(:first-child)]:-ml-px data-[orientation=horizontal]:[&>*:not(:first-child)]:rounded-l-none data-[orientation=horizontal]:[&>*:not(:last-child)]:rounded-r-none data-[orientation=vertical]:flex-col data-[orientation=vertical]:[&>*:not(:first-child)]:-mt-px data-[orientation=vertical]:[&>*:not(:first-child)]:rounded-t-none data-[orientation=vertical]:[&>*:not(:last-child)]:rounded-b-none",
        className,
      )}
      {...props}
    />
  )
}

function ButtonGroupText({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="button-group-text"
      className={cn(
        "flex items-center border bg-muted px-3 text-sm font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { ButtonGroup, ButtonGroupText }
