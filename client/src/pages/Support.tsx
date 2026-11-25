// Public support page. The App Store listing links here as the app's Support URL,
// so it must stay reachable without signing in (see the public routes in App.tsx).
import type { ReactNode } from "react";

const SUPPORT_EMAIL = "hello@moradaco.com.au";

function EmailLink() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
      {SUPPORT_EMAIL}
    </a>
  );
}

const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: "How do I get a Morada account?",
    a: (
      <>
        Morada accounts are set up by your company. Ask your company&apos;s administrator to invite you from the web
        app, then open the invitation email and choose a password. Clients are invited by their builder. To set up
        Morada for a new company, sign up at{" "}
        <a href="https://app.moradaco.com.au/auth" className="text-primary underline">app.moradaco.com.au</a>.
      </>
    ),
  },
  {
    q: "I can't sign in",
    a: (
      <>
        Check you&apos;re using the email address your invitation was sent to. If you&apos;ve forgotten your password,
        tap <strong>Forgot password</strong> on the sign-in screen and we&apos;ll email you a reset link. If you signed
        up with Sign in with Apple, use that button again rather than typing a password.
      </>
    ),
  },
  {
    q: "Do the phone app and the web app share the same data?",
    a: (
      <>
        Yes. They use the same account, and anything you add on site, such as diary entries, photos, timesheets and
        defects, appears in the web app straight away.
      </>
    ),
  },
  {
    q: "How do I turn off arrival alerts?",
    a: (
      <>
        In the app, go to <strong>Settings</strong> and switch off <strong>Arrival alerts</strong> under Arriving on
        site. You can also remove Morada&apos;s location access in your iPhone&apos;s Settings app under Privacy &amp;
        Security, then Location Services.
      </>
    ),
  },
  {
    q: "I'm not getting notifications",
    a: (
      <>
        Open your iPhone&apos;s Settings app, tap <strong>Notifications</strong>, then <strong>Morada</strong>, and make
        sure Allow Notifications is on. Signing out and back in to the app also re-registers your phone.
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        In the app, go to <strong>Settings</strong> (or <strong>Account</strong> if you&apos;re a client) and tap{" "}
        <strong>Delete account</strong>. This permanently removes your login and personal details. Work you recorded
        for your company stays with that company. You can also email <EmailLink /> and we&apos;ll do it for you. See
        our <a href="/privacy" className="text-primary underline">Privacy Policy</a> for details.
      </>
    ),
  },
  {
    q: "How do I report a problem?",
    a: (
      <>
        Email <EmailLink /> with what you were doing, what went wrong, and a screenshot if you can. Tell us whether
        you were on the phone app or the web app.
      </>
    ),
  },
];

export default function Support() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Morada Support</h1>
        <p className="text-muted-foreground mb-8">
          Help with the Morada web app and the Morada iPhone app.
        </p>

        <section className="rounded-lg border bg-card p-5 mb-10">
          <h2 className="text-lg font-semibold mb-2">Contact us</h2>
          <p className="text-muted-foreground leading-relaxed">
            Email <EmailLink /> and we&apos;ll get back to you.
          </p>
        </section>

        <h2 className="text-xl font-semibold mb-4">Common questions</h2>
        <div className="space-y-6">
          {QUESTIONS.map(({ q, a }) => (
            <section key={q}>
              <h3 className="font-semibold mb-1">{q}</h3>
              <p className="text-muted-foreground leading-relaxed">{a}</p>
            </section>
          ))}
        </div>

        <p className="text-sm text-muted-foreground mt-12">
          Morada is operated by Lighthouse Projects (ABN: 26 683 914 516), Australia.{" "}
          <a href="/privacy" className="underline">Privacy Policy</a> ·{" "}
          <a href="/terms" className="underline">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}
