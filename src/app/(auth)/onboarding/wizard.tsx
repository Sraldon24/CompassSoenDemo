"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { completeOnboarding, submitProfileStep } from "./actions";

const PROGRAMS = [
  { value: "SOEN-General", label: "General" },
  { value: "SOEN-AvionicsEmbedded", label: "Avionics & Embedded" },
  { value: "SOEN-Web", label: "Web Services & Applications" },
  { value: "SOEN-RealTime", label: "Real-Time, Embedded & Avionics" },
] as const;

const ENTRY_TERM_OPTIONS = ["Fall 2026", "Winter 2027", "Summer 2027", "Fall 2027", "Winter 2028"];

interface WizardProps {
  initialStep: number;
  defaultProgram: string;
  defaultEntryTerm: string;
  defaultStudentId: string;
  userName: string | null;
}

export function OnboardingWizard({
  initialStep,
  defaultProgram,
  defaultEntryTerm,
  defaultStudentId,
  userName,
}: WizardProps): React.ReactElement {
  const [step, setStep] = useState(Math.max(0, Math.min(2, initialStep)));
  const [program, setProgram] = useState(defaultProgram);
  const [entryTerm, setEntryTerm] = useState(defaultEntryTerm);
  const [studentId, setStudentId] = useState(defaultStudentId);
  const [isPending, startTransition] = useTransition();

  const goNext = (target: number) => setStep(Math.min(2, target));
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const submitProfile = () => {
    startTransition(async () => {
      const r = await submitProfileStep({ program, entryTerm, studentId });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      goNext(2);
    });
  };

  const finish = () => {
    startTransition(async () => {
      const r = await completeOnboarding();
      if (!r.success) {
        toast.error(r.error);
      }
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                background: i <= step ? "var(--color-accent)" : "var(--color-border)",
              }}
              aria-current={i === step ? "step" : undefined}
            />
          ))}
        </div>
        {step === 0 && (
          <>
            <CardTitle className="text-2xl">
              Welcome{userName ? `, ${userName.split(/\s+/)[0]}` : ""} 👋
            </CardTitle>
            <CardDescription>Let&apos;s set up your plan in about 60 seconds.</CardDescription>
          </>
        )}
        {step === 1 && (
          <>
            <CardTitle className="text-2xl">Your program</CardTitle>
            <CardDescription>So we know which requirements to track.</CardDescription>
          </>
        )}
        {step === 2 && (
          <>
            <CardTitle className="text-2xl">You&apos;re all set 🎉</CardTitle>
            <CardDescription>
              Your dashboard is ready. We&apos;ll improve it as you add courses.
            </CardDescription>
          </>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <div
              className="rounded-md border p-4 text-sm leading-relaxed"
              style={{
                background: "var(--color-accent-soft)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              <p className="flex items-start gap-2 mb-2 font-medium">
                <Sparkles className="h-4 w-4 mt-0.5" style={{ color: "var(--color-accent)" }} />
                What you&apos;ll get
              </p>
              <ul className="space-y-1 ml-6 list-disc">
                <li>Drag-and-drop your courses across terms</li>
                <li>Real-time prereq + workload warnings</li>
                <li>An AI assistant trained on Concordia data (coming)</li>
              </ul>
            </div>
            <Button onClick={() => goNext(1)} className="w-full">
              Get started
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Program</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PROGRAMS.map((p) => (
                  <label
                    key={p.value}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors"
                    style={{
                      borderColor:
                        program === p.value ? "var(--color-accent)" : "var(--color-border)",
                      background:
                        program === p.value ? "var(--color-accent-soft)" : "var(--color-surface)",
                    }}
                  >
                    <input
                      type="radio"
                      name="program"
                      value={p.value}
                      checked={program === p.value}
                      onChange={() => setProgram(p.value)}
                      className="sr-only"
                    />
                    <span
                      className="inline-block w-3 h-3 rounded-full border-2 shrink-0"
                      style={{
                        borderColor:
                          program === p.value
                            ? "var(--color-accent)"
                            : "var(--color-border-strong)",
                        background: program === p.value ? "var(--color-accent)" : "transparent",
                      }}
                      aria-hidden
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="entry-term">Entry term</Label>
              <select
                id="entry-term"
                value={entryTerm}
                onChange={(e) => setEntryTerm(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none"
                style={{
                  background: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                {ENTRY_TERM_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="student-id">Student ID (optional)</Label>
              <Input
                id="student-id"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="40123456"
                maxLength={20}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={goBack} disabled={isPending}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={submitProfile} disabled={isPending} className="flex-1">
                {isPending ? "Saving…" : "Continue"}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex justify-center py-4">
              <CheckCircle2
                className="h-16 w-16"
                style={{ color: "var(--color-accent)" }}
                aria-hidden
              />
            </div>
            <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
              Welcome to Compass. We&apos;ll add the rest of the wizard (interests, Excel import) in
              a later phase. Jump in and start planning.
            </p>
            <Button onClick={finish} disabled={isPending} className="w-full">
              {isPending ? "Finishing…" : "Go to dashboard"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
