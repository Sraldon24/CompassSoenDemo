"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { type SignInInput, signInSchema } from "@/lib/validations/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

/** Only allow same-site relative return paths to avoid open-redirects. */
function safeReturnPath(from: string | null): string {
  return from?.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";
}

export default function LoginPage(): React.ReactElement {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInInput) => {
    setServerError(null);
    const result = await authClient.signIn.email({
      email: data.email,
      password: data.password,
    });
    if (result.error) {
      setServerError(result.error.message ?? "Sign-in failed. Check your credentials.");
      return;
    }
    toast.success("Welcome back");
    // Full navigation (not router.push) so middleware sees the freshly-set
    // session cookie on the server before rendering the protected route.
    // Read `from` from the live URL (not useSearchParams) so the page can still
    // be statically prerendered without a Suspense bailout.
    const from = new URLSearchParams(window.location.search).get("from");
    window.location.assign(safeReturnPath(from));
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>Enter your email and password to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm" style={{ color: "var(--color-danger)" }}>
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm" style={{ color: "var(--color-danger)" }}>
                {errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
