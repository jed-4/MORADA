export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: June 2026</p>

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
              <li>Anthropic/OpenAI (AI features and support chat)</li>
              <li>Crisp (support chat)</li>
              <li>Sentry (error monitoring)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">AI support chat disclosure</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you use support chat, your name, email, plan, and company name may be shared with Crisp and
              Anthropic/OpenAI to assist with your query. No financial figures, client names, or document content are
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
