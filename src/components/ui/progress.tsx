import * as React from "react"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value = 0,
  indeterminate = false,
  ...props
}: React.ComponentProps<"div"> & { value?: number; indeterminate?: boolean }) {
  const progress = Math.max(0, Math.min(100, value))

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-primary/15", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          "h-full bg-primary transition-[width] duration-300 ease-out",
          indeterminate &&
            "absolute w-1/3 animate-[progress-indeterminate_1.2s_ease-in-out_infinite]",
        )}
        style={indeterminate ? undefined : { width: `${progress}%` }}
      />
    </div>
  )
}

export { Progress }
