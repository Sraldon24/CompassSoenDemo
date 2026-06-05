# Screenshots

Drop these PNGs here (referenced by the root README). Recommended ~1600px wide, compressed.
Capture them in the current **Meridian** look (bone paper + Clementine accent), light mode at a
clean window size; a dark-mode variant is a nice bonus.

- `landing.png` — the marketing landing page
- `dashboard.png` — /dashboard with the AI insight card + stat tiles + requirements ring
- `planner.png` — /plan with courses across terms + a validation issue visible
- `chat.png` — /chat mid-conversation showing numbered citation chips
- `map.png` — /map prerequisite DAG with a course selected (chain highlighted)
- `course.png` — /courses/COMP%20472 showing difficulty votes + reviews + AI summary

Quick way to get a populated demo to screenshot:

```bash
npx tsx --import ./scripts/load-env.ts scripts/seed-demo-account.ts   # demo@compass.local / DemoCompass!2026
npm run seed:user-plan -- --email demo@compass.local                  # gives it a sample plan
npm run dev                                                            # then log in + capture
```
