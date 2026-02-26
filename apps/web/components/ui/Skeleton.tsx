import { clsx } from "clsx";

interface Props {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: Props) {
  return (
    <div
      className={clsx("animate-pulse bg-gray-100 rounded-lg", className)}
      style={style}
    />
  );
}
