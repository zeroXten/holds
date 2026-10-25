# Shaolin Holds

A gamified trainer for Shaolin isometric stances. Prop your phone up, step back, and the front camera watches your stance. You earn coins while you hold good form, with spoken coaching when your form slips.

- **Camera form checking** runs entirely on the phone with [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker). No video leaves the device.
- **Fifteen holds, four levels each:** Horse, Bow, Empty (cat), Crane, Drop, Standing Post, Swallow Balance, Kick Hold, Fist Plank, Iron Bridge and Rest from Shaolin training, plus four non-Shaolin holds chosen for their all-round value: Side Plank, Bird Dog, Hollow Hold and Deep Squat. Each level asks for a deeper or harder position as well as a longer time. Horse stance, for example, starts with thighs about 45° from level and ends with them level. Every hold uses the camera. For Rest Stance it checks depth, bent knees and an upright back, but can't see the legs cross.
- **Coins:** 1 coin per 10 seconds in good form, × the level (1×, 1.25×, 1.5×, 2×) × form (0.75× at the threshold, 1.25× at perfect form). Bonus time past the target pays 1.5×, then 2× from +50%, then 3× from double the target. Reaching the target adds 2 coins, and a daily streak adds up to +50%.
- **Hold of the day:** picked from your unlocked holds using the date as the seed, so it's the same all day. It earns 3× coins.
- **Unlocking holds:** Horse and Bow are free. Spend coins to unlock the others; each unlock costs more than the last (20, 30, 45 … 300 coins).
- **Streaks:** each streak day adds 5% to your coins (up to +50%), and milestones at 1 week, 2 weeks, 1, 2, ~3, 6 and 12 months pay bonus coins (some with a free streak freeze). Protect a streak with a planned rest day (5 coins, booked ahead), a streak freeze (15, used automatically) or a repair after the fact (40 per missed day).
- **Bets on yourself:** stake coins on a goal (three holds today, ten minutes today, a 90+ form target, a personal best, five days this week, an unbroken week) and win more back. Wins get a full-screen celebration; results are kept in a bet history.
- **Level tests:** take the next level early; pass with 80+ form and it unlocks for free, fail and it costs coins.
- **Your temple:** a pixel-art Shaolin courtyard, drawn entirely in code, across the top of the home screen. It starts bare; buy 15 features (path, bamboo, lanterns, hall, pagoda…) and 6 themes (dawn, day, dusk, autumn, night, snow) that also recolour the app. `node tools/render-temple.mjs <dir>` renders scenes to PNG.
- **Levelling up:** reach a level's target with 70+ average form on 3 different days to unlock the next level.
- **Also:** sash ranks from total coins earned (spending doesn't lower your rank), badges, a training heatmap and personal bests. Plain HTML/CSS/JS with no build step. Installs as an app and works offline.

## Run locally

```bash
python3 tools/serve.py 8765
```

Then open http://localhost:8765. Camera access needs `localhost` or HTTPS.

- `?demo` replaces the camera with a scripted stick figure, so you can try the whole flow on a laptop. `?demo=fast` runs it at 5× speed.
- `npm test` checks that every hold's stick figure passes its own form criteria, that standing upright fails them, and that each level is harder than the one before. It then runs a scripted demo session for every hold and level.

## Deploy to GitHub Pages

Push this folder to a GitHub repository, then go to **Settings → Pages → Deploy from a branch → `main` / root**. The site is served at `https://<user>.github.io/<repo>/`.

## Using it

- Put the phone 2–3 m away, around waist height. Each stance tells you whether to face the camera or stand side-on. For the floor holds (Iron Bridge, Fist Plank, Side Plank, Bird Dog, Hollow Hold), turn the phone to landscape and put it low to the ground.
- Wear fitted clothes and use decent light. Baggy trousers hide your knees.
- Progress is stored in your browser. On iPhone, **add the app to your home screen**, otherwise Safari may clear its data after a week without use. You can also export a backup from Settings.

## Changing the holds

Everything lives in `js/holds.js`. Each hold has:

- `levels`: a name, a description and a target time in seconds for each of the four levels
- `figure(level)`: the stick figure, given as joint angles (see `js/figure.js`)
- `criteria(level)`: what the camera checks. Each criterion measures something from the body (a knee angle, the hips' height relative to the knees, torso lean…) and has a `min`/`max` and a `soft` margin over which the score drops from full to zero.

After editing, run `npm test` to confirm the figures still match their criteria.
