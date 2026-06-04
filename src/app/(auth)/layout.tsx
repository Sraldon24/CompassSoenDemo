import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  children,
}: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-12"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="aurora-bg" aria-hidden />
      <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
      <div className="absolute inset-0 grid-backdrop opacity-60" aria-hidden />
      <Link href="/" className="relative z-10 mb-8 animate-rise" aria-label="SOEN Compass home">
        <Image
          src="/brand/lockup.svg"
          alt="SOEN Compass"
          width={180}
          height={40}
          priority
          className="dark:hidden"
        />
        <Image
          src="/brand/lockup-reverse.svg"
          alt="SOEN Compass"
          width={180}
          height={40}
          priority
          className="hidden dark:block"
        />
      </Link>
      <div
        className="relative z-10 w-full max-w-sm animate-rise"
        style={{ animationDelay: "80ms" }}
      >
        {children}
      </div>
    </div>
  );
}
