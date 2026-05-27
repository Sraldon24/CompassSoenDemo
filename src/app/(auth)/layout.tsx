import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  children,
}: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--color-bg)" }}
    >
      <Link href="/" className="mb-8" aria-label="SOEN Compass home">
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
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
