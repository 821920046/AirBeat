"use client";

type IconProps = {
  name: string;
  size?: number;
  className?: string;
};

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <span
      className={["material-symbols-outlined select-none align-middle leading-none", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        fontSize: size,
        width: size,
        height: size,
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
