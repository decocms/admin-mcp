import { cn } from "@/lib/utils.ts";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip.tsx";

export interface ViewModeOption<T extends string = string> {
	value: T;
	icon: ReactNode;
	label?: string;
	tooltip?: string;
	disabled?: boolean;
}

type ViewModeSize = "sm" | "md" | "lg";

interface ViewModeToggleProps<T extends string = string> {
	value: T;
	onValueChange: (value: T) => void;
	options: ViewModeOption<T>[];
	size?: ViewModeSize;
	className?: string;
}

const sizeConfig = {
	sm: { button: "h-8 min-w-8 px-2", icon: "size-4", indicator: "h-8" },
	md: { button: "h-9 min-w-9 px-2.5", icon: "size-5", indicator: "h-9" },
	lg: { button: "h-12 min-w-12 px-3", icon: "size-6", indicator: "h-12" },
};

export function ViewModeToggle<T extends string = string>({
	value,
	onValueChange,
	options,
	size = "sm",
	className,
}: ViewModeToggleProps<T>) {
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });

	// Track the active button continuously: when the label slides in, the
	// button widens via CSS transition; ResizeObserver keeps the indicator's
	// measured width/position in sync with the actual layout each frame.
	useLayoutEffect(() => {
		const idx = options.findIndex((o) => o.value === value);
		const el = buttonRefs.current[idx];
		if (!el) return;

		const update = () => {
			setIndicator({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
		};
		update();

		const ro = new ResizeObserver(update);
		ro.observe(el);
		// Sibling buttons may shrink/grow too, shifting our offsetLeft.
		const parent = el.parentElement;
		if (parent) {
			for (const sibling of Array.from(parent.children)) {
				if (sibling !== el && sibling instanceof HTMLElement) ro.observe(sibling);
			}
		}
		return () => ro.disconnect();
	}, [value, options]);

	const config = sizeConfig[size];

	return (
		<div className={cn("relative flex gap-0 rounded-lg bg-muted", className)}>
			{options.map((option, i) => {
				const active = value === option.value;
				const btn = (
					<button
						ref={(el) => {
							buttonRefs.current[i] = el;
						}}
						key={option.value}
						type="button"
						disabled={option.disabled}
						onClick={() => onValueChange(option.value)}
						className={cn(
							"relative z-10 flex items-center justify-center rounded-lg disabled:pointer-events-none disabled:opacity-40",
							config.button,
						)}
					>
						<span
							className={cn(
								"flex shrink-0 items-center justify-center [&>svg]:size-[1em] transition-colors duration-200 ease-out",
								config.icon,
								active ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{option.icon}
						</span>
						{option.label && (
							<span
								className={cn(
									"overflow-hidden whitespace-nowrap text-xs font-medium text-foreground transition-[max-width,opacity,margin] [transition-timing-function:var(--ease-out-cubic)] duration-200",
									active
										? "ml-1.5 max-w-[100px] opacity-100"
										: "ml-0 max-w-0 opacity-0",
								)}
							>
								{option.label}
							</span>
						)}
					</button>
				);
				if (!option.tooltip || active) return btn;
				return (
					<Tooltip key={option.value}>
						<TooltipTrigger asChild>{btn}</TooltipTrigger>
						<TooltipContent side="bottom">{option.tooltip}</TooltipContent>
					</Tooltip>
				);
			})}
			{/* Sliding indicator — width/left tracked via ResizeObserver above */}
			<div
				className={cn(
					"absolute z-0 rounded-lg bg-background card-shadow transition-[left,width,opacity] [transition-timing-function:var(--ease-out-cubic)] duration-200",
					config.indicator,
				)}
				style={{
					left: `${indicator.left}px`,
					width: `${indicator.width}px`,
					opacity: indicator.opacity,
				}}
			/>
		</div>
	);
}
