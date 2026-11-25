export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: November 2026</p>

        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">Who we are</h2>
            <p className="text-muted-foreground leading-relaxed">
              Morada is operated by Lighthouse Projects (ABN: 26 683 914 516). You can contact us at{' '}
              <a href="mailto:hello@moradaco.com.au" className="text-primary underline">hello@moradaco.com.au</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">What we collect</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Account information (name, email, company name)</li>
              <li>Project data</li>
              <li>Financial records</li>
              <li>Uploaded files</li>
              <li>Usage and analytics data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How we use it</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Provide and improve the service</li>
              <li>Send transactional emails</li>
              <li>Respond to support requests</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Third-party processors</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We share limited information with trusted third-party services that help us run Morada:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Stripe (billing)</li>
              <li>Xero (accounting integration)</li>
              <li>Resend (transactional email)</li>
              <li>Anthropic (AI features and support chat)</li>
              <li>Crisp (support chat)</li>
              <li>Sentry (error monitoring)</li>
              <li>Expo (delivering push notifications to the phone app)</li>
              <li>Apple (Sign in with Apple, push notifications and voice dictation on iPhone)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">The Morada phone app</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              The iPhone app uses the same account and data as the web app. It only asks for a permission when you use
              the feature that needs it, and you can turn each one off at any time in your iPhone&apos;s Settings.
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>
                <strong>Location.</strong> When you tap to set a job&apos;s site location, the app sends your current
                position so it can be saved as that job&apos;s address. If you turn on Arrival alerts, the app watches for
                you arriving at or leaving your company&apos;s job sites so it can ask whether you want to clock in or out.
                It records only the job and the time of each arrival or departure, never your position or where else you
                go. Only you and the people who approve your timesheets can see these records.
              </li>
              <li>
                <strong>Camera and photos.</strong> Used only when you take or choose a photo to attach to a diary entry,
                checklist, defect, receipt, delivery, note or message.
              </li>
              <li>
                <strong>Microphone and speech recognition.</strong> Used only when you tap the mic button to dictate
                text. Speech is turned into text by Apple&apos;s speech recognition, on the phone itself where your iPhone
                supports it. No recording is kept.
              </li>
              <li>
                <strong>Face ID.</strong> If you turn on Require Face ID, your iPhone checks your face itself. Morada
                never receives your face data.
              </li>
              <li>
                <strong>Notifications.</strong> If you allow notifications, we store a device token so we can send you
                alerts about your work. It is deleted when you sign out of that device or delete your account.
              </li>
              <li>
                <strong>Sign in with Apple.</strong> If you choose it, Apple shares your name and an email address with
                us, which may be a private relay address that forwards to you.
              </li>
              <li>
                <strong>Crash reports.</strong> If the app crashes we receive a report through Sentry to help us fix it.
                It does not include your name or email.
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We do not sell your information, show advertising, or track you across other companies&apos; apps or
              websites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">AI support chat disclosure</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you use support chat, your name, email, plan, and company name may be shared with Crisp and
              Anthropic to assist with your query. No financial figures, client names, or document content are
              shared. Support conversations are stored and may inform future support interactions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Notifiable Data Breaches</h2>
            <p className="text-muted-foreground leading-relaxed">
              In the event of a data breach likely to cause serious harm, we will notify affected individuals and the
              Office of the Australian Information Commissioner (OAIC) as required under the Privacy Act 1988.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              Data is retained while your account is active and for 30 days after cancellation, after which it may be
              permanently deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Deleting your account</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              You can delete your account yourself in the phone app: go to Settings (or Account if you&apos;re a client)
              and tap Delete account. This removes your login, name, email, phone number and photo, unlinks Sign in with
              Apple, and signs you out on every device. It can&apos;t be undone.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Work you recorded for your company, such as timesheets and diary entries, stays with that company because it
              forms part of their business records, but it shows as &ldquo;Deleted user&rdquo; instead of your name. You can also ask us to
              delete your account by emailing{' '}
              <a href="mailto:hello@moradaco.com.au" className="text-primary underline">hello@moradaco.com.au</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Your rights under the Australian Privacy Act 1988</h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to access, correct, and make complaints about your personal information. Contact{' '}
              <a href="mailto:hello@moradaco.com.au" className="text-primary underline">hello@moradaco.com.au</a> to
              exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Lighthouse Projects</strong> (ABN: 26 683 914 516)<br />
              Email: <a href="mailto:hello@moradaco.com.au" className="text-primary underline">hello@moradaco.com.au</a><br />
              Australia
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
