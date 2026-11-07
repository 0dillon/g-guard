# Goon Guard

An accountability tool that blocks adult sites in Chrome. When you try to open one, it alerts a friend you chose, can charge a penalty you agreed to, and resets your streak. You can compete on streaks with friends through group leaderboards.

## How it works

1. **Blocking.** The extension checks every page you open against a built-in list, the [StevenBlack porn-only hosts list](https://github.com/StevenBlack/hosts) (refreshed daily), a keyword list and your own domains. A blocked site is replaced with a block page before it loads.
2. **Friend alert.** The block page reports the attempt to the server, which emails your friend the site, the time and how many tries you've made today.
3. **Optional photo.** If you turn on the photo option, the block page takes one webcam frame and attaches it to the alert. The site has already been replaced, so only you are in the frame. Only turn this on if your friend has agreed to get photos.
4. **Penalty.** Your saved card is charged your pledged amount through Stripe and recorded as owed to your friend. Repeat hits on the same domain within 10 minutes count as a single slip.
5. **Streaks and leaderboards.** Each slip resets your streak. You earn badges at 1, 7, 30, 90 and 365 days. Points are 10 per clean day, plus 50 for every full week of your current streak, minus 25 per slip. Create a group, share its code, and the popup shows a ranked leaderboard. Groups only see names, streaks, badges and points.
6. **Anti-cheat.** If you lower your penalty, your friend gets an email about it. The extension also sends an hourly heartbeat, so the server records when you were last seen.

## Web dashboard

The server also hosts a dashboard at `http://localhost:8787/`:

- **Dashboard:** your current streak, progress to the next badge, best streak, points, slips, penalties paid, a 6-month calendar (clean days, check-in days, slips) and your badge collection.
- **Daily check-in:** log your mood (1–5) and a private note.
- **Leaderboards:** create groups, join with an invite code, copy the code or leave a group, and see members ranked by streak.
- **History:** every slip (site, time, photo yes/no, penalty) and every check-in.
- **Settings:** change the penalty, turn photos on or off, add a card.

To sign in, use **Open dashboard** in the extension popup, which signs you in automatically. On another device, request an email link that works once and expires after 15 minutes. You can also create an account on the web and install the extension later.

## Run it

```bash
cd server
npm install
cp .env.example .env   # add STRIPE_SECRET_KEY (test key) and SMTP settings
npm start
```

Without SMTP settings, emails are printed to the server console. Without a Stripe key, the penalty status shows as `stripe_not_configured`.

Load the extension:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension/` folder.
3. The settings page opens. Fill in your details and your friend's, then click **Add card** (in Stripe test mode, use `4242 4242 4242 4242`).

## Known gaps

- **Paying your friend.** Penalties go into the platform's Stripe account. Paying them out to your friend automatically needs Stripe Connect onboarding for the friend.
- **Bypassing.** You can still disable the extension or use another browser or incognito mode (turn on "Allow in Incognito" for the extension). Possible next steps: email your friend when heartbeats stop for 24 hours, and a DNS-level blocker.
- **Accounts.** Each install gets a bearer token. There is no password login or account recovery yet.
- **Hosting.** For your friend and your groups to use the same server, it has to be deployed somewhere public with HTTPS.
