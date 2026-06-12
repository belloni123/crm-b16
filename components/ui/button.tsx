import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 ease-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
          variant === "primary" && 
            "bg-accent text-bg-base hover:shadow-[0_0_40px_-10px_rgba(212,168,67,0.4)]",
          variant === "secondary" && 
            "border border-border-strong bg-bg-card text-text-primary hover:bg-bg-elevated hover:border-text-tertiary",
          variant === "danger" && 
            "bg-danger text-text-primary hover:bg-opacity-95 hover:shadow-[0_0_40px_-10px_rgba(255,68,68,0.4)]",
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
