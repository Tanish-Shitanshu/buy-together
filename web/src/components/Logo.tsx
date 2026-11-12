export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0070E0" /><stop offset="1" stopColor="#001C64" /></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <circle cx="24" cy="32" r="13" fill="#fff" fillOpacity=".92" />
      <circle cx="40" cy="32" r="13" fill="#FFC439" fillOpacity=".95" />
      <path d="M32 21.2a13 13 0 0 1 0 21.6 13 13 0 0 1 0-21.6z" fill="#0070E0" />
    </svg>
  );
}
