import { AlertTriangle } from "lucide-react";

export default function Legal() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10 animate-fadeIn">
      <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p>
          <strong>Draft, not legal advice.</strong> This page describes what the app actually does with data
          today. It has not been reviewed by a lawyer and should be before this app is used with real
          players, especially minors — Indian DPDP requirements around a child's personal data (verifiable
          parental consent, purpose limitation) are not something this draft can substitute for.
        </p>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold">Privacy Policy &amp; Terms</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: reflects the app as of this build.</p>
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">What we collect</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Account info: email address, and your name/date of birth if you add them to your profile.</li>
          <li>Player records a coach creates: a name and, optionally, a date of birth.</li>
          <li>
            Performance data: speed, spin, force and distance for each recorded kick, timestamped and tied to
            a player and session.
          </li>
          <li>Device data: a ball's hardware ID, battery level, Wi-Fi signal, and firmware version.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">What we don't collect</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>No location tracking beyond what a Wi-Fi network's own infrastructure inherently exposes.</li>
          <li>No payment information — nothing in this app processes payments today.</li>
          <li>No data is sold, or shared with advertisers.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Who can see what</h2>
        <p className="text-sm text-muted-foreground">
          Enforced at the database level, not just in the app's UI: a coach sees players they added
          themselves, plus every player belonging to an academy (organization) they're a member of. A player
          account sees only its own recorded shots. Nobody outside your account or academy can see your data
          through this app.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Where data lives</h2>
        <p className="text-sm text-muted-foreground">
          Data is stored with Supabase (database and authentication), the ingest server runs on Render, and
          the web app is hosted on Vercel. These are infrastructure providers processing data on our behalf,
          under their own security and privacy terms — not third parties we share data with for their own
          purposes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Children's data</h2>
        <p className="text-sm text-muted-foreground">
          This app is built for use in football academies, where many players are minors. A coach adding a
          player's name and date of birth should have the appropriate consent from that player's parent or
          guardian to do so — this app does not currently verify that consent itself, which is exactly the
          kind of gap a proper DPDP compliance review needs to close before wider real-world use.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Your right to delete your data</h2>
        <p className="text-sm text-muted-foreground">
          Any account can be permanently deleted from the Profile page, which removes the account itself and
          everything tied to it — profile, players you added, sessions, recorded shots, and any devices or
          academy you own — immediately, with no recovery period.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Contact</h2>
        <p className="text-sm text-muted-foreground">
          Questions about this policy or a data request: contact the team through the details on the
          project's GitHub repository.
        </p>
      </section>
    </div>
  );
}
